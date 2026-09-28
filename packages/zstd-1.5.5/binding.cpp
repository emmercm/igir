#include <napi.h>

#include <cstring>
#include <deque>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "deps/zstd/lib/zstd.h"

/*
 *   _____
 *  / ____|
 * | |     ___  _ __ ___  _ __  _ __ ___  ___ ___  ___  _ __
 * | |    / _ \| '_ ` _ \| '_ \| '__/ _ \/ __/ __|/ _ \| '__|
 * | |___| (_) | | | | | | |_) | | |  __/\__ \__ \ (_) | |
 *  \_____\___/|_| |_| |_| .__/|_|  \___||___/___/\___/|_|
 *                       | |
 *                       |_|
 */

static Napi::String GetZstdVersion(const Napi::CallbackInfo& info) {
    return Napi::String::New(info.Env(), ZSTD_versionString());
}

// One compressChunk() or end() call. `deferred` has no default member initializer because Deferred
// has no default constructor, constructing one creating a promise; Enqueue() always sets it.
struct CompressOp {  // NOLINT(cppcoreguidelines-pro-type-member-init)
    Napi::Promise::Deferred deferred;
    std::vector<uint8_t> input;
    bool end = false;
    // Keeps the context alive until this operation is done, even if end() or the compressor's
    // destruction released the compressor's hold on it
    std::shared_ptr<ZSTD_CCtx> cctx;
};

// Append everything in the output buffer written so far to result
static void AppendOutput(const ZSTD_outBuffer& outBuff, std::vector<uint8_t>& result) {
    if (outBuff.pos > 0) {
        size_t const currentSize = result.size();
        result.resize(currentSize + outBuff.pos);
        std::memcpy(result.data() + currentSize, outBuff.dst, outBuff.pos);
    }
}

// Compress input, then end the frame if end, returning an error message or an empty string
static std::string Compress(ZSTD_CCtx* cctx, const std::vector<uint8_t>& input, bool end,
                            std::vector<uint8_t>& result) {
    // Preallocate the result buffer to minimize reallocations during runtime
    if (!input.empty()) {
        // The bound is an error code, not a size, for input past ZSTD_MAX_INPUT_SIZE; the
        // reservation is only a hint, so skip it then
        size_t const bound = ZSTD_compressBound(input.size());
        result.reserve(ZSTD_isError(bound) ? 0 : bound);
    } else if (end) {
        result.reserve(ZSTD_CStreamOutSize());
    }

    // Setup input buffer
    ZSTD_inBuffer inBuff = {.src = input.data(), .size = input.size(), .pos = 0};

    // Use a fixed output buffer size that's efficient for zstd
    std::vector<uint8_t> outBuffer(ZSTD_CStreamOutSize());

    // Regular compression operation
    while (inBuff.pos < inBuff.size) {
        ZSTD_outBuffer outBuff = {.dst = outBuffer.data(), .size = outBuffer.size(), .pos = 0};
        size_t const remaining = ZSTD_compressStream2(cctx, &outBuff, &inBuff, ZSTD_e_continue);
        if (ZSTD_isError(remaining)) {
            return std::string("Compression error: ") + ZSTD_getErrorName(remaining);
        }
        AppendOutput(outBuff, result);
    }

    if (!end) {
        return {};
    }

    // First flush any pending data
    bool flushFinished = false;
    while (!flushFinished) {
        ZSTD_outBuffer outBuff = {.dst = outBuffer.data(), .size = outBuffer.size(), .pos = 0};
        size_t const flushRemaining = ZSTD_compressStream2(cctx, &outBuff, &inBuff, ZSTD_e_flush);
        if (ZSTD_isError(flushRemaining)) {
            return std::string("Flush error: ") + ZSTD_getErrorName(flushRemaining);
        }
        AppendOutput(outBuff, result);
        // Flush is complete when remaining is 0
        flushFinished = (flushRemaining == 0);
    }

    // Now do the end operation
    bool endFinished = false;
    while (!endFinished) {
        ZSTD_outBuffer outBuff = {.dst = outBuffer.data(), .size = outBuffer.size(), .pos = 0};
        size_t const endRemaining = ZSTD_compressStream2(cctx, &outBuff, &inBuff, ZSTD_e_end);
        if (ZSTD_isError(endRemaining)) {
            return std::string("End error: ") + ZSTD_getErrorName(endRemaining);
        }
        AppendOutput(outBuff, result);
        endFinished = (endRemaining == 0);
    }
    return {};
}

// Create and queue a worker, which deletes itself once OnOK() or OnError() has run. A worker that
// cannot be created or queued throws a Napi::Error instead, having been freed.
template <typename Worker, typename... Args>
static void QueueWorker(Args&&... args) {
    auto* const worker = new Worker(std::forward<Args>(args)...);
    try {
        worker->Queue();
    } catch (...) {
        delete worker;
        throw;
    }
}

class ThreadedCompressor;

// Runs one CompressOp on the thread pool, then tells the compressor the operation is done
class CompressWorker : public Napi::AsyncWorker {
   public:
    CompressWorker(Napi::Env env, std::shared_ptr<ThreadedCompressor*> compressor, CompressOp op)
        : Napi::AsyncWorker(env), compressor_(std::move(compressor)), op_(std::move(op)) {}

    void Execute() override {
        std::string const error = Compress(op_.cctx.get(), op_.input, op_.end, result_);
        if (!error.empty()) {
            SetError(error);
        }
    }

    void OnOK() override {
        op_.deferred.Resolve(Napi::Buffer<uint8_t>::Copy(Env(), result_.data(), result_.size()));
        NotifyCompressor();
    }

    void OnError(const Napi::Error& e) override {
        op_.deferred.Reject(e.Value());
        NotifyCompressor();
    }

   private:
    // Tell the compressor the operation is done, unless it was destroyed. The compressor holds a
    // Ref() while operations run, so only an environment tearing down, such as a terminated
    // Worker's, destroys it first.
    void NotifyCompressor();

    // Cleared by the compressor's destructor
    std::shared_ptr<ThreadedCompressor*> compressor_;
    CompressOp op_;
    std::vector<uint8_t> result_;
};

// A streaming context is stateful, so operations run one at a time, in the order they were
// called. Each operation holds the context, so it is freed on the main thread only once neither
// the compressor nor any operation does. Ref()/Unref() keep the object alive while operations run.
class ThreadedCompressor : public Napi::ObjectWrap<ThreadedCompressor> {
   public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    explicit ThreadedCompressor(const Napi::CallbackInfo& info);

    ~ThreadedCompressor() override { *self_ = nullptr; }

    ThreadedCompressor(const ThreadedCompressor&) = delete;
    ThreadedCompressor& operator=(const ThreadedCompressor&) = delete;
    ThreadedCompressor(ThreadedCompressor&&) = delete;
    ThreadedCompressor& operator=(ThreadedCompressor&&) = delete;

    // Start the next pending operation, or release this object if there is none. Called on the
    // main thread by the operation's worker after its promise is settled.
    void FinishOp() {
        if (pending_.empty()) {
            running_ = false;
            this->Unref();  // balances the Ref() taken in Enqueue(); may allow GC of this object
            return;
        }
        RunNext();
    }

   private:
    Napi::Value CompressChunk(const Napi::CallbackInfo& info);
    Napi::Value End(const Napi::CallbackInfo& info);

    // Queue an operation on the context, to run once every operation before it is done. end()
    // releases this compressor's hold on the context, so the operation holding it last frees it.
    Napi::Value Enqueue(Napi::Env env, std::vector<uint8_t>&& input, bool end);

    // Queue the oldest pending operation
    void RunNext();

    // Empty after end(), and after a constructor that threw, whose object JavaScript never receives
    std::shared_ptr<ZSTD_CCtx> cctx_;
    // Shared with every worker so they know whether this compressor still exists
    std::shared_ptr<ThreadedCompressor*> self_;
    std::deque<CompressOp> pending_;
    bool running_ = false;
};

void CompressWorker::NotifyCompressor() {
    if (*compressor_ != nullptr) {
        (*compressor_)->FinishOp();  // may release the compressor
    }
}

Napi::Object ThreadedCompressor::Init(Napi::Env env, Napi::Object exports) {
    // Define the class and its promise-based methods
    Napi::Function const func = DefineClass(env, "ThreadedCompressor",
                                            {
                                                InstanceMethod("compressChunk", &ThreadedCompressor::CompressChunk),
                                                InstanceMethod("end", &ThreadedCompressor::End),
                                            });

    // Expose the class to JavaScript/Node.js
    exports.Set("ThreadedCompressor", func);
    return exports;
}

ThreadedCompressor::ThreadedCompressor(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<ThreadedCompressor>(info), self_(std::make_shared<ThreadedCompressor*>(this)) {
    Napi::Env const env = info.Env();
    int compressionLevel = 3;  // Default compression level
    int threadCount = 0;       // Default non-multi-threaded mode

    // Parse options object if provided
    if (info.Length() > 0 && info[0].IsObject()) {
        auto const options = info[0].As<Napi::Object>();

        if (options.Has("level") && options.Get("level").IsNumber()) {
            compressionLevel = options.Get("level").As<Napi::Number>().Int32Value();

            // Validate compression level
            if (compressionLevel < 1 || compressionLevel > 22) {
                Napi::RangeError::New(env, "Compression level must be between 1 and 22").ThrowAsJavaScriptException();
                return;
            }
        }

        if (options.Has("threads") && options.Get("threads").IsNumber()) {
            threadCount = options.Get("threads").As<Napi::Number>().Int32Value();

            // Validate thread count
            if (threadCount < 0) {
                Napi::RangeError::New(env, "Thread count must be non-negative").ThrowAsJavaScriptException();
                return;
            }
        }
    } else if (info.Length() > 0 && info[0].IsNumber()) {
        // Legacy mode: just accept compression level
        compressionLevel = info[0].As<Napi::Number>().Int32Value();

        // Validate compression level
        if (compressionLevel < 1 || compressionLevel > 22) {
            Napi::RangeError::New(env, "Compression level must be between 1 and 22").ThrowAsJavaScriptException();
            return;
        }
    }

    // Create the compression context
    std::shared_ptr<ZSTD_CCtx> cctx(ZSTD_createCCtx(), ZSTD_freeCCtx);
    if (!cctx) {
        Napi::Error::New(env, "Failed to create ZSTD_CCtx").ThrowAsJavaScriptException();
        return;
    }

    // Set compression level with error checking
    size_t result = ZSTD_CCtx_setParameter(cctx.get(), ZSTD_c_compressionLevel, compressionLevel);
    if (ZSTD_isError(result)) {
        Napi::Error::New(env, std::string("Failed to set compression level: ") + ZSTD_getErrorName(result))
            .ThrowAsJavaScriptException();
        return;
    }

    // Set thread count if specified (for multithreaded compression)
    if (threadCount > 0) {
        result = ZSTD_CCtx_setParameter(cctx.get(), ZSTD_c_nbWorkers, threadCount);
        if (ZSTD_isError(result)) {
            Napi::Error::New(env, std::string("Failed to set worker threads: ") + ZSTD_getErrorName(result))
                .ThrowAsJavaScriptException();
            return;
        }
    }

    cctx_ = std::move(cctx);
}

Napi::Value ThreadedCompressor::CompressChunk(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();

    if (!cctx_) {
        Napi::Error::New(env, "Compressor has been finalized").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Expected a Buffer").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Copy the data to avoid issues with buffer being modified
    auto const inputBuffer = info[0].As<Napi::Buffer<uint8_t>>();
    return Enqueue(env, std::vector<uint8_t>(inputBuffer.Data(), inputBuffer.Data() + inputBuffer.Length()), false);
}

Napi::Value ThreadedCompressor::End(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();

    if (!cctx_) {
        // Already finalized, return resolved promise with empty buffer
        Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
        deferred.Resolve(Napi::Buffer<uint8_t>::New(env, 0));
        return deferred.Promise();
    }

    return Enqueue(env, {}, true);
}

Napi::Value ThreadedCompressor::Enqueue(Napi::Env env, std::vector<uint8_t>&& input, bool end) {
    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
    Napi::Promise const promise = deferred.Promise();
    pending_.push_back({.deferred = deferred, .input = std::move(input), .end = end, .cctx = cctx_});
    if (end) {
        cctx_.reset();
    }
    if (!running_) {
        running_ = true;
        this->Ref();  // keep this object alive while operations run
        RunNext();
    }
    return promise;
}

void ThreadedCompressor::RunNext() {
    CompressOp op = std::move(pending_.front());
    pending_.pop_front();
    Napi::Promise::Deferred const deferred = op.deferred;
    try {
        QueueWorker<CompressWorker>(this->Env(), self_, std::move(op));
    } catch (const Napi::Error& e) {
        // Later operations would skip this one's input, so fail them too
        deferred.Reject(e.Value());
        for (CompressOp const& skipped : pending_) {
            skipped.deferred.Reject(e.Value());
        }
        pending_.clear();
        running_ = false;
        this->Unref();  // balances the Ref() taken in Enqueue(); may allow GC of this object
    }
}

// Synchronous non-threaded compression
static Napi::Value CompressNonThreaded(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();

    if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected (Buffer input, Number compressionLevel)").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    auto const inputBuffer = info[0].As<Napi::Buffer<uint8_t>>();
    int const compressionLevel = info[1].As<Napi::Number>().Int32Value();

    if (compressionLevel < 1 || compressionLevel > 22) {
        Napi::RangeError::New(env, "Compression level must be between 1 and 22").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // The bound is an error code, not a size, for input past ZSTD_MAX_INPUT_SIZE
    size_t const bound = ZSTD_compressBound(inputBuffer.Length());
    if (ZSTD_isError(bound)) {
        Napi::RangeError::New(env, "Input buffer is too large").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::vector<uint8_t> compressed(bound);

    size_t const compressedSize =
        ZSTD_compress(compressed.data(), compressed.size(), inputBuffer.Data(), inputBuffer.Length(), compressionLevel);

    if (ZSTD_isError(compressedSize)) {
        Napi::Error::New(env, std::string("Compression error: ") + ZSTD_getErrorName(compressedSize))
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    return Napi::Buffer<uint8_t>::Copy(env, compressed.data(), compressedSize);
}

/*
 *  _____       _ _
 * |_   _|     (_) |
 *   | |  _ __  _| |_
 *   | | | '_ \| | __|
 *  _| |_| | | | | |_
 * |_____|_| |_|_|\__|
 */

static Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    ThreadedCompressor::Init(env, exports);
    exports.Set("compressNonThreaded", Napi::Function::New(env, CompressNonThreaded));
    exports.Set("getZstdVersion", Napi::Function::New(env, GetZstdVersion));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll)
