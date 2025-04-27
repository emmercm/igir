#include <napi.h>
#include "deps/zlib/zlib.h"
#include <vector>
#include <memory>
#include <sstream>

// https://github.com/tikki/trrntzip/blob/a9a7955442e2160175d673a7f54ac6f5c493230f/src/zip.c#L71-L77
#ifndef DEF_MEM_LEVEL
#if MAX_MEM_LEVEL >= 8
#  define DEF_MEM_LEVEL 8
#else
#  define DEF_MEM_LEVEL  MAX_MEM_LEVEL
#endif
#endif

Napi::String GetZlibVersion(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), zlibVersion());
}

class Deflater : public Napi::ObjectWrap<Deflater> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  Deflater(const Napi::CallbackInfo& info);
  ~Deflater();

private:
  static Napi::FunctionReference constructor;
  z_stream stream_;
  bool initialized_ = false;

  Napi::Value CompressChunk(const Napi::CallbackInfo& info);
  Napi::Value End(const Napi::CallbackInfo& info);
};

Napi::FunctionReference Deflater::constructor;

Napi::Object Deflater::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "Deflater", {
    InstanceMethod("compressChunk", &Deflater::CompressChunk),
    InstanceMethod("end", &Deflater::End),
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();
  exports.Set("Deflater", func);
  return exports;
}

Deflater::Deflater(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Deflater>(info) {
  Napi::Env env = info.Env();
  int level = Z_DEFAULT_COMPRESSION;

  if (info.Length() > 0 && info[0].IsNumber()) {
    level = info[0].As<Napi::Number>().Int32Value();
  }

  stream_.zalloc = Z_NULL;
  stream_.zfree = Z_NULL;
  stream_.opaque = Z_NULL;

  int ret = deflateInit2(&stream_, level, Z_DEFLATED, -MAX_WBITS, 8, Z_DEFAULT_STRATEGY);
  if (ret != Z_OK) {
    Napi::Error::New(env, "deflateInit2 failed").ThrowAsJavaScriptException();
    return;
  }

  initialized_ = true;
}

Deflater::~Deflater() {
  if (initialized_) {
    deflateEnd(&stream_);
  }
}

std::string ZlibErrorToString(int ret) {
  switch (ret) {
    case Z_OK: return "Z_OK: Success";
    case Z_ERRNO: return "Z_ERRNO: System error";
    case Z_STREAM_ERROR: return "Z_STREAM_ERROR: Invalid compression state";
    case Z_DATA_ERROR: return "Z_DATA_ERROR: Invalid or incomplete data";
    case Z_MEM_ERROR: return "Z_MEM_ERROR: Memory allocation error";
    case Z_BUF_ERROR: return "Z_BUF_ERROR: Insufficient buffer space";
    case Z_VERSION_ERROR: return "Z_VERSION_ERROR: Version mismatch";
    default: return "Unknown error: " + std::to_string(ret);
  }
}

Napi::Value Deflater::CompressChunk(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!initialized_) {
    Napi::Error::New(env, "Deflater not initialized").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "First argument must be a Buffer").ThrowAsJavaScriptException();
    return env.Null();
  }

  int flush = Z_NO_FLUSH;  // Default to no flush
  if (info.Length() > 1 && info[1].IsNumber()) {
    flush = info[1].As<Napi::Number>().Int32Value();
  }

  Napi::Buffer<uint8_t> input = info[0].As<Napi::Buffer<uint8_t>>();
  stream_.next_in = input.Data();
  stream_.avail_in = input.Length();

  std::vector<uint8_t> output;
  std::vector<uint8_t> chunk(1024); // temporary buffer

  do {
    stream_.next_out = chunk.data();
    stream_.avail_out = chunk.size();

    int ret = deflate(&stream_, flush);  // Perform the compression

    if (ret != Z_OK && ret != Z_STREAM_END) {
      std::ostringstream msg;
      msg << "deflate failed with code " << ret << ": " << ZlibErrorToString(ret);
      Napi::Error::New(env, msg.str()).ThrowAsJavaScriptException();
      return env.Null();
    }

    size_t have = chunk.size() - stream_.avail_out;
    output.insert(output.end(), chunk.data(), chunk.data() + have);

    // If the stream is finished, break out of the loop
    if (ret == Z_STREAM_END) break;

  } while (stream_.avail_out == 0); // Loop until buffer is full

  return Napi::Buffer<uint8_t>::Copy(env, output.data(), output.size());
}

Napi::Value Deflater::End(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (initialized_) {
    deflateEnd(&stream_);
    initialized_ = false;
  }
  return env.Null();
}

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  Deflater::Init(env, exports);
  exports.Set("getZlibVersion", Napi::Function::New(env, GetZlibVersion));
  return exports;
}

NODE_API_MODULE(zlib_1_1_3, InitAll)
