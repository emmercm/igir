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

#include "addon.h"
#include "cdrom.h"
#include "chd.h"
#include "chdcodec.h"
#include "path.h"
#include "strformat.h"

// ---- chdman info ----

/** Map a chd_file's metadata tags to a stable type string (mirrors CHDType in index.ts). */
static std::string ChdTypeString(chd_file& chd) {
    // check_is_*() return a std::error_condition that is falsy (no error) when the
    // corresponding metadata is present. GD-ROM must be checked before CD-ROM
    // because a GD-ROM also carries CD-style track metadata.
    if (!chd.check_is_hd()) return "HARD_DISK";
    if (!chd.check_is_dvd()) return "DVD_ROM";
    if (!chd.check_is_gd()) return "GD_ROM";
    if (!chd.check_is_cd()) return "CD_ROM";
    return "RAW";
}

/** The four-character codec name chdman prints for a codec, or "none" for an unknown one */
static std::string CompressionString(chd_codec_type codec) {
    switch (codec) {
        case CHD_CODEC_ZLIB:
            return "zlib";
        case CHD_CODEC_ZSTD:
            return "zstd";
        case CHD_CODEC_LZMA:
            return "lzma";
        case CHD_CODEC_HUFFMAN:
            return "huff";
        case CHD_CODEC_FLAC:
            return "flac";
        case CHD_CODEC_CD_ZLIB:
            return "cdzl";
        case CHD_CODEC_CD_ZSTD:
            return "cdzs";
        case CHD_CODEC_CD_LZMA:
            return "cdlz";
        case CHD_CODEC_CD_FLAC:
            return "cdfl";
        case CHD_CODEC_AVHUFF:
            return "avhu";
        default:
            return "none";
    }
}

/**
 * Plain C++ mirror of the TS CHDInfo interface (see index.ts). Member integer
 * types match the corresponding chd_file accessor return types exactly so that
 * the gather step is lossless and compiler-checked:
 *   fileVersion <- version()      : uint32_t
 *   logicalSize <- logical_bytes(): uint64_t
 *   hunkSize    <- hunk_bytes()   : uint32_t
 *   totalHunks  <- hunk_count()   : uint32_t
 *   unitSize    <- unit_bytes()   : uint32_t
 *   totalUnits  <- unit_count()   : uint64_t
 *   chdSize     <- file().length(): uint64_t
 */
struct ChdInfo {
    std::string inputFile;
    std::string type;
    uint32_t fileVersion = 0;
    uint64_t logicalSize = 0;
    uint32_t hunkSize = 0;
    uint32_t totalHunks = 0;
    uint32_t unitSize = 0;
    uint64_t totalUnits = 0;
    std::vector<std::string> compression;
    uint64_t chdSize = 0;
    std::optional<std::string> sha1;
    std::optional<std::string> dataSha1;
};

/**
 * Convert a ChdInfo to the JavaScript CHDInfo object. The single place that knows the JS-visible
 * key names and value encodings; kept adjacent to ChdInfo so the two can be audited together.
 */
static Napi::Object ChdInfoToObject(Napi::Env env, const ChdInfo& info) {
    Napi::Object out = Napi::Object::New(env);
    out.Set("inputFile", info.inputFile);
    out.Set("type", info.type);
    out.Set("fileVersion", Napi::Number::New(env, static_cast<double>(info.fileVersion)));
    out.Set("logicalSize", Napi::Number::New(env, static_cast<double>(info.logicalSize)));
    out.Set("hunkSize", Napi::Number::New(env, static_cast<double>(info.hunkSize)));
    out.Set("totalHunks", Napi::Number::New(env, static_cast<double>(info.totalHunks)));
    out.Set("unitSize", Napi::Number::New(env, static_cast<double>(info.unitSize)));
    out.Set("totalUnits", Napi::Number::New(env, static_cast<double>(info.totalUnits)));
    Napi::Array const compression = Napi::Array::New(env);
    for (uint32_t i = 0; i < info.compression.size(); i++) {
        compression.Set(i, info.compression[i]);
    }
    out.Set("compression", compression);
    out.Set("chdSize", Napi::Number::New(env, static_cast<double>(info.chdSize)));
    out.Set("sha1",
            info.sha1.has_value() ? Napi::Value(Napi::String::New(env, *info.sha1)) : Napi::Value(env.Undefined()));
    out.Set("dataSha1", info.dataSha1.has_value() ? Napi::Value(Napi::String::New(env, *info.dataSha1))
                                                  : Napi::Value(env.Undefined()));
    return out;
}

/** Opens a CHD on the thread pool and gathers its header information and hashes */
class InfoWorker : public Napi::AsyncWorker {
   public:
    /** Stores the loop-created promise and input path for worker-thread inspection. */
    InfoWorker(Napi::Env env, Napi::Promise::Deferred deferred, std::string path)
        : Napi::AsyncWorker(env), deferred_(deferred), path_(std::move(path)) {}

    /** Open the CHD and gather its ChdInfo. Runs on the worker thread. */
    void Execute() override {
        try {
            chd_file chd;

            // Opening reads the header and the hunk map, which a compressed v5 CHD stores
            // compressed, so the map is decompressed here too
            std::error_condition const err = chd.open(path_, false, nullptr);
            if (err) {
                SetError("failed to open CHD: " + err.message());
                return;
            }

            data_.inputFile = path_;
            data_.type = ChdTypeString(chd);
            data_.fileVersion = chd.version();
            data_.logicalSize = chd.logical_bytes();
            data_.hunkSize = chd.hunk_bytes();
            data_.totalHunks = chd.hunk_count();
            data_.unitSize = chd.unit_bytes();
            data_.totalUnits = chd.unit_count();

            for (int i = 0; i < 4; i++) {
                chd_codec_type const c = chd.compression(i);
                if (c != CHD_CODEC_NONE) data_.compression.push_back(CompressionString(c));
            }

            uint64_t filesize = 0;

            // Best-effort: file size is metadata only, so leave it at 0 on a length() error.
            if (chd.file().length(filesize)) {
                filesize = 0;
            }
            data_.chdSize = filesize;

            util::sha1_t const sha1 = chd.sha1();
            if (sha1 != util::sha1_t::null) {
                data_.sha1 = sha1.as_string();
            }
            util::sha1_t const rawSha1 = chd.raw_sha1();
            if (rawSha1 != util::sha1_t::null) {
                data_.dataSha1 = rawSha1.as_string();
            }

            chd.close();
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("unknown CHD info error");
        }
    }

    /** Resolve with the CHDInfo */
    void OnOK() override { deferred_.Resolve(ChdInfoToObject(Env(), data_)); }

    /** Reject with the error Execute() set */
    void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

   private:
    Napi::Promise::Deferred deferred_;
    std::string path_;
    ChdInfo data_;
};

/** info(inputFilename): resolve a CHD's header information and hashes as a CHDInfo */
Napi::Value Info(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
    if (info.Length() < 1 || !info[0].IsString()) {
        deferred.Reject(Napi::TypeError::New(env, "inputFilename (string) required").Value());
        return deferred.Promise();
    }
    try {
        QueueWorker<InfoWorker>(env, deferred, info[0].As<Napi::String>().Utf8Value());
    } catch (const Napi::Error& e) {
        deferred.Reject(e.Value());
    }
    return deferred.Promise();
}
