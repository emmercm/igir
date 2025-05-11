#include <napi.h>
#include <vector>
#include <memory>
#include <mutex>
#include <cstring>
#include "deps/zstd/lib/zstd.h"

// Promise-based worker for compression operations
class CompressPromiseWorker : public Napi::AsyncWorker {
public:
    CompressPromiseWorker(std::shared_ptr<Napi::Promise::Deferred> deferred,
                          std::vector<uint8_t> input,
                          ZSTD_CCtx* cctx,
                          ZSTD_EndDirective endOp)
        : Napi::AsyncWorker(deferred->Env()),
          deferred_(deferred),
          input_(std::move(input)),
          cctx_(cctx),
          endOp_(endOp),
          result_() {
        // Preallocate the result buffer to minimize reallocations during runtime
        size_t outSize = input_.size() > 0 ? ZSTD_compressBound(input_.size())
                                           : (endOp == ZSTD_e_end ? ZSTD_CStreamOutSize() : 0);
        result_.reserve(outSize);
    }

    ~CompressPromiseWorker() {}

    void Execute() override {
        // Check if context is valid
        if (!cctx_) {
            SetError("Compression context is no longer valid");
            return;
        }

        // Setup input buffer
        ZSTD_inBuffer inBuff = { input_.data(), input_.size(), 0 };

        // Use a fixed output buffer size that's efficient for zstd
        const size_t outBuffSize = ZSTD_CStreamOutSize();
        std::vector<uint8_t> outBuffer(outBuffSize);

        // Process based on the end directive
        if (endOp_ == ZSTD_e_end) {
            // First flush any pending data
            bool flushFinished = false;
            while (!flushFinished) {
                ZSTD_outBuffer outBuff = { outBuffer.data(), outBuffer.size(), 0 };

                size_t const flushRemaining = ZSTD_compressStream2(cctx_, &outBuff, &inBuff, ZSTD_e_flush);

                if (ZSTD_isError(flushRemaining)) {
                    SetError(std::string("Flush error: ") + ZSTD_getErrorName(flushRemaining));
                    return;
                }

                if (outBuff.pos > 0) {
                    size_t currentSize = result_.size();
                    result_.resize(currentSize + outBuff.pos);
                    std::memcpy(result_.data() + currentSize, outBuff.dst, outBuff.pos);
                }

                // Flush is complete when remaining is 0
                flushFinished = (flushRemaining == 0);
            }

            // Now do the end operation
            bool endFinished = false;
            while (!endFinished) {
                ZSTD_outBuffer outBuff = { outBuffer.data(), outBuffer.size(), 0 };

                size_t const endRemaining = ZSTD_compressStream2(cctx_, &outBuff, &inBuff, ZSTD_e_end);

                if (ZSTD_isError(endRemaining)) {
                    SetError(std::string("End error: ") + ZSTD_getErrorName(endRemaining));
                    return;
                }

                if (outBuff.pos > 0) {
                    size_t currentSize = result_.size();
                    result_.resize(currentSize + outBuff.pos);
                    std::memcpy(result_.data() + currentSize, outBuff.dst, outBuff.pos);
                }

                // End is complete when remaining is 0
                endFinished = (endRemaining == 0);
            }

            // Free the context after successful end operation
            if (cctx_) {
                ZSTD_freeCCtx(cctx_);
                cctx_ = nullptr;
            }
        } else {
            // Regular compression operation
            while (inBuff.pos < inBuff.size) {
                ZSTD_outBuffer outBuff = { outBuffer.data(), outBuffer.size(), 0 };

                size_t const remaining = ZSTD_compressStream2(cctx_, &outBuff, &inBuff, endOp_);

                if (ZSTD_isError(remaining)) {
                    SetError(std::string("Compression error: ") + ZSTD_getErrorName(remaining));
                    return;
                }

                if (outBuff.pos > 0) {
                    size_t currentSize = result_.size();
                    result_.resize(currentSize + outBuff.pos);
                    std::memcpy(result_.data() + currentSize, outBuff.dst, outBuff.pos);
                }
            }
        }
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        deferred_->Resolve(Napi::Buffer<uint8_t>::Copy(Env(), result_.data(), result_.size()));
    }

    void OnError(const Napi::Error& e) override {
        Napi::HandleScope scope(Env());
        deferred_->Reject(e.Value());
    }

private:
    std::shared_ptr<Napi::Promise::Deferred> deferred_;
    std::vector<uint8_t> input_;
    ZSTD_CCtx* cctx_;
    ZSTD_EndDirective endOp_;
    std::vector<uint8_t> result_;
};

Napi::String GetZstdVersion(const Napi::CallbackInfo& info) {
    return Napi::String::New(info.Env(), ZSTD_versionString());
}

class ThreadedCompressor : public Napi::ObjectWrap<ThreadedCompressor> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    ThreadedCompressor(const Napi::CallbackInfo& info);
    ~ThreadedCompressor();

private:
    static Napi::FunctionReference constructor;

    // Promise-based methods
    Napi::Value CompressChunk(const Napi::CallbackInfo& info);
    Napi::Value End(const Napi::CallbackInfo& info);

    // Thread safety
    std::mutex mutex_;
    ZSTD_CCtx* cctx_;
    bool finalized_;
    size_t outBufferSize_;
};

Napi::FunctionReference ThreadedCompressor::constructor;

Napi::Object ThreadedCompressor::Init(Napi::Env env, Napi::Object exports) {
    // Define the class and its promise-based methods
    Napi::Function func = DefineClass(env, "ThreadedCompressor", {
        InstanceMethod("compressChunk", &ThreadedCompressor::CompressChunk),
        InstanceMethod("end", &ThreadedCompressor::End),
    });

    // Set the constructor as a static reference for future use
    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    // Expose the class to JavaScript/Node.js
    exports.Set("ThreadedCompressor", func);
    return exports;
}

ThreadedCompressor::ThreadedCompressor(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<ThreadedCompressor>(info), cctx_(nullptr), finalized_(false) {

    Napi::Env env = info.Env();
    int compressionLevel = 3;  // Default compression level
    int threadCount = 0;       // Default non-multi-threaded mode

    // Parse options object if provided
    if (info.Length() > 0 && info[0].IsObject()) {
        Napi::Object options = info[0].As<Napi::Object>();

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
    cctx_ = ZSTD_createCCtx();
    if (!cctx_) {
        Napi::Error::New(env, "Failed to create ZSTD_CCtx").ThrowAsJavaScriptException();
        return;
    }

    // Set compression level with error checking
    size_t result = ZSTD_CCtx_setParameter(cctx_, ZSTD_c_compressionLevel, compressionLevel);
    if (ZSTD_isError(result)) {
        ZSTD_freeCCtx(cctx_);
        cctx_ = nullptr;
        Napi::Error::New(env, std::string("Failed to set compression level: ") +
            ZSTD_getErrorName(result)).ThrowAsJavaScriptException();
        return;
    }

    // Set thread count if specified (for multithreaded compression)
    if (threadCount > 0) {
        result = ZSTD_CCtx_setParameter(cctx_, ZSTD_c_nbWorkers, threadCount);
        if (ZSTD_isError(result)) {
            ZSTD_freeCCtx(cctx_);
            cctx_ = nullptr;
            Napi::Error::New(env, std::string("Failed to set worker threads: ") +
                ZSTD_getErrorName(result)).ThrowAsJavaScriptException();
            return;
        }
    }

    outBufferSize_ = ZSTD_CStreamOutSize();
}

ThreadedCompressor::~ThreadedCompressor() {
    std::lock_guard<std::mutex> lock(mutex_);

    if (cctx_) {
        ZSTD_freeCCtx(cctx_);
        cctx_ = nullptr;
    }

    finalized_ = true;
}

Napi::Value ThreadedCompressor::CompressChunk(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Lock to ensure thread safety
    std::lock_guard<std::mutex> lock(mutex_);

    if (finalized_ || !cctx_) {
        Napi::Error::New(env, "Compressor has been finalized").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Expected a Buffer").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Buffer<uint8_t> inputBuffer = info[0].As<Napi::Buffer<uint8_t>>();

    // Create a deferred promise
    auto deferred = std::make_shared<Napi::Promise::Deferred>(env);

    // Copy the data to avoid issues with buffer being modified
    std::vector<uint8_t> dataCopy;
    dataCopy.reserve(inputBuffer.Length());  // Pre-allocate to avoid resizing
    dataCopy.assign(inputBuffer.Data(), inputBuffer.Data() + inputBuffer.Length());

    // Create and schedule the promise worker
    CompressPromiseWorker* worker = new CompressPromiseWorker(
        deferred,
        std::move(dataCopy),
        cctx_,
        ZSTD_e_continue
    );
    worker->Queue();

    return deferred->Promise();
}

Napi::Value ThreadedCompressor::End(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Lock to ensure thread safety
    std::lock_guard<std::mutex> lock(mutex_);

    if (finalized_ || !cctx_) {
        // Already finalized, return resolved promise with empty buffer
        auto deferred = std::make_shared<Napi::Promise::Deferred>(env);
        deferred->Resolve(Napi::Buffer<uint8_t>::New(env, 0));
        return deferred->Promise();
    }

    // Create a deferred promise
    auto deferred = std::make_shared<Napi::Promise::Deferred>(env);

    // Create empty vector for end operation
    std::vector<uint8_t> emptyData;

    // Store the context locally so worker can use it
    ZSTD_CCtx* ctx_for_worker = cctx_;
    cctx_ = nullptr;  // Clear our pointer to avoid double-free

    // Mark as finalized to prevent further operations
    finalized_ = true;

    // Create and schedule the promise worker
    CompressPromiseWorker* worker = new CompressPromiseWorker(
        deferred,
        std::move(emptyData),
        ctx_for_worker,
        ZSTD_e_end
    );
    worker->Queue();

    return deferred->Promise();
}

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    ThreadedCompressor::Init(env, exports);
    exports.Set("getZstdVersion", Napi::Function::New(env, GetZstdVersion));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll)
