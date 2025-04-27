#include <napi.h>
#include "zstd.h"
#include <vector>
#include <stdexcept>

Napi::String GetZstdVersion(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), ZSTD_versionString());
}

class Compressor : public Napi::ObjectWrap<Compressor> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    Compressor(const Napi::CallbackInfo& info);

private:
    static Napi::FunctionReference constructor;

    Napi::Value CompressChunk(const Napi::CallbackInfo& info);
    Napi::Value End(const Napi::CallbackInfo& info);

    ZSTD_CStream* cstream_;
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
    : Napi::ObjectWrap<Compressor>(info) {
    int compressionLevel = 3;  // Default compression level

    // If a compression level is passed, use it
    if (info.Length() > 0 && info[0].IsNumber()) {
        compressionLevel = info[0].As<Napi::Number>().Int32Value();
    }

    // Create the compression stream
    cstream_ = ZSTD_createCStream();
    if (!cstream_) {
        Napi::Error::New(info.Env(), "Failed to create ZSTD_CStream").ThrowAsJavaScriptException();
        return;
    }

    // Initialize the compression stream with the specified compression level
    size_t initResult = ZSTD_initCStream(cstream_, compressionLevel);
    if (ZSTD_isError(initResult)) {
        Napi::Error::New(info.Env(), ZSTD_getErrorName(initResult)).ThrowAsJavaScriptException();
        return;
    }

    outBufferSize_ = ZSTD_CStreamOutSize();
}

Napi::Value Compressor::CompressChunk(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Expected a Buffer").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Buffer<uint8_t> inputBuffer = info[0].As<Napi::Buffer<uint8_t>>();
    ZSTD_inBuffer in = { inputBuffer.Data(), inputBuffer.Length(), 0 };

    std::vector<uint8_t> outputData;

    while (in.pos < in.size) {
        std::vector<uint8_t> outBuffer(outBufferSize_);
        ZSTD_outBuffer out = { outBuffer.data(), outBuffer.size(), 0 };

        size_t ret = ZSTD_compressStream(cstream_, &out, &in);

        if (ZSTD_isError(ret)) {
            Napi::Error::New(env, ZSTD_getErrorName(ret)).ThrowAsJavaScriptException();
            return env.Null();
        }

        outputData.insert(outputData.end(), outBuffer.data(), outBuffer.data() + out.pos);
    }

    return Napi::Buffer<uint8_t>::Copy(env, outputData.data(), outputData.size());
}

Napi::Value Compressor::End(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::vector<uint8_t> outputData;
    size_t ret;

    do {
        std::vector<uint8_t> outBuffer(outBufferSize_);
        ZSTD_outBuffer out = { outBuffer.data(), outBuffer.size(), 0 };

        ret = ZSTD_endStream(cstream_, &out);

        if (ZSTD_isError(ret)) {
            Napi::Error::New(env, ZSTD_getErrorName(ret)).ThrowAsJavaScriptException();
            return env.Null();
        }

        outputData.insert(outputData.end(), outBuffer.data(), outBuffer.data() + out.pos);
    } while (ret != 0);

    return Napi::Buffer<uint8_t>::Copy(env, outputData.data(), outputData.size());
}

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    // Initialize the Compressor class
    Compressor::Init(env, exports);

    // Expose the GetZstdVersion function as a static method
    exports.Set("getZstdVersion", Napi::Function::New(env, GetZstdVersion));

    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll)
