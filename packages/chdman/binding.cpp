#include <algorithm>
#include <cstring>
#include <memory>
#include <napi.h>
#include <optional>
#include <ostream>
#include <regex>
#include <sstream>
#include <vector>

#include "cdrom.h"
#include "chd.h"
#include "chdcodec.h"
#include "path.h"
#include "strformat.h"

// ===== BEGIN ported from deps/mame/src/tools/chdman.cpp @ MAME 0.288 (submodule tag mame0288) =====
// Re-port when bumping the MAME submodule: diff each sub-block against the cited
// line range. Helpers are `port_`-prefixed to avoid name clashes.

// MODE_* constants (chdman.cpp lines 71-73).
enum {
  MODE_NORMAL = 0,
  MODE_CUEBIN = 1,
  MODE_GDI = 2,
};

// chdman.cpp: msf_string_from_frames (verbatim, line 1072).
static std::string port_msf_string_from_frames(uint32_t frames) {
  return util::string_format("%02d:%02d:%02d", frames / (75 * 60), (frames / 75) % 60, frames % 75);
}

// chdman's do_extract_cd writes `frames - padframes + splitframes` data frames
// per split bin (chdman.cpp line 2968). Callers must first confirm the track does
// not underflow via cuebin_underflow_error().
static uint32_t port_actual_frames(const cdrom_file::track_info& t) {
  return static_cast<uint32_t>(int64_t(t.frames) + int64_t(t.splitframes) - int64_t(t.padframes));
}

// Some GD-ROM CHDs cannot be expressed as cue/bin: their high-density track has
// padframes exceeding frames+splitframes, so chdman's uint32 frame formula above
// underflows to ~4.29e9 frames (~10 TB) and extraction would run far past chdman's
// total_bytes (chdman.cpp line 2734) -- i.e. past 100% of the disc. The chdman CLI
// relied on a progress watchdog to abort that runaway; we instead detect the
// underflow up front so callers (e.g. ChdBinCue) fall back to gdi/raw.
//
// Returns the reason `t` cannot be extracted as cue/bin, or an empty string if it
// is safe. Returning the message (rather than throwing) keeps it off the C++
// exception path, whose what() string MSVC mis-copies on arm64 in this build; the
// caller hands the returned std::string straight to Napi::Error, which is unaffected.
static std::string cuebin_underflow_error(const cdrom_file::track_info& t, int tracknum) {
  const int64_t frames = int64_t(t.frames) + int64_t(t.splitframes) - int64_t(t.padframes);
  if (frames >= 0) {
    return {};
  }
  return "CHD cannot be extracted as cue/bin: track " + std::to_string(tracknum + 1) +
         " frame count underflows (padframes " + std::to_string(t.padframes) + " > frames " +
         std::to_string(t.frames) + " + splitframes " + std::to_string(t.splitframes) + ")";
}

// chdman.cpp output_track_metadata 1527-1586, MODE_GDI + MODE_CUEBIN only,
// writing to std::ostream& via util::stream_format(out, ...).
static void port_output_track_metadata(int mode, std::ostream& out, int tracknum,
    const cdrom_file::track_info& info, const std::string& filename,
    uint32_t frameoffs, uint64_t outputoffs) {
  if (mode == MODE_GDI) {
    const int tracktype = info.trktype == cdrom_file::CD_TRACK_AUDIO ? 0 : 4;
    const bool needquote = filename.find(' ') != std::string::npos;
    const char* const quotestr = needquote ? "\"" : "";
    util::stream_format(out, "%d %d %d %d %s%s%s %d\n", tracknum + 1, frameoffs, tracktype,
        info.datasize, quotestr, filename, quotestr, outputoffs);
  } else if (mode == MODE_CUEBIN) {
    // specify a new file when writing to the beginning of a file
    if (outputoffs == 0)
      util::stream_format(out, "FILE \"%s\" BINARY\n", filename);

    // determine submode
    std::string tempstr;
    switch (info.trktype) {
      case cdrom_file::CD_TRACK_MODE1:
      case cdrom_file::CD_TRACK_MODE1_RAW:
        tempstr = util::string_format("MODE1/%04d", info.datasize);
        break;

      case cdrom_file::CD_TRACK_MODE2:
      case cdrom_file::CD_TRACK_MODE2_FORM1:
      case cdrom_file::CD_TRACK_MODE2_FORM2:
      case cdrom_file::CD_TRACK_MODE2_FORM_MIX:
      case cdrom_file::CD_TRACK_MODE2_RAW:
        tempstr = util::string_format("MODE2/%04d", info.datasize);
        break;

      case cdrom_file::CD_TRACK_AUDIO:
        tempstr.assign("AUDIO");
        break;
    }

    // output TRACK entry
    util::stream_format(out, "  TRACK %02d %s\n", tracknum + 1, tempstr);

    // output PREGAP tag if pregap sectors are not in the file
    if ((info.pregap > 0) && (info.pgdatasize == 0)) {
      util::stream_format(out, "    PREGAP %s\n", port_msf_string_from_frames(info.pregap));
      util::stream_format(out, "    INDEX 01 %s\n", port_msf_string_from_frames(frameoffs));
    } else if ((info.pregap > 0) && (info.pgdatasize > 0)) {
      util::stream_format(out, "    INDEX 00 %s\n", port_msf_string_from_frames(frameoffs));
      util::stream_format(out, "    INDEX 01 %s\n",
          port_msf_string_from_frames(frameoffs + info.pregap));
    }

    // if no pregap at all, output index 01 only
    if (info.pregap == 0) {
      util::stream_format(out, "    INDEX 01 %s\n", port_msf_string_from_frames(frameoffs));
    }

    // output POSTGAP
    if (info.postgap > 0)
      util::stream_format(out, "    POSTGAP %s\n", port_msf_string_from_frames(info.postgap));
  }
}

// chdman.cpp 2848-2912, GD-ROM Redump TOC adjustment, mutating toc in place.
static void apply_gdrom_cuebin_toc_adjustment(cdrom_file::toc& toc) {
  // TOSEC GDI-based CHDs have the padframes field set to non-0 where the pregaps
  // for the next track would be
  const bool has_physical_pregap = toc.tracks[0].padframes == 0;

  for (int tracknum = 1; tracknum < int(toc.numtrks); tracknum++) {
    // pgdatasize should never be set in GD-ROMs currently, so if it is set then
    // assume the TOC has proper pregap values
    if (toc.tracks[tracknum].pgdatasize != 0)
      break;

    // don't adjust the first track of the single-density and high-density areas
    if (toc.tracks[tracknum].physframeofs == 45000)
      continue;

    if (!has_physical_pregap) {
      // NOTE: This will generate a cue with PREGAP commands instead of INDEX 00
      // because the pregap data isn't baked into the bins
      toc.tracks[tracknum].pregap += toc.tracks[tracknum - 1].padframes;

      // "type 1" and "type 2" don't require any adjustments
      if (tracknum + 1 >= int(toc.numtrks) &&
          toc.tracks[tracknum].trktype != cdrom_file::CD_TRACK_AUDIO) {
        if (toc.tracks[tracknum - 1].trktype != cdrom_file::CD_TRACK_AUDIO) {
          // "type 3" where the high-density area is just two data tracks
          toc.tracks[tracknum - 1].padframes += 225;

          toc.tracks[tracknum].pregap += 225;
          toc.tracks[tracknum].splitframes = 225;
          toc.tracks[tracknum].pgdatasize = toc.tracks[tracknum].datasize;
          toc.tracks[tracknum].pgtype = toc.tracks[tracknum].trktype;
        } else {
          // "type 3 split"
          toc.tracks[tracknum - 1].frames -= 75;
          toc.tracks[tracknum].pregap += 75;
        }
      }
    } else {
      int curextra = 150;  // 00:02:00
      if (tracknum + 1 >= int(toc.numtrks) &&
          toc.tracks[tracknum].trktype != cdrom_file::CD_TRACK_AUDIO)
        curextra += 75;  // 00:01:00, special case when last track is data

      toc.tracks[tracknum - 1].padframes = curextra;

      toc.tracks[tracknum].pregap += curextra;
      toc.tracks[tracknum].splitframes = curextra;
      toc.tracks[tracknum].pgdatasize = toc.tracks[tracknum].datasize;
      toc.tracks[tracknum].pgtype = toc.tracks[tracknum].trktype;
    }
  }
}

// chdman.cpp 2744-2804, %t templating for one track (always split-bin).
static std::string FormatTrackName(const std::string& pattern, int tracknum) {
  const std::regex variables_regex("(%*)(%([+-]?\\d+)?([a-zA-Z]))");
  std::string::const_iterator name_itr = pattern.begin();
  std::string::const_iterator name_end = pattern.end();
  std::string filename_formatted = pattern;
  std::smatch variable_matches;

  while (std::regex_search(name_itr, name_end, variable_matches, variables_regex)) {
    // full_match will always have one leading %, so if leading_escape has an even
    // number of %s then we can know that we're working on an unescaped %
    const std::string leading_escape = variable_matches[1].str();
    const std::string full_match = variable_matches[2].str();
    const std::string format_part = variable_matches[3].str();
    const std::string format_type = variable_matches[4].str();

    if ((leading_escape.size() % 2) == 0) {
      std::string replacement;

      if (format_type == "t") {
        // track number (always split-bin here, so always replaced)
        replacement = util::string_format("%" + format_part + "d", tracknum + 1);
      }

      if (!replacement.empty()) {
        size_t index = std::string::npos;
        while ((index = filename_formatted.find(full_match)) != std::string::npos)
          filename_formatted.replace(index, full_match.size(), replacement);
      }
    }

    name_itr = variable_matches.suffix().first;  // move past match for next loop
  }

  return filename_formatted;
}

// One track in the in-memory listing. `size` is the data-only byte count written
// to the split bin (subcode is never included in cue/gdi extraction).
struct TrackOut {
  int index;
  std::string filename;
  std::string type;
  uint64_t size;
};

// Build the TOC text and per-track listing for a CHD, mirroring chdman's
// do_extract_cd (2638-3021) but writing to memory instead of files. For MODE_GDI
// the TOC text is normalized to igir's historical ChdGdi output (quote-stripped,
// CRLF line endings) after assembly.
static bool BuildListing(const std::string& inputPath, int mode,
                         const std::string& binPatternOrBase, const std::string& /*tocName*/,
                         std::string& tocTextOut, std::vector<TrackOut>& tracksOut,
                         std::string& errorOut) {
  chd_file chd;
  std::error_condition err = chd.open(inputPath, false, nullptr);
  if (err) {
    errorOut = "failed to open CHD: " + err.message();
    return false;
  }
  cdrom_file cdrom(&chd);
  cdrom_file::toc toc = cdrom.get_toc();
  const bool isGdrom = cdrom.is_gdrom();
  if (mode == MODE_CUEBIN && isGdrom)
    apply_gdrom_cuebin_toc_adjustment(toc);

  std::ostringstream toc_text;

  // header: gdi -> "<numtrks>\n"; cuebin -> no header (chdman emits the CD_ROM
  // header only in MODE_NORMAL)
  if (mode == MODE_GDI) {
    util::stream_format(toc_text, "%d\n", toc.numtrks);
  }

  uint64_t outputoffs = 0;
  std::string trackbin_name;
  uint32_t discoffs = 0;
  for (int tracknum = 0; tracknum < int(toc.numtrks); tracknum++) {
    const cdrom_file::track_info& t = toc.tracks[tracknum];
    std::string filename;
    if (mode == MODE_GDI) {
      const char* ext = (t.trktype == cdrom_file::CD_TRACK_AUDIO) ? ".raw" : ".bin";
      filename = FormatTrackName(binPatternOrBase + "%02t" + ext, tracknum);
    } else {
      filename = FormatTrackName(binPatternOrBase, tracknum);
    }
    if (filename != trackbin_name) {
      outputoffs = 0;
      if (mode != MODE_GDI)
        discoffs = 0;
      trackbin_name = filename;
    }
    if (mode == MODE_CUEBIN && isGdrom) {
      if (tracknum == 0)
        toc_text << "REM SINGLE-DENSITY AREA\n";
      else if (t.physframeofs == 45000)
        toc_text << "REM HIGH-DENSITY AREA\n";
    }
    port_output_track_metadata(mode, toc_text, tracknum, t,
        std::string(core_filename_extract_base(filename)), discoffs, outputoffs);

    // SIZE = data bytes ONLY. chdman's do_extract_cd loop (2966-3018) writes
    // exactly actualframes*datasize bytes per split bin. Virtual pregap
    // (pgdatasize==0) and postgap are cue/gdi COMMANDS (PREGAP/POSTGAP), never
    // bytes in the file; data-in-file pregaps are already folded into
    // actualframes via splitframes. So DO NOT add pregap/postgap bytes.
    errorOut = cuebin_underflow_error(t, tracknum);
    if (!errorOut.empty()) {
      return false;  // chd is closed by its destructor
    }
    const uint32_t actualframes = port_actual_frames(t);
    const uint64_t dataBytes = uint64_t(actualframes) * t.datasize;
    tracksOut.push_back(TrackOut{tracknum, filename,
        std::string(cdrom_file::get_type_string(t.trktype)), dataBytes});

    outputoffs += dataBytes;
    discoffs += actualframes + t.padframes;
  }

  std::string text = toc_text.str();

  if (mode == MODE_GDI) {
    // chdman emits gdi lines like `1 0 4 2352 "track01.bin" 0` with quotes and
    // LF. igir's historical ChdGdi output is quote-stripped, CRLF, no empty
    // lines, with a trailing CRLF. Normalize to match.
    std::string normalized;
    std::istringstream lines(text);
    std::string line;
    while (std::getline(lines, line)) {
      if (line.empty())
        continue;
      line.erase(std::remove(line.begin(), line.end(), '"'), line.end());
      normalized += line;
      normalized += "\r\n";
    }
    text = normalized;
  }

  tocTextOut = text;
  chd.close();
  return true;
}
// ===== END ported region =====

// ---- shared pull-reader scaffolding ----

// Drives a reader's Produce() on a worker thread so the (blocking, possibly
// decompressing) CHD reads never run on the V8 main thread. One template covers
// all reader types; each must expose
//   size_t Produce(uint8_t* out, size_t maxBytes);  // worker thread
//   void   FinishRead();                             // main thread, post-Execute
template <typename Reader>
class ReadWorker : public Napi::AsyncWorker {
public:
  ReadWorker(Napi::Env env, Reader* reader, size_t maxBytes)
    : Napi::AsyncWorker(env), deferred_(Napi::Promise::Deferred::New(env)), reader_(reader),
      buf_(maxBytes) {}

  Napi::Promise GetPromise() { return deferred_.Promise(); }

  void Execute() override {
    try {
      n_ = reader_->Produce(buf_.data(), buf_.size());
    } catch (const std::exception& e) {
      SetError(e.what());
    } catch (...) {
      SetError("unknown CHD read error");
    }
  }

  void OnOK() override {
    Napi::Env env = Env();
    if (n_ == 0) {
      deferred_.Resolve(env.Null());
    } else {
      deferred_.Resolve(Napi::Buffer<uint8_t>::Copy(env, buf_.data(), n_));
    }
    reader_->FinishRead();  // last use of reader_: may release it
  }

  void OnError(const Napi::Error& e) override {
    deferred_.Reject(e.Value());
    reader_->FinishRead();  // last use of reader_: may release it
  }

private:
  Napi::Promise::Deferred deferred_;
  Reader* reader_;
  std::vector<uint8_t> buf_;
  size_t n_ = 0;
};

// CRTP base implementing the single audited copy of the async pull-reader
// lifecycle shared by TrackReader and RawReader. Each Derived supplies:
//   size_t Produce(uint8_t* out, size_t maxBytes);  // worker thread; emits bytes
//   void   Teardown();                               // main thread; releases handles
//
// Safety invariant: Produce (worker thread) never overlaps Teardown (main
// thread). Teardown runs only from Close() when no read is in flight, or from
// FinishRead(), which N-API calls on the main thread after Execute() returns.
// The reading_ flag rejects a second concurrent read(). Ref()/Unref() keep the
// object (and its CHD handles) alive across the async read and always balance,
// on both the OK and error paths, so a destroyed stream cannot leak.
template <typename Derived>
class ReaderBase : public Napi::ObjectWrap<Derived> {
public:
  explicit ReaderBase(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Derived>(info) {}

  Napi::Value Read(const Napi::CallbackInfo& info);

  // Deterministically release the CHD handle(s). If a read worker is in flight,
  // the teardown is deferred to FinishRead() so the worker thread is never
  // reading the CHD while the main thread frees it.
  void Close(const Napi::CallbackInfo&) {
    closed_ = true;
    if (!reading_) {
      static_cast<Derived*>(this)->Teardown();
    }
  }

  // Called on the main thread by the read worker once Produce has fully completed
  // (Execute has returned), so touching the CHD here is safe.
  void FinishRead() {
    reading_ = false;
    if (closed_) {
      static_cast<Derived*>(this)->Teardown();
    }
    this->Unref();  // balances the Ref() taken in Read(); may allow GC of this object
  }

protected:
  bool closed_ = false;
  bool reading_ = false;
};

// Defined out-of-line because it constructs a ReadWorker<Derived>, whose full
// definition must precede this. Shared by every ReaderBase subclass.
template <typename Derived>
Napi::Value ReaderBase<Derived>::Read(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
  if (closed_) {
    deferred.Reject(Napi::Error::New(env, "read after close").Value());
    return deferred.Promise();
  }
  if (reading_) {
    // Only one read worker may touch this reader's mutable state at a time.
    deferred.Reject(Napi::Error::New(env, "concurrent read not allowed").Value());
    return deferred.Promise();
  }
  size_t maxBytes = info[0].As<Napi::Number>().Uint32Value();
  // Allocate the worker (and its maxBytes buffer) BEFORE mutating reader state:
  // if that allocation throws, reading_/Ref() must not be left dangling.
  auto* worker = new ReadWorker<Derived>(env, static_cast<Derived*>(this), maxBytes);
  Napi::Promise promise = worker->GetPromise();
  reading_ = true;
  this->Ref();  // keep this object (and its CHD) alive while the worker thread reads
  worker->Queue();
  return promise;
}

// ---- chdman info ----

// Map a chd_file's metadata tags to a stable type string (mirrors CHDType in index.ts).
static std::string ChdTypeString(chd_file& chd) {
  // check_is_*() return a std::error_condition that is falsy (no error) when the
  // corresponding metadata is present. GD-ROM must be checked before CD-ROM
  // because a GD-ROM also carries CD-style track metadata.
  if (!chd.check_is_hd())
    return "HARD_DISK";
  if (!chd.check_is_dvd())
    return "DVD_ROM";
  if (!chd.check_is_gd())
    return "GD_ROM";
  if (!chd.check_is_cd())
    return "CD_ROM";
  return "RAW";
}

static std::string CompressionString(chd_codec_type codec) {
  switch (codec) {
    case CHD_CODEC_ZLIB:    return "zlib";
    case CHD_CODEC_ZSTD:    return "zstd";
    case CHD_CODEC_LZMA:    return "lzma";
    case CHD_CODEC_HUFFMAN: return "huff";
    case CHD_CODEC_FLAC:    return "flac";
    case CHD_CODEC_CD_ZLIB: return "cdzl";
    case CHD_CODEC_CD_ZSTD: return "cdzs";
    case CHD_CODEC_CD_LZMA: return "cdlz";
    case CHD_CODEC_CD_FLAC: return "cdfl";
    case CHD_CODEC_AVHUFF:  return "avhu";
    default:                return "none";
  }
}

// Plain C++ mirror of the TS CHDInfo interface (see index.ts). Member integer
// types match the corresponding chd_file accessor return types exactly so that
// the gather step is lossless and compiler-checked:
//   fileVersion <- version()      : uint32_t
//   logicalSize <- logical_bytes(): uint64_t
//   hunkSize    <- hunk_bytes()   : uint32_t
//   totalHunks  <- hunk_count()   : uint32_t
//   unitSize    <- unit_bytes()   : uint32_t
//   totalUnits  <- unit_count()   : uint64_t
//   chdSize     <- file().length(): uint64_t
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

// The single place that knows the JS-visible key names and value encodings. Keep
// this adjacent to ChdInfo so the struct and its marshalling can be audited together.
static Napi::Object ChdInfoToObject(Napi::Env env, const ChdInfo& info) {
  Napi::Object out = Napi::Object::New(env);
  out.Set("inputFile", info.inputFile);
  out.Set("type", info.type);
  out.Set("fileVersion", Napi::Number::New(env, double(info.fileVersion)));
  out.Set("logicalSize", Napi::Number::New(env, double(info.logicalSize)));
  out.Set("hunkSize", Napi::Number::New(env, double(info.hunkSize)));
  out.Set("totalHunks", Napi::Number::New(env, double(info.totalHunks)));
  out.Set("unitSize", Napi::Number::New(env, double(info.unitSize)));
  out.Set("totalUnits", Napi::Number::New(env, double(info.totalUnits)));
  Napi::Array compression = Napi::Array::New(env);
  for (uint32_t i = 0; i < info.compression.size(); i++) {
    compression.Set(i, info.compression[i]);
  }
  out.Set("compression", compression);
  out.Set("chdSize", Napi::Number::New(env, double(info.chdSize)));
  out.Set("sha1", info.sha1.has_value() ? Napi::Value(Napi::String::New(env, *info.sha1))
                                        : Napi::Value(env.Undefined()));
  out.Set("dataSha1", info.dataSha1.has_value() ? Napi::Value(Napi::String::New(env, *info.dataSha1))
                                                : Napi::Value(env.Undefined()));
  return out;
}

static Napi::Value Info(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "inputFilename (string) required").ThrowAsJavaScriptException();
    return env.Null();
  }
  std::string inputPath = info[0].As<Napi::String>();

  chd_file chd;
  // NOTE: this reads only the CHD header and runs synchronously on the V8 main
  // thread; it is fast enough that no AsyncWorker is needed.
  std::error_condition err = chd.open(inputPath, false, nullptr);
  if (err) {
    Napi::Error::New(env, "failed to open CHD: " + err.message()).ThrowAsJavaScriptException();
    return env.Null();
  }

  ChdInfo data;
  data.inputFile = inputPath;
  data.type = ChdTypeString(chd);
  data.fileVersion = chd.version();
  data.logicalSize = chd.logical_bytes();
  data.hunkSize = chd.hunk_bytes();
  data.totalHunks = chd.hunk_count();
  data.unitSize = chd.unit_bytes();
  data.totalUnits = chd.unit_count();

  for (int i = 0; i < 4; i++) {
    chd_codec_type c = chd.compression(i);
    if (c != CHD_CODEC_NONE) data.compression.push_back(CompressionString(c));
  }

  uint64_t filesize = 0;
  chd.file().length(filesize);
  data.chdSize = filesize;

  util::sha1_t sha1 = chd.sha1();
  if (sha1 != util::sha1_t::null) {
    data.sha1 = sha1.as_string();
  }
  util::sha1_t rawSha1 = chd.raw_sha1();
  if (rawSha1 != util::sha1_t::null) {
    data.dataSha1 = rawSha1.as_string();
  }

  chd.close();

  Napi::Object out = ChdInfoToObject(env, data);

  Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
  deferred.Resolve(out);
  return deferred.Promise();
}

// ---- chdman list tracks ----

// List the tracks of a CD-ROM/GD-ROM CHD: returns the in-memory TOC text plus a
// per-track descriptor (index, output filename, type string, data-only size).
static Napi::Value ListTracks(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 4 || !info[0].IsString() || !info[1].IsNumber() ||
      !info[2].IsString() || !info[3].IsString()) {
    Napi::TypeError::New(env, "listTracks(inputFilename, mode, binPatternOrBase, tocName) required")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  std::string inputPath = info[0].As<Napi::String>();
  int mode = info[1].As<Napi::Number>().Int32Value();
  std::string binArg = info[2].As<Napi::String>();
  std::string tocName = info[3].As<Napi::String>();

  // No serialization needed: BuildListing uses its own chd_file/cdrom_file and
  // touches no shared state.
  Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
  try {
    std::string tocText;
    std::vector<TrackOut> tracks;
    std::string error;
    if (!BuildListing(inputPath, mode, binArg, tocName, tocText, tracks, error)) {
      deferred.Reject(Napi::Error::New(env, error).Value());
      return deferred.Promise();
    }
    Napi::Object out = Napi::Object::New(env);
    out.Set("tocText", tocText);
    Napi::Array arr = Napi::Array::New(env, tracks.size());
    for (uint32_t i = 0; i < tracks.size(); i++) {
      Napi::Object t = Napi::Object::New(env);
      t.Set("index", Napi::Number::New(env, double(tracks[i].index)));
      t.Set("filename", tracks[i].filename);
      t.Set("type", tracks[i].type);
      t.Set("size", Napi::Number::New(env, double(tracks[i].size)));
      arr.Set(i, t);
    }
    out.Set("tracks", arr);
    deferred.Resolve(out);
  } catch (const std::error_condition& e) {
    deferred.Reject(Napi::Error::New(env, e.message()).Value());
  } catch (const std::exception& e) {
    deferred.Reject(Napi::Error::New(env, e.what()).Value());
  } catch (...) {
    deferred.Reject(Napi::Error::New(env, "unknown error listing CHD tracks").Value());
  }
  return deferred.Promise();
}

// ---- chdman per-track pull reader ----

// A pull-based reader over a single CD-ROM (cue/bin) or GD-ROM (gdi) track. It
// owns its OWN chd_file + cdrom_file so that concurrent readers are fully
// independent (no shared state), and emits exactly the
// bytes chdman's do_extract_cd would write for that split-bin track: the DATA
// FRAMES ONLY. Virtual pregap/postgap are cue/gdi commands, never bytes;
// data-in-file pregaps are pulled from the previous track via splitframes.
class TrackReader : public ReaderBase<TrackReader> {
public:
  static Napi::Function GetClass(Napi::Env env) {
    return DefineClass(env, "TrackReader",
                       {
                           InstanceMethod("read", &TrackReader::Read),
                           InstanceMethod("close", &TrackReader::Close),
                       });
  }

  explicit TrackReader(const Napi::CallbackInfo& info) : ReaderBase<TrackReader>(info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsString() || !info[1].IsNumber() || !info[2].IsNumber()) {
      Napi::TypeError::New(env, "TrackReader(inputFilename, mode, trackIndex) required")
          .ThrowAsJavaScriptException();
      return;
    }
    input_ = info[0].As<Napi::String>();
    mode_ = info[1].As<Napi::Number>().Int32Value();
    trackIndex_ = info[2].As<Napi::Number>().Int32Value();
    std::error_condition err = chd_.open(input_, false, nullptr);
    if (err) {
      Napi::Error::New(env, "failed to open CHD: " + err.message()).ThrowAsJavaScriptException();
      return;
    }
    try {
      cdrom_ = std::make_unique<cdrom_file>(&chd_);
      toc_ = cdrom_->get_toc();
      if (mode_ == MODE_CUEBIN && cdrom_->is_gdrom()) {
        apply_gdrom_cuebin_toc_adjustment(toc_);
      }
    } catch (const std::exception& e) {
      Napi::Error::New(env, std::string("failed to read CHD TOC: ") + e.what())
          .ThrowAsJavaScriptException();
      return;
    } catch (...) {
      Napi::Error::New(env, "failed to read CHD TOC").ThrowAsJavaScriptException();
      return;
    }
    // toc_.tracks is a fixed-size array; reject an out-of-range index before it
    // is used below (and in Produce) to avoid an out-of-bounds read.
    if (trackIndex_ < 0 || trackIndex_ >= int(toc_.numtrks)) {
      Napi::RangeError::New(env, "track index out of range").ThrowAsJavaScriptException();
      return;
    }
    chdVersion_ = chd_.version();
    const cdrom_file::track_info& t = toc_.tracks[trackIndex_];
    const std::string underflow = cuebin_underflow_error(t, trackIndex_);
    if (!underflow.empty()) {
      Napi::Error::New(env, underflow).ThrowAsJavaScriptException();
      return;
    }
    actualframes_ = port_actual_frames(t);
    frame_ = 0;
  }

  // Emit up to maxBytes of this track's DATA-FRAME bytes (no pregap/postgap
  // silence). Mirrors do_extract_cd's per-frame read/byte-swap/splitframes pull.
  size_t Produce(uint8_t* out, size_t maxBytes);

private:
  friend class ReaderBase<TrackReader>;

  // Idempotent: chd_file::close() resets its file handle and cdrom_.reset() on
  // an already-null pointer is a no-op, so repeated calls are safe.
  void Teardown() {
    cdrom_.reset();
    chd_.close();
  }

  std::string input_;
  int mode_ = MODE_CUEBIN;
  int trackIndex_ = 0;
  uint32_t chdVersion_ = 0;
  chd_file chd_;
  std::unique_ptr<cdrom_file> cdrom_;
  cdrom_file::toc toc_{};
  uint32_t actualframes_ = 0;
  uint32_t frame_ = 0;
  std::vector<uint8_t> frameBuf_;
  size_t frameBufPos_ = 0;
};

size_t TrackReader::Produce(uint8_t* out, size_t maxBytes) {
  size_t written = 0;
  const cdrom_file::track_info& t = toc_.tracks[trackIndex_];
  // frame_ is bumped when a frame is loaded, so the final frame's bytes can still be
  // buffered after frame_ reaches actualframes_. Keep draining frameBuf_ on leftover
  // bytes too, else a read(maxBytes) boundary mid-frame would drop that tail.
  while (written < maxBytes && (frameBufPos_ < frameBuf_.size() || frame_ < actualframes_)) {
    if (frameBufPos_ >= frameBuf_.size()) {
      int trk;
      int frameofs;
      if (trackIndex_ > 0 && frame_ < t.splitframes) {
        // pull data from previous track, the reverse of how splitframes is used
        // when making the GD-ROM CHDs
        trk = trackIndex_ - 1;
        frameofs = toc_.tracks[trk].frames - t.splitframes + frame_;
      } else {
        trk = trackIndex_;
        frameofs = int(frame_) - int(t.splitframes);
      }
      const cdrom_file::track_info& st = toc_.tracks[trk];
      frameBuf_.assign(st.datasize, 0);
      // read_data's bool result is intentionally ignored, matching chdman's
      // do_extract_cd (chdman.cpp line 2987): on a read miss the pre-zeroed
      // buffer is emitted as silence rather than erroring, for byte parity.
      cdrom_->read_data(cdrom_->get_track_start_phys(trk) + frameofs, frameBuf_.data(), st.trktype,
                        true);
      // for CDRWin and GDI audio tracks must be reversed; for GDI with CHD
      // version < 5 the source CHD audio tracks are already reversed
      const bool swap = ((mode_ == MODE_GDI && chdVersion_ > 4) || mode_ == MODE_CUEBIN) &&
                        st.trktype == cdrom_file::CD_TRACK_AUDIO;
      if (swap) {
        for (uint32_t i = 0; i + 1 < st.datasize; i += 2) {
          std::swap(frameBuf_[i], frameBuf_[i + 1]);
        }
      }
      frameBufPos_ = 0;
      frame_++;
    }
    size_t avail = frameBuf_.size() - frameBufPos_;
    size_t n = std::min(maxBytes - written, avail);
    std::memcpy(out + written, frameBuf_.data() + frameBufPos_, n);
    frameBufPos_ += n;
    written += n;
  }
  return written;
}

// ---- chdman raw logical reader ----

// A pull-based reader over the full logical byte range of a RAW, HARD_DISK, or
// DVD CHD. Owns its own chd_file and emits exactly the bytes chd_file::read_bytes
// would write, i.e. the same bytes chdman's extractRaw would produce.
class RawReader : public ReaderBase<RawReader> {
public:
  static Napi::Function GetClass(Napi::Env env) {
    return DefineClass(env, "RawReader",
                       {
                           InstanceMethod("read", &RawReader::Read),
                           InstanceMethod("close", &RawReader::Close),
                       });
  }

  explicit RawReader(const Napi::CallbackInfo& info) : ReaderBase<RawReader>(info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
      Napi::TypeError::New(env, "RawReader(inputFilename) required").ThrowAsJavaScriptException();
      return;
    }
    std::string input = info[0].As<Napi::String>();
    std::error_condition err = chd_.open(input, false, nullptr);
    if (err) {
      Napi::Error::New(env, "failed to open CHD: " + err.message()).ThrowAsJavaScriptException();
      return;
    }
    total_ = chd_.logical_bytes();
  }

  // Emit up to maxBytes of this CHD's logical bytes starting at pos_.
  size_t Produce(uint8_t* out, size_t maxBytes) {
    if (pos_ >= total_) return 0;
    // maxBytes comes from Read's Uint32Value(), so the clamped result always fits in uint32_t.
    uint32_t n = static_cast<uint32_t>(std::min<uint64_t>(maxBytes, total_ - pos_));
    std::error_condition err = chd_.read_bytes(pos_, out, n);
    if (err) throw std::runtime_error("CHD read_bytes failed: " + err.message());
    pos_ += n;
    return n;
  }

private:
  friend class ReaderBase<RawReader>;

  // Idempotent: chd_file::close() resets its file handle, so repeated calls are
  // safe.
  void Teardown() { chd_.close(); }

  chd_file chd_;
  uint64_t total_ = 0;
  uint64_t pos_ = 0;
};

// Holds the class constructors for every ObjectWrap type registered by this
// addon.  Stored as the addon's instance data so factories can retrieve them
// without a global.
struct Addon {
  Napi::FunctionReference trackReader;
  Napi::FunctionReference rawReader;
};

// Factory: construct a TrackReader from the class constructor stored as the
// addon's instance data.
static Napi::Value OpenTrackReader(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Function ctor = env.GetInstanceData<Addon>()->trackReader.Value();
  return ctor.New({info[0], info[1], info[2]});
}

// Factory: construct a RawReader from the class constructor stored as the
// addon's instance data.
static Napi::Value OpenRawReader(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Function ctor = env.GetInstanceData<Addon>()->rawReader.Value();
  return ctor.New({info[0]});
}

static Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  Napi::Function trackReaderClass = TrackReader::GetClass(env);
  Napi::Function rawReaderClass = RawReader::GetClass(env);
  env.SetInstanceData(new Addon{ Napi::Persistent(trackReaderClass), Napi::Persistent(rawReaderClass) });

  exports.Set("info", Napi::Function::New(env, Info));
  exports.Set("listTracks", Napi::Function::New(env, ListTracks));
  exports.Set("openTrackReader", Napi::Function::New(env, OpenTrackReader));
  exports.Set("openRawReader", Napi::Function::New(env, OpenRawReader));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll)
