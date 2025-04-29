#include <napi.h>
#include "deps/zstd/lib/zstd.h"
#include <vector>
#include <stdexcept>

Napi::String GetZstdVersion(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), ZSTD_versionString());
}

class Compressor : public Napi::ObjectWrap<Compressor> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    Compressor(const Napi::CallbackInfo& info);
    ~Compressor();

private:
    static Napi::FunctionReference constructor;

    Napi::Value CompressChunk(const Napi::CallbackInfo& info);
    Napi::Value End(const Napi::CallbackInfo& info);

    ZSTD_CCtx* cctx_;
    size_t outBufferSize_;
};

Napi::FunctionReference Compressor::constructor;

Napi::Object Compressor::Init(Napi::Env env, Napi::Object exports) {
    // Define the class and its methods
    Napi::Function func = DefineClass(env, "Compressor", {
        InstanceMethod("compressChunk", &Compressor::CompressChunk),
        InstanceMethod("end", &Compressor::End),
    });

    // Set the constructor as a static reference for future use
    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    // Expose the class to JavaScript/Node.js
    exports.Set("Compressor", func);
    return exports;
}

Compressor::Compressor(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<Compressor>(info), cctx_(nullptr) {
    int compressionLevel = 3;  // Default compression level

    // If a compression level is passed, use it
    if (info.Length() > 0 && info[0].IsNumber()) {
        compressionLevel = info[0].As<Napi::Number>().Int32Value();

        // Validate compression level
        if (compressionLevel < 1 || compressionLevel > 22) {
            Napi::RangeError::New(info.Env(), "Compression level must be between 1 and 22").ThrowAsJavaScriptException();
            return;
        }
    }

    // Create the compression context
    cctx_ = ZSTD_createCCtx();
    if (!cctx_) {
        Napi::Error::New(info.Env(), "Failed to create ZSTD_CCtx").ThrowAsJavaScriptException();
        return;
    }

    // Set compression parameters
    ZSTD_CCtx_setParameter(cctx_, ZSTD_c_compressionLevel, compressionLevel);

    outBufferSize_ = ZSTD_CStreamOutSize();
}

Compressor::~Compressor() {
    if (cctx_) {
        ZSTD_freeCCtx(cctx_);
        cctx_ = nullptr;
    }
}

Napi::Value Compressor::CompressChunk(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!cctx_) {
        Napi::Error::New(env, "Compressor has been finalized").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Expected a Buffer").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Buffer<uint8_t> inputBuffer = info[0].As<Napi::Buffer<uint8_t>>();

    // Early return for empty input
    if (inputBuffer.Length() == 0) {
        return Napi::Buffer<uint8_t>::New(env, 0);
    }

    // Prepare input buffer
    ZSTD_inBuffer inBuff = { inputBuffer.Data(), inputBuffer.Length(), 0 };

    // Pre-allocate output data with reasonable initial capacity
    std::vector<uint8_t> outputData;
    outputData.reserve(outBufferSize_);

    // Process the input buffer
    while (inBuff.pos < inBuff.size) {
        std::vector<uint8_t> outBuffer(outBufferSize_);
        ZSTD_outBuffer outBuff = { outBuffer.data(), outBuffer.size(), 0 };

        size_t const remaining = ZSTD_compressStream2(cctx_, &outBuff, &inBuff, ZSTD_e_continue);

        if (ZSTD_isError(remaining)) {
            Napi::Error::New(env, ZSTD_getErrorName(remaining)).ThrowAsJavaScriptException();
            return env.Null();
        }

        if (outBuff.pos > 0) {
            outputData.insert(outputData.end(),
                             static_cast<uint8_t*>(outBuff.dst),
                             static_cast<uint8_t*>(outBuff.dst) + outBuff.pos);
        }
    }

    return Napi::Buffer<uint8_t>::Copy(env, outputData.data(), outputData.size());
}

Napi::Value Compressor::End(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!cctx_) {
        // Already finalized, return empty buffer
        return Napi::Buffer<uint8_t>::New(env, 0);
    }

    // Pre-allocate final output buffer
    std::vector<uint8_t> outputData;
    outputData.reserve(outBufferSize_);

    // Feed an explicit empty chunk
    ZSTD_inBuffer emptyInBuff = { nullptr, 0, 0 };

    // First, try a regular flush to get any pending data
    {
        std::vector<uint8_t> flushBuffer(outBufferSize_);
        ZSTD_outBuffer flushOut = { flushBuffer.data(), flushBuffer.size(), 0 };

        ZSTD_compressStream2(cctx_, &flushOut, &emptyInBuff, ZSTD_e_flush);

        if (flushOut.pos > 0) {
            outputData.insert(outputData.end(),
                              static_cast<uint8_t*>(flushOut.dst),
                              static_cast<uint8_t*>(flushOut.dst) + flushOut.pos);
        }
    }

    // Now force end of frame with ZSTD_e_end
    bool endComplete = false;
    while (!endComplete) {
        std::vector<uint8_t> outBuffer(outBufferSize_);
        ZSTD_outBuffer outBuff = { outBuffer.data(), outBuffer.size(), 0 };

        // Use ZSTD_e_end to properly close the frame
        size_t const endResult = ZSTD_compressStream2(cctx_, &outBuff, &emptyInBuff, ZSTD_e_end);

        if (ZSTD_isError(endResult)) {
            Napi::Error::New(env, ZSTD_getErrorName(endResult)).ThrowAsJavaScriptException();
            return env.Null();
        }

        // Add any data produced
        if (outBuff.pos > 0) {
            outputData.insert(outputData.end(),
                             static_cast<uint8_t*>(outBuff.dst),
                             static_cast<uint8_t*>(outBuff.dst) + outBuff.pos);
        }

        // Continue until endResult is 0, indicating frame is complete
        endComplete = (endResult == 0);
    }

    // Clean up the compression context
    ZSTD_freeCCtx(cctx_);
    cctx_ = nullptr;

    return Napi::Buffer<uint8_t>::Copy(env, outputData.data(), outputData.size());
}

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    Compressor::Init(env, exports);
    exports.Set("getZstdVersion", Napi::Function::New(env, GetZstdVersion));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll)
