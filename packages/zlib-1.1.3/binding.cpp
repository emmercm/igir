#include <napi.h>

#include <limits>
#include <memory>
#include <new>
#include <sstream>
#include <type_traits>
#include <utility>
#include <vector>

#include "deps/zlib/zlib.h"

// zlib's default memory level, which zutil.h defines but zlib.h doesn't export
#ifndef DEF_MEM_LEVEL
#if MAX_MEM_LEVEL >= 8
#define DEF_MEM_LEVEL 8
#else
#define DEF_MEM_LEVEL MAX_MEM_LEVEL
#endif
#endif

// A std::allocator that default-initializes elements instead of value-initializing them, so that
// sizing a vector leaves trivial elements uninitialized instead of zeroing them. Only for storage
// that is written before it is read.
template <typename T>
struct DefaultInitAllocator : std::allocator<T> {
    template <typename U>
    struct rebind {
        using other = DefaultInitAllocator<U>;
    };

    DefaultInitAllocator() = default;
    template <typename U>
    // NOLINTNEXTLINE(google-explicit-constructor,hicpp-explicit-conversions): allocators must convert implicitly
    DefaultInitAllocator(const DefaultInitAllocator<U>& /*unused*/) noexcept {}

    template <typename U>
    void construct(U* ptr) noexcept(std::is_nothrow_default_constructible_v<U>) {
        ::new (static_cast<void*>(ptr)) U;
    }
    template <typename U, typename... Args>
    void construct(U* ptr, Args&&... args) {
        ::new (static_cast<void*>(ptr)) U(std::forward<Args>(args)...);
    }
};

// getZlibVersion(): the linked zlib's version string
static Napi::String GetZlibVersion(const Napi::CallbackInfo& info) {
    return Napi::String::New(info.Env(), zlibVersion());
}

// A zlib return code's name and description, for error messages
static std::string ZlibErrorToString(int ret) {
    switch (ret) {
        case Z_OK:
            return "Z_OK: Success";
        case Z_ERRNO:
            return "Z_ERRNO: System error";
        case Z_STREAM_ERROR:
            return "Z_STREAM_ERROR: Invalid compression state";
        case Z_DATA_ERROR:
            return "Z_DATA_ERROR: Invalid or incomplete data";
        case Z_MEM_ERROR:
            return "Z_MEM_ERROR: Memory allocation error";
        case Z_BUF_ERROR:
            return "Z_BUF_ERROR: Insufficient buffer space";
        case Z_VERSION_ERROR:
            return "Z_VERSION_ERROR: Version mismatch";
        default:
            return "Unknown error: " + std::to_string(ret);
    }
}

// A JavaScript raw deflate stream, compressing synchronously on the main thread
class Deflater : public Napi::ObjectWrap<Deflater> {
   public:
    // Define the JavaScript class and add it to exports
    static Napi::Object Init(Napi::Env env, Napi::Object exports);

    // new Deflater(level | {level, memLevel, chunkSize}): start a raw deflate stream, throwing to
    // JavaScript for an invalid option
    Deflater(const Napi::CallbackInfo& info);

    // End the stream, if end() or dispose() hasn't
    ~Deflater() override;

    Deflater(const Deflater&) = delete;
    Deflater& operator=(const Deflater&) = delete;
    Deflater(Deflater&&) = delete;
    Deflater& operator=(Deflater&&) = delete;

   private:
    z_stream stream_{};
    bool initialized_ = false;

    // The output space each deflate() call is given
    size_t chunkSize_ = 16384;  // 16 KiB

    // Accumulation buffer, which deflate writes to directly; cleared at start of each call
    std::vector<uint8_t, DefaultInitAllocator<uint8_t>> output_;

    // Run one deflate() call that writes straight onto the end of output_. It is given exactly
    // chunkSize_ bytes of output space every time, which deflate's output can depend on, so the
    // stream is the same as one deflated through a fixed buffer of that size.
    int DeflateInto(int flush);

    // compressChunk(chunk, flush): return the compressed bytes deflate produces for chunk
    Napi::Value CompressChunk(const Napi::CallbackInfo& info);

    // end(): finish the stream and return its remaining compressed bytes, or an empty Buffer if
    // the stream has already ended
    Napi::Value End(const Napi::CallbackInfo& info);

    // dispose(): end the stream without finishing it
    Napi::Value Dispose(const Napi::CallbackInfo& info);
};

Napi::Object Deflater::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function const func = DefineClass(env, "Deflater",
                                            {
                                                InstanceMethod("compressChunk", &Deflater::CompressChunk),
                                                InstanceMethod("end", &Deflater::End),
                                                InstanceMethod("dispose", &Deflater::Dispose),
                                            });

    exports.Set("Deflater", func);
    return exports;
}

Deflater::Deflater(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Deflater>(info) {
    Napi::Env const env = info.Env();
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
        } else if (info[0].IsObject()) {
            // Options object
            auto const options = info[0].As<Napi::Object>();

            // Get compression level
            if (options.Has("level") && options.Get("level").IsNumber()) {
                level = options.Get("level").As<Napi::Number>().Int32Value();

                // Validate compression level
                if (level < -1 || level > 9) {
                    Napi::RangeError::New(env, "Compression level must be between -1 and 9")
                        .ThrowAsJavaScriptException();
                    return;
                }
            }

            // Get memory level
            if (options.Has("memLevel") && options.Get("memLevel").IsNumber()) {
                memLevel = options.Get("memLevel").As<Napi::Number>().Int32Value();

                // Validate memory level
                if (memLevel < 1 || memLevel > MAX_MEM_LEVEL) {
                    Napi::RangeError::New(env, "Memory level must be between 1 and " + std::to_string(MAX_MEM_LEVEL))
                        .ThrowAsJavaScriptException();
                    return;
                }
            }

            // Get chunk size
            if (options.Has("chunkSize") && options.Get("chunkSize").IsNumber()) {
                chunkSize_ = options.Get("chunkSize").As<Napi::Number>().Uint32Value();

                // Validate chunk size
                if (chunkSize_ < 1024 || chunkSize_ > static_cast<size_t>(1024) * 1024 * 10) {
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
    int const ret = deflateInit2(&stream_, level, Z_DEFLATED, -MAX_WBITS, memLevel, Z_DEFAULT_STRATEGY);
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

int Deflater::DeflateInto(int flush) {
    size_t const start = output_.size();
    output_.resize(start + chunkSize_);
    stream_.next_out = output_.data() + start;
    stream_.avail_out = static_cast<uInt>(chunkSize_);
    int const ret = deflate(&stream_, flush);
    output_.resize(start + (chunkSize_ - stream_.avail_out));
    return ret;
}

Napi::Value Deflater::CompressChunk(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();

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
    auto const input = info[0].As<Napi::Buffer<uint8_t>>();

    // Early return for empty input if not flushing
    if (input.Length() == 0 && flush == Z_NO_FLUSH) {
        return Napi::Buffer<uint8_t>::New(env, 0);
    }

    // Limited to 32 bits because this vendored zlib's avail_in is a uInt. Input cannot be clamped
    // without silently dropping some of it, so a larger Buffer is rejected instead.
    if (input.Length() > std::numeric_limits<uInt>::max()) {
        Napi::RangeError::New(env, "Input buffer is too large").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Set up input
    stream_.next_in = input.Data();
    stream_.avail_in = static_cast<uInt>(input.Length());

    // Pre-allocate output vector with estimated capacity
    // For most data, deflate will reduce size, but for worst case we use input length. Each
    // deflate() call also needs a full chunk of room past what has been written. The reservation
    // is only a hint, so the doubling and the extra chunk are skipped when they cannot be
    // represented.
    output_.clear();
    size_t const estimate = flush == Z_FINISH && input.Length() <= std::numeric_limits<size_t>::max() / 2
                                ? input.Length() * 2
                                : input.Length();
    output_.reserve(estimate <= std::numeric_limits<size_t>::max() - chunkSize_ ? estimate + chunkSize_ : estimate);

    // Process until all input is consumed and output is generated
    do {
        // Perform the compression
        int const ret = DeflateInto(flush);

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

        // Break if we're done (Z_STREAM_END) or there's no more progress on input (Z_BUF_ERROR)
        if (ret == Z_STREAM_END || (ret == Z_BUF_ERROR && stream_.avail_out > 0)) {
            break;
        }

    } while (stream_.avail_in > 0 || stream_.avail_out == 0);

    // Return the compressed data
    return Napi::Buffer<uint8_t>::Copy(env, output_.data(), output_.size());
}

Napi::Value Deflater::End(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();

    if (!initialized_) {
        // Already finalized
        return Napi::Buffer<uint8_t>::New(env, 0);
    }

    // Set up for final flush
    stream_.next_in = Z_NULL;
    stream_.avail_in = 0;

    // Pre-allocate output buffer
    output_.clear();
    output_.reserve(chunkSize_);

    // Continue until Z_STREAM_END is returned
    int ret = Z_OK;
    do {
        // Force a final flush
        ret = DeflateInto(Z_FINISH);

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
    } while (ret != Z_STREAM_END);

    // Clean up
    deflateEnd(&stream_);
    initialized_ = false;

    // Return the final compressed data
    return Napi::Buffer<uint8_t>::Copy(env, output_.data(), output_.size());
}

Napi::Value Deflater::Dispose(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();

    // Just clean up resources without trying to get final data
    if (initialized_) {
        deflateEnd(&stream_);
        initialized_ = false;
    }

    return env.Undefined();
}

// Export the Deflater class, getZlibVersion(), and the flush mode constants
static Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
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
