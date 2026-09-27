#include <napi.h>

#include <cstring>
#include <deque>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "deps/zstd/lib/zstd.h"

/*
 *   _____ _
 *  / ____| |
 * | (___ | |_ _ __ ___  __ _ _ __ ___
 *  \___ \| __| '__/ _ \/ _` | '_ ` _ \
 *  ____) | |_| | |  __/ (_| | | | | | |
 * |_____/ \__|_|  \___|\__,_|_| |_| |_|
 */

// One compressChunk(), decompressChunk() or end() call
template <typename Context>
struct StreamOp {
    napi_deferred deferred = nullptr;
    std::vector<uint8_t> input;
    bool end = false;
    // Keeps the context alive until this operation is done, even if end() or the stream's
    // destruction released the stream's hold on it
    std::shared_ptr<Context> context;
};

// Append everything in the output buffer written so far to result
static void AppendOutput(const ZSTD_outBuffer& outBuff, std::vector<uint8_t>& result) {
    if (outBuff.pos > 0) {
        size_t const currentSize = result.size();
        result.resize(currentSize + outBuff.pos);
        std::memcpy(result.data() + currentSize, outBuff.dst, outBuff.pos);
    }
}

// Reject a promise with a new Error, returning whether JavaScript could receive it
static bool RejectWithError(napi_env env, napi_deferred deferred, const std::string& message) {
    napi_value text = nullptr;
    napi_value error = nullptr;
    return napi_create_string_utf8(env, message.data(), message.size(), &text) == napi_ok &&
           napi_create_error(env, nullptr, text, &error) == napi_ok &&
           napi_reject_deferred(env, deferred, error) == napi_ok;
}

// Runs one StreamOp on the thread pool with Derived's Process(), then tells the stream the
// operation is done. Derived must expose:
//   static std::string Derived::Process(Context*, const std::vector<uint8_t>& input, bool end,
//                                       std::vector<uint8_t>& result);  // worker thread
//
// Uses the N-API C functions rather than Napi::AsyncWorker: with C++ exceptions disabled,
// node-addon-api aborts the process when a call fails, and every call can fail once a terminated
// Worker's environment can no longer run JavaScript.
template <typename Stream, typename Derived, typename Context>
class StreamWorker {
   public:
    ~StreamWorker() = default;
    StreamWorker(const StreamWorker&) = delete;
    StreamWorker& operator=(const StreamWorker&) = delete;
    StreamWorker(StreamWorker&&) = delete;
    StreamWorker& operator=(StreamWorker&&) = delete;

    // Queue an operation on the thread pool, returning whether it was queued
    static bool Queue(napi_env env, std::shared_ptr<Stream*> stream, StreamOp<Context> op) {
        auto worker = std::unique_ptr<StreamWorker>(new StreamWorker(std::move(stream), std::move(op)));
        napi_value name = nullptr;
        if (napi_create_string_utf8(env, "zstd", NAPI_AUTO_LENGTH, &name) != napi_ok ||
            napi_create_async_work(env, nullptr, name, Execute, Complete, worker.get(), &worker->work_) != napi_ok) {
            return false;
        }
        if (napi_queue_async_work(env, worker->work_) != napi_ok) {
            napi_delete_async_work(env, worker->work_);
            return false;
        }
        worker.release();  // freed by Complete()
        return true;
    }

   private:
    StreamWorker(std::shared_ptr<Stream*> stream, StreamOp<Context> op)
        : stream_(std::move(stream)), op_(std::move(op)) {}

    static void Execute(napi_env /*env*/, void* data) {
        auto* worker = static_cast<StreamWorker*>(data);
        worker->error_ =
            Derived::Process(worker->op_.context.get(), worker->op_.input, worker->op_.end, worker->result_);
    }

    // Settle the operation's promise and tell the stream, unless the stream was destroyed or
    // JavaScript can't run. The stream holds a Ref() while operations run, so only an environment
    // tearing down, such as a terminated Worker's, destroys it first: that finalizes every object
    // before it runs the callbacks of operations still in flight, and nothing is left to receive
    // their results.
    static void Complete(napi_env env, napi_status status, void* data) {
        std::unique_ptr<StreamWorker> const worker(static_cast<StreamWorker*>(data));
        napi_delete_async_work(env, worker->work_);
        if (status == napi_cancelled || *worker->stream_ == nullptr || !worker->Settle(env)) {
            return;
        }
        (*worker->stream_)->FinishOp();  // may release the stream
    }

    // Resolve or reject the operation's promise, returning whether JavaScript could receive it
    bool Settle(napi_env env) {
        napi_handle_scope scope = nullptr;
        if (napi_open_handle_scope(env, &scope) != napi_ok) {
            return false;
        }
        bool settled = false;
        if (error_.empty()) {
            void* copy = nullptr;
            napi_value buffer = nullptr;
            settled = napi_create_buffer_copy(env, result_.size(), result_.data(), &copy, &buffer) == napi_ok &&
                      napi_resolve_deferred(env, op_.deferred, buffer) == napi_ok;
        } else {
            settled = RejectWithError(env, op_.deferred, error_);
        }
        napi_close_handle_scope(env, scope);
        return settled;
    }

    // Cleared by the stream's destructor
    std::shared_ptr<Stream*> stream_;
    StreamOp<Context> op_;
    napi_async_work work_ = nullptr;
    std::vector<uint8_t> result_;
    // Empty on success
    std::string error_;
};

// CRTP base for a compression or decompression stream. Each Derived constructor stores the
// context it streams through in context_.
//
// A streaming context is stateful, so operations run one at a time, in the order they were
// called. Each operation holds the context, so it is freed on the main thread only once neither
// the stream nor any operation does. Ref()/Unref() keep the object alive while operations run.
template <typename Derived, typename Context>
class StreamBase : public Napi::ObjectWrap<Derived> {
   public:
    explicit StreamBase(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<Derived>(info), self_(std::make_shared<StreamBase*>(this)) {}

    ~StreamBase() override { *self_ = nullptr; }

    StreamBase(const StreamBase&) = delete;
    StreamBase& operator=(const StreamBase&) = delete;
    StreamBase(StreamBase&&) = delete;
    StreamBase& operator=(StreamBase&&) = delete;

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

   protected:
    // Queue an operation on the context, to run once every operation before it is done. end()
    // releases this stream's hold on the context, so the operation holding it last frees it.
    Napi::Value Enqueue(Napi::Env env, std::vector<uint8_t> input, bool end) {
        napi_deferred deferred = nullptr;
        napi_value promise = nullptr;
        NAPI_THROW_IF_FAILED(env, napi_create_promise(env, &deferred, &promise), Napi::Value());
        pending_.push_back(StreamOp<Context>{deferred, std::move(input), end, context_});
        if (end) {
            context_.reset();
        }
        if (!running_) {
            running_ = true;
            this->Ref();  // keep this object alive while operations run
            RunNext();
        }
        return {env, promise};
    }

    // Empty after end(), and after a constructor that threw, whose object JavaScript never receives
    std::shared_ptr<Context> context_;

   private:
    // Queue the oldest pending operation, rejecting any that can't be queued
    void RunNext() {
        while (!pending_.empty()) {
            StreamOp<Context> op = std::move(pending_.front());
            pending_.pop_front();
            napi_deferred deferred = op.deferred;
            if (StreamWorker<StreamBase, Derived, Context>::Queue(this->Env(), self_, std::move(op))) {
                return;
            }
            RejectWithError(this->Env(), deferred, "failed to queue the operation");
        }
        running_ = false;
        this->Unref();
    }

    // Shared with every worker so they know whether this stream still exists
    std::shared_ptr<StreamBase*> self_;
    std::deque<StreamOp<Context>> pending_;
    bool running_ = false;
};

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

class ThreadedCompressor : public StreamBase<ThreadedCompressor, ZSTD_CCtx> {
   public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    explicit ThreadedCompressor(const Napi::CallbackInfo& info);

    // Compress input, then end the frame if end, returning an error message or an empty string
    static std::string Process(ZSTD_CCtx* cctx, const std::vector<uint8_t>& input, bool end,
                               std::vector<uint8_t>& result);

   private:
    Napi::Value CompressChunk(const Napi::CallbackInfo& info);
    Napi::Value End(const Napi::CallbackInfo& info);
};

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

ThreadedCompressor::ThreadedCompressor(const Napi::CallbackInfo& info) : StreamBase(info) {
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

    context_ = std::move(cctx);
}

std::string ThreadedCompressor::Process(ZSTD_CCtx* cctx, const std::vector<uint8_t>& input, bool end,
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

Napi::Value ThreadedCompressor::CompressChunk(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();

    if (!context_) {
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

    if (!context_) {
        // Already finalized, return resolved promise with empty buffer
        Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
        deferred.Resolve(Napi::Buffer<uint8_t>::New(env, 0));
        return deferred.Promise();
    }

    return Enqueue(env, {}, true);
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
 *  _____
 * |  __ \
 * | |  | | ___  ___ ___  _ __ ___  _ __  _ __ ___  ___ ___  ___  _ __
 * | |  | |/ _ \/ __/ _ \| '_ ` _ \| '_ \| '__/ _ \/ __/ __|/ _ \| '__|
 * | |__| |  __/ (_| (_) | | | | | | |_) | | |  __/\__ \__ \ (_) | |
 * |_____/ \___|\___\___/|_| |_| |_| .__/|_|  \___||___/___/\___/|_|
 *                                 | |
 *                                 |_|
 */

class Decompressor : public StreamBase<Decompressor, ZSTD_DCtx> {
   public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function const func = DefineClass(env, "Decompressor",
                                                {
                                                    InstanceMethod("decompressChunk", &Decompressor::DecompressChunk),
                                                    InstanceMethod("end", &Decompressor::End),
                                                });
        exports.Set("Decompressor", func);
        return exports;
    }

    explicit Decompressor(const Napi::CallbackInfo& info) : StreamBase(info) {
        std::shared_ptr<ZSTD_DCtx> dctx(ZSTD_createDCtx(), ZSTD_freeDCtx);
        if (!dctx) {
            Napi::Error::New(info.Env(), "Failed to create ZSTD_DCtx").ThrowAsJavaScriptException();
            return;
        }
        context_ = std::move(dctx);
    }

    // Decompress input, returning an error message or an empty string. The frame isn't checked
    // for truncation at the end.
    static std::string Process(ZSTD_DCtx* dctx, const std::vector<uint8_t>& input, bool /*end*/,
                               std::vector<uint8_t>& result) {
        ZSTD_inBuffer inBuff = {.src = input.data(), .size = input.size(), .pos = 0};
        std::vector<uint8_t> tempBuffer(ZSTD_DStreamOutSize());

        while (inBuff.pos < inBuff.size) {
            ZSTD_outBuffer outBuff = {.dst = tempBuffer.data(), .size = tempBuffer.size(), .pos = 0};
            size_t const ret = ZSTD_decompressStream(dctx, &outBuff, &inBuff);
            if (ZSTD_isError(ret)) {
                return std::string("Decompression error: ") + ZSTD_getErrorName(ret);
            }
            AppendOutput(outBuff, result);
        }
        return {};
    }

   private:
    Napi::Value DecompressChunk(const Napi::CallbackInfo& info) {
        Napi::Env const env = info.Env();

        if (!context_) {
            Napi::Error::New(env, "Decompressor finalized").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        if (info.Length() < 1 || !info[0].IsBuffer()) {
            Napi::TypeError::New(env, "Expected a Buffer").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        auto const inputBuffer = info[0].As<Napi::Buffer<uint8_t>>();
        return Enqueue(env, std::vector<uint8_t>(inputBuffer.Data(), inputBuffer.Data() + inputBuffer.Length()), false);
    }

    Napi::Value End(const Napi::CallbackInfo& info) {
        Napi::Env const env = info.Env();

        if (!context_) {
            Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
            deferred.Resolve(Napi::Buffer<uint8_t>::New(env, 0));
            return deferred.Promise();
        }

        return Enqueue(env, {}, true);
    }
};

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
    Decompressor::Init(env, exports);
    exports.Set("compressNonThreaded", Napi::Function::New(env, CompressNonThreaded));
    exports.Set("getZstdVersion", Napi::Function::New(env, GetZstdVersion));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll)
