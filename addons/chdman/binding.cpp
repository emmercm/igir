#include <napi.h>

#include <algorithm>
#include <cstring>
#include <limits>
#include <memory>
#include <optional>
#include <ostream>
#include <regex>
#include <span>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "cdrom.h"
#include "chd.h"
#include "chdcodec.h"
#include "path.h"
#include "src/addon.h"
#include "strformat.h"

// ---- chdman raw logical reader ----

/**
 * The full logical byte range of a RAW, HARD_DISK, or DVD CHD. Owns its own
 * chd_file and emits exactly the bytes chd_file::read_bytes would write, i.e. the
 * same bytes chdman's extractRaw would produce. The CHD is opened lazily by the first read's
 * worker, so no filesystem I/O runs on the main thread.
 */
class RawSource {
   public:
    /** Remember the path; the CHD isn't opened until the first Produce() */
    explicit RawSource(std::string input) : input_(std::move(input)) {}

    /** Emit up to maxBytes of this CHD's logical bytes starting at pos_. Runs on the worker thread. */
    size_t Produce(uint8_t* out, size_t maxBytes) {
        if (!opened_) {
            std::error_condition const err = chd_.open(input_, false, nullptr);
            if (err) {
                throw std::runtime_error("failed to open CHD: " + err.message());
            }
            total_ = chd_.logical_bytes();
            opened_ = true;
        }
        if (pos_ >= total_) return 0;

        // Clamped to 32 bits because MAME's chd_file::read_bytes() takes a uint32_t length. A
        // short read is allowed, and the next read continues from pos_.
        auto const n =
            static_cast<uint32_t>(std::min<uint64_t>({maxBytes, total_ - pos_, std::numeric_limits<uint32_t>::max()}));
        std::error_condition const err = chd_.read_bytes(pos_, out, n);
        if (err) throw std::runtime_error("CHD read_bytes failed: " + err.message());
        pos_ += n;
        return n;
    }

   private:
    std::string input_;
    bool opened_ = false;
    chd_file chd_;
    uint64_t total_ = 0;
    uint64_t pos_ = 0;
};

/** A pull reader over a RawSource */
class RawReader : public ReaderBase<RawReader, RawSource> {
   public:
    /** Define the JavaScript class, with its read() and close() methods */
    static Napi::Function GetClass(Napi::Env env) {
        return DefineClass(env, "RawReader",
                           {
                               InstanceMethod("read", &RawReader::Read),
                               InstanceMethod("close", &RawReader::Close),
                           });
    }

    /**
     * new RawReader(inputFilename): throws to JavaScript for a missing filename; the CHD is
     * opened by the first read()
     */
    explicit RawReader(const Napi::CallbackInfo& info) : ReaderBase<RawReader, RawSource>(info) {
        Napi::Env const env = info.Env();
        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "RawReader(inputFilename) required").ThrowAsJavaScriptException();
            return;
        }
        try {
            source_ = std::make_shared<RawSource>(info[0].As<Napi::String>().Utf8Value());
        } catch (const std::exception& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        }
    }
};

/**
 * Holds the class constructors for every ObjectWrap type registered by this
 * addon.  Stored as the addon's instance data so factories can retrieve them
 * without a global.
 */
struct Addon {
    Napi::FunctionReference trackReader;
    Napi::FunctionReference rawReader;
};

/**
 * Factory: construct a TrackReader from the class constructor stored as the
 * addon's instance data.
 */
static Napi::Value OpenTrackReader(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Function const ctor = env.GetInstanceData<Addon>()->trackReader.Value();
    return ctor.New({info[0], info[1], info[2]});
}

/**
 * Factory: construct a RawReader from the class constructor stored as the
 * addon's instance data.
 */
static Napi::Value OpenRawReader(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Function const ctor = env.GetInstanceData<Addon>()->rawReader.Value();
    return ctor.New({info[0]});
}

/** Register the reader classes as instance data and export the addon's functions */
static Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    Napi::Function const trackReaderClass = TrackReader::GetClass(env);
    Napi::Function const rawReaderClass = RawReader::GetClass(env);
    env.SetInstanceData(
        new Addon{.trackReader = Napi::Persistent(trackReaderClass), .rawReader = Napi::Persistent(rawReaderClass)});

    exports.Set("info", Napi::Function::New(env, Info));
    exports.Set("listTracks", Napi::Function::New(env, ListTracks));
    exports.Set("openTrackReader", Napi::Function::New(env, OpenTrackReader));
    exports.Set("openRawReader", Napi::Function::New(env, OpenRawReader));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll)
