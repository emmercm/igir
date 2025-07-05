#include <napi.h>
#include "deps/zlib/zlib.h"
#include <vector>
#include <memory>
#include <sstream>

// Memory level constants from zlib
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

class Deflater : public Napi::ObjectWrap<Deflater> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  Deflater(const Napi::CallbackInfo& info);
  ~Deflater();

private:
  static Napi::FunctionReference constructor;
  z_stream stream_;
  bool initialized_ = false;

  // Added chunk size as a member for consistency
  size_t chunkSize_ = 16384; // 16KB default chunk size (better than 1KB)

  Napi::Value CompressChunk(const Napi::CallbackInfo& info);
  Napi::Value End(const Napi::CallbackInfo& info);
  Napi::Value Dispose(const Napi::CallbackInfo& info);
};

Napi::FunctionReference Deflater::constructor;

Napi::Object Deflater::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "Deflater", {
    InstanceMethod("compressChunk", &Deflater::CompressChunk),
    InstanceMethod("end", &Deflater::End),
    InstanceMethod("dispose", &Deflater::Dispose), // New method for resource cleanup
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();
  exports.Set("Deflater", func);
  return exports;
}

Deflater::Deflater(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Deflater>(info) {
  Napi::Env env = info.Env();
  int level = Z_DEFAULT_COMPRESSION;
  int memLevel = DEF_MEM_LEVEL;

  // Parse options
  if (info.Length() > 0) {
    if (info[0].IsNumber()) {
      // Simple compression level as first argument
      level = info[0].As<Napi::Number>().Int32Value();

      // Validate compression level
      if (level < -1 || level > 9) {
        Napi::RangeError::New(env, "Compression level must be between -1 and 9").ThrowAsJavaScriptException();
        return;
      }
    }
    else if (info[0].IsObject()) {
      // Options object
      Napi::Object options = info[0].As<Napi::Object>();

      // Get compression level
      if (options.Has("level") && options.Get("level").IsNumber()) {
        level = options.Get("level").As<Napi::Number>().Int32Value();

        // Validate compression level
        if (level < -1 || level > 9) {
          Napi::RangeError::New(env, "Compression level must be between -1 and 9").ThrowAsJavaScriptException();
          return;
        }
      }

      // Get memory level
      if (options.Has("memLevel") && options.Get("memLevel").IsNumber()) {
        memLevel = options.Get("memLevel").As<Napi::Number>().Int32Value();

        // Validate memory level
        if (memLevel < 1 || memLevel > MAX_MEM_LEVEL) {
          Napi::RangeError::New(env, "Memory level must be between 1 and " + std::to_string(MAX_MEM_LEVEL)).ThrowAsJavaScriptException();
          return;
        }
      }

      // Get chunk size
      if (options.Has("chunkSize") && options.Get("chunkSize").IsNumber()) {
        chunkSize_ = options.Get("chunkSize").As<Napi::Number>().Uint32Value();

        // Validate chunk size
        if (chunkSize_ < 1024 || chunkSize_ > 1024 * 1024 * 10) {
          Napi::RangeError::New(env, "Chunk size must be between 1KB and 10MB").ThrowAsJavaScriptException();
          return;
        }
      }
    }
  }

  // Initialize z_stream structure
  stream_.zalloc = Z_NULL;
  stream_.zfree = Z_NULL;
  stream_.opaque = Z_NULL;

  // Initialize the deflate stream
  // Using -MAX_WBITS for raw deflate (no zlib or gzip header)
  int ret = deflateInit2(&stream_, level, Z_DEFLATED, -MAX_WBITS, memLevel, Z_DEFAULT_STRATEGY);
  if (ret != Z_OK) {
    std::string errorMsg = "deflateInit2 failed: ";
    if (stream_.msg) {
      errorMsg += stream_.msg;
    } else {
      errorMsg += ZlibErrorToString(ret);
    }
    Napi::Error::New(env, errorMsg).ThrowAsJavaScriptException();
    return;
  }

  initialized_ = true;
}

Deflater::~Deflater() {
  if (initialized_) {
    deflateEnd(&stream_);
    initialized_ = false;
  }
}

Napi::Value Deflater::CompressChunk(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Check if the deflater has already been finalized
  if (!initialized_) {
    Napi::Error::New(env, "Deflater has been finalized").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Validate input
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "First argument must be a Buffer").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Parse flush parameter
  int flush = Z_NO_FLUSH;  // Default to no flush
  if (info.Length() > 1 && info[1].IsNumber()) {
    flush = info[1].As<Napi::Number>().Int32Value();

    // Validate flush mode
    if (flush != Z_NO_FLUSH && flush != Z_SYNC_FLUSH && flush != Z_FULL_FLUSH && flush != Z_FINISH) {
      Napi::RangeError::New(env, "Invalid flush mode").ThrowAsJavaScriptException();
      return env.Null();
    }
  }

  // Get input buffer
  Napi::Buffer<uint8_t> input = info[0].As<Napi::Buffer<uint8_t>>();

  // Early return for empty input if not flushing
  if (input.Length() == 0 && flush == Z_NO_FLUSH) {
    return Napi::Buffer<uint8_t>::New(env, 0);
  }

  // Set up input
  stream_.next_in = input.Data();
  stream_.avail_in = input.Length();

  // Pre-allocate output vector with estimated capacity
  // For most data, deflate will reduce size, but for worst case we use input length
  std::vector<uint8_t> output;
  output.reserve(flush == Z_FINISH ? input.Length() * 2 : input.Length());

  // Create temporary buffer for chunk processing
  std::vector<uint8_t> chunk(chunkSize_);

  // Process until all input is consumed and output is generated
  do {
    // Set up output buffer
    stream_.next_out = chunk.data();
    stream_.avail_out = chunk.size();

    // Perform the compression
    int ret = deflate(&stream_, flush);

    // Handle errors
    if (ret != Z_OK && ret != Z_STREAM_END && ret != Z_BUF_ERROR) {
      std::ostringstream msg;
      msg << "deflate failed: ";
      if (stream_.msg) {
        msg << stream_.msg;
      } else {
        msg << ZlibErrorToString(ret);
      }

      Napi::Error::New(env, msg.str()).ThrowAsJavaScriptException();
      return env.Null();
    }

    // Calculate how many bytes were written to the output buffer
    size_t have = chunk.size() - stream_.avail_out;

    if (have > 0) {
      // More efficient append using resize + memcpy
      size_t currentSize = output.size();
      output.resize(currentSize + have);
      memcpy(output.data() + currentSize, chunk.data(), have);
    }

    // Break if we're done (Z_STREAM_END) or there's no more progress on input (Z_BUF_ERROR)
    if (ret == Z_STREAM_END || (ret == Z_BUF_ERROR && stream_.avail_out > 0)) {
      break;
    }

  } while (stream_.avail_in > 0 || stream_.avail_out == 0);

  // Return the compressed data
  return Napi::Buffer<uint8_t>::Copy(env, output.data(), output.size());
}

Napi::Value Deflater::End(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!initialized_) {
    // Already finalized
    return Napi::Buffer<uint8_t>::New(env, 0);
  }

  // Set up for final flush
  stream_.next_in = Z_NULL;
  stream_.avail_in = 0;

  // Pre-allocate output buffer
  std::vector<uint8_t> output;
  output.reserve(chunkSize_);

  // Create temporary buffer for chunk processing
  std::vector<uint8_t> chunk(chunkSize_);

  // Continue until Z_STREAM_END is returned
  int ret;
  do {
    // Set up output buffer
    stream_.next_out = chunk.data();
    stream_.avail_out = chunk.size();

    // Force a final flush
    ret = deflate(&stream_, Z_FINISH);

    // Handle errors
    if (ret != Z_OK && ret != Z_STREAM_END) {
      std::ostringstream msg;
      msg << "deflate finalization failed: ";
      if (stream_.msg) {
        msg << stream_.msg;
      } else {
        msg << ZlibErrorToString(ret);
      }

      Napi::Error::New(env, msg.str()).ThrowAsJavaScriptException();

      // Clean up on error
      deflateEnd(&stream_);
      initialized_ = false;

      return env.Null();
    }

    // Calculate how many bytes were written
    size_t have = chunk.size() - stream_.avail_out;

    if (have > 0) {
      // More efficient append
      size_t currentSize = output.size();
      output.resize(currentSize + have);
      memcpy(output.data() + currentSize, chunk.data(), have);
    }

  } while (ret != Z_STREAM_END);

  // Clean up
  deflateEnd(&stream_);
  initialized_ = false;

  // Return the final compressed data
  return Napi::Buffer<uint8_t>::Copy(env, output.data(), output.size());
}

Napi::Value Deflater::Dispose(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Just clean up resources without trying to get final data
  if (initialized_) {
    deflateEnd(&stream_);
    initialized_ = false;
  }

  return env.Undefined();
}

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  Deflater::Init(env, exports);
  exports.Set("getZlibVersion", Napi::Function::New(env, GetZlibVersion));

  // Add constants for flush modes
  exports.Set("Z_NO_FLUSH", Napi::Number::New(env, Z_NO_FLUSH));
  exports.Set("Z_SYNC_FLUSH", Napi::Number::New(env, Z_SYNC_FLUSH));
  exports.Set("Z_FULL_FLUSH", Napi::Number::New(env, Z_FULL_FLUSH));
  exports.Set("Z_FINISH", Napi::Number::New(env, Z_FINISH));

  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll)
