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
#include "strformat.h"

// ===== BEGIN ported from deps/mame/src/tools/chdman.cpp @ MAME 0.289 (submodule tag mame0289) =====
// Re-port when bumping the MAME submodule: diff each sub-block against the cited
// line range. Helpers are `port_`-prefixed to avoid name clashes.
//
// This region is kept byte-faithful to upstream MAME so it stays diff-able for
// re-ports: clang-format and clang-tidy are both disabled for it.
// clang-format off
// NOLINTBEGIN

// MODE_* constants (chdman.cpp lines 71-73).
enum {
  MODE_NORMAL = 0,
  MODE_CUEBIN = 1,
  MODE_GDI = 2,
};

// chdman.cpp: msf_string_from_frames (verbatim, line 1076).
static std::string port_msf_string_from_frames(uint32_t frames) {
  return util::string_format("%02d:%02d:%02d", frames / (75 * 60), (frames / 75) % 60, frames % 75);
}

// chdman's do_extract_cd writes `frames - padframes + splitframes` data frames
// per split bin (chdman.cpp line 2972). Callers must first confirm the track does
// not underflow via cuebin_underflow_error().
static uint32_t port_actual_frames(const cdrom_file::track_info& t) {
  return static_cast<uint32_t>(int64_t(t.frames) + int64_t(t.splitframes) - int64_t(t.padframes));
}

// Some GD-ROM CHDs cannot be expressed as cue/bin: their high-density track has
// padframes exceeding frames+splitframes, so chdman's uint32 frame formula above
// underflows to ~4.29e9 frames (~10 TB) and extraction would run far past chdman's
// total_bytes (chdman.cpp line 2738) -- i.e. past 100% of the disc. The underflow
// is detected up front instead, so callers (e.g. ChdBinCue) fall back to gdi/raw.
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

// chdman.cpp output_track_metadata 1531-1590, MODE_GDI + MODE_CUEBIN only,
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

// chdman.cpp 2852-2916, GD-ROM Redump TOC adjustment, mutating toc in place.
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

// chdman.cpp 2748-2808, %t templating for one track (always split-bin).
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
// the TOC text is normalized to the .gdi form ChdGdi expects (quote-stripped,
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
    // LF. ChdGdi expects them quote-stripped, CRLF, no empty lines, with a
    // trailing CRLF. Normalize to match.
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
// NOLINTEND
// clang-format on
// ===== END ported region =====

// ---- shared pull-reader scaffolding ----

// The most one read() may request. Each read allocates a buffer of the requested size, and Node.js
// 22 aborts the process when it cannot allocate one instead of throwing. This bound is far past
// any useful read size, and small enough to allocate on 32-bit targets.
constexpr size_t kMaxRequestBytes = 64U << 20U;  // 64 MiB

// Create and queue a worker, which deletes itself once OnOK() or OnError() has run. A worker that
// cannot be created or queued throws a Napi::Error instead, having been freed.
template <typename Worker, typename... Args>
static void QueueWorker(Args&&... args) {
    auto* const worker = new Worker(std::forward<Args>(args)...);
    try {
        worker->Queue();
    } catch (...) {
        delete worker;
        throw;
    }
}

// Drops a Source's last reference on the thread pool, so that its CHD closes there, as Node.js'
// own fs.close() does. A read worker in flight may hold the other reference, in which case it
// drops the last one at the end of its own Execute(), also on the thread pool.
template <typename Source>
class CloseWorker : public Napi::AsyncWorker {
   public:
    CloseWorker(Napi::Env env, std::shared_ptr<Source> source) : Napi::AsyncWorker(env), source_(std::move(source)) {}

    // Release the Source. Runs on the worker thread.
    void Execute() override { source_.reset(); }

    // Nothing to settle: close() does not report its outcome
    void OnOK() override {}

   private:
    std::shared_ptr<Source> source_;
};

// Runs one read() on the thread pool: fills a Buffer from a Source's Produce(), then tells the
// Reader the read is done and settles the read's promise. Source and Reader must provide:
//   size_t Source::Produce(uint8_t* out, size_t maxBytes);  // worker thread
//   void   Reader::FinishRead();                             // main thread, after Execute()
template <typename Reader, typename Source>
class ReadWorker : public Napi::AsyncWorker {
   public:
    // Fills buffer, which is V8's own allocation rather than an external one: freeing an external
    // Buffer's memory posts its finalizer to the owning environment's thread, which races a
    // terminating Worker closing that environment's handles. The reference keeps the Buffer alive
    // while the worker thread writes to it; an environment tearing down waits for thread pool work
    // to finish before it releases any reference.
    ReadWorker(Napi::Env env, Napi::Promise::Deferred deferred, std::shared_ptr<Reader*> reader,
               std::shared_ptr<Source> source, const Napi::Buffer<uint8_t>& buffer)
        : Napi::AsyncWorker(env),
          deferred_(deferred),
          reader_(std::move(reader)),
          source_(std::move(source)),
          buffer_(Napi::Persistent(buffer)),
          data_(buffer.Data()),
          cap_(buffer.Length()) {}

    // Fill the Buffer from the Source. Runs on the worker thread.
    void Execute() override {
        try {
            n_ = source_->Produce(data_, cap_);
        } catch (const std::out_of_range& e) {
            // A track index the CHD doesn't have, found when the first read opens it
            rangeError_ = true;
            SetError(e.what());
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("unknown CHD read error");
        }

        // If the reader was closed mid-read, this is the last reference, and the CHD closes here
        // on the thread pool rather than when this worker is destroyed on the main thread
        source_.reset();
    }

    // Resolve with the bytes read: the whole Buffer, a view of its filled start, or null at the end
    void OnOK() override {
        // First, so that resolving can't throw past it and leave the reader Ref()'d and reading
        NotifyReader();
        Napi::Env const env = Env();
        Napi::Buffer<uint8_t> const buffer = buffer_.Value();
        if (n_ == 0) {
            deferred_.Resolve(env.Null());
        } else if (n_ == cap_) {
            deferred_.Resolve(buffer);
        } else {
            // A view of the first n_ bytes, which shares the Buffer's memory rather than copying
            // it. Only those bytes were written; the rest are uninitialized.
            deferred_.Resolve(
                buffer.Get("subarray")
                    .As<Napi::Function>()
                    .Call(buffer, {Napi::Number::New(env, 0), Napi::Number::New(env, static_cast<double>(n_))}));
        }
    }

    // Reject with the error Execute() set
    void OnError(const Napi::Error& e) override {
        NotifyReader();
        if (rangeError_) {
            deferred_.Reject(Napi::RangeError::New(Env(), e.Message()).Value());
        } else {
            deferred_.Reject(e.Value());
        }
    }

   private:
    // Tell the reader the read is done, unless it was destroyed. The reader holds a Ref() while it
    // reads, so only an environment tearing down, such as a terminated Worker's, destroys it first.
    void NotifyReader() {
        if (*reader_ != nullptr) {
            (*reader_)->FinishRead();  // may release the reader
        }
    }

    Napi::Promise::Deferred deferred_;

    // Cleared by the reader's destructor
    std::shared_ptr<Reader*> reader_;

    // Keeps the CHD open until Execute() is done with it, even if the reader is closed or destroyed first
    std::shared_ptr<Source> source_;

    // The Buffer that Execute() fills, and its memory
    Napi::Reference<Napi::Buffer<uint8_t>> buffer_;
    uint8_t* data_;
    size_t cap_;
    size_t n_ = 0;

    // Whether Execute() failed with std::out_of_range, which rejects with a RangeError
    bool rangeError_ = false;
};

// CRTP base for the JavaScript pull readers TrackReader and RawReader, which read a Source on
// the thread pool, one read at a time. Each Derived constructor stores the Source it reads from
// in source_.
//
// Safety invariant: the reader and the read worker in flight each hold the Source, so it is
// freed only once neither does. Produce() never runs on a freed Source, even if the reader is
// closed or destroyed mid-read. close() and the read worker both drop their references on the
// thread pool; only a reader garbage collected without close() frees its Source on the main
// thread, as Node.js does for a FileHandle that was never closed.
template <typename Derived, typename Source>
class ReaderBase : public Napi::ObjectWrap<Derived> {
   public:
    // Construct without a Source, which the Derived constructor then sets
    explicit ReaderBase(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<Derived>(info), self_(std::make_shared<ReaderBase*>(this)) {}

    // Tell any read worker still in flight that this reader no longer exists
    ~ReaderBase() override { *self_ = nullptr; }

    ReaderBase(const ReaderBase&) = delete;
    ReaderBase& operator=(const ReaderBase&) = delete;
    ReaderBase(ReaderBase&&) = delete;
    ReaderBase& operator=(ReaderBase&&) = delete;

    // read(maxBytes): resolve up to maxBytes bytes, or null at the end. Rejects a read after
    // close() or while another read is in flight.
    Napi::Value Read(const Napi::CallbackInfo& info);

    // Release this reader's hold on the CHD, on the thread pool. A read worker in flight holds
    // it too, so the CHD closes once the worker thread is done with it.
    void Close(const Napi::CallbackInfo& info) {
        if (!source_) {
            return;
        }
        // Moved out first, so that the worker's reference is never the last one while this
        // reader's is still being dropped here on the main thread
        std::shared_ptr<Source> source = std::move(source_);
        try {
            QueueWorker<CloseWorker<Source>>(info.Env(), std::move(source));
        } catch (...) {  // NOLINT(bugprone-empty-catch)
            // The worker could not be created or queued, so the CHD closes here instead, on the
            // main thread, when `source` goes out of scope
        }
    }

    // Mark the read as done. Called on the main thread by the read worker after Execute has returned.
    void FinishRead() {
        reading_ = false;
        this->Unref();  // balances the Ref() taken in Read(); may allow GC of this object
    }

   protected:
    // Empty after Close(), and after a constructor that threw, whose object JavaScript never receives
    std::shared_ptr<Source> source_;

   private:
    // Shared with every read worker so they know whether this reader still exists
    std::shared_ptr<ReaderBase*> self_;
    bool reading_ = false;
};

template <typename Derived, typename Source>
Napi::Value ReaderBase<Derived, Source>::Read(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
    if (!source_) {
        deferred.Reject(Napi::Error::New(env, "read after close").Value());
        return deferred.Promise();
    }
    if (reading_) {
        // Only one read worker may touch this reader's mutable state at a time
        deferred.Reject(Napi::Error::New(env, "concurrent read not allowed").Value());
        return deferred.Promise();
    }
    double const requested = info[0].IsNumber() ? info[0].As<Napi::Number>().DoubleValue() : 0;

    // Also catches NaN, which fails every comparison
    if (!(requested >= 1)) {
        deferred.Reject(Napi::TypeError::New(env, "maxBytes must be a positive number").Value());
        return deferred.Promise();
    }
    if (requested > static_cast<double>(kMaxRequestBytes)) {
        deferred.Reject(Napi::RangeError::New(env, "maxBytes is too large").Value());
        return deferred.Promise();
    }
    try {
        Napi::Buffer<uint8_t> const buffer = Napi::Buffer<uint8_t>::New(env, static_cast<size_t>(requested));
        QueueWorker<ReadWorker<ReaderBase, Source>>(env, deferred, self_, source_, buffer);
    } catch (const Napi::Error& e) {
        deferred.Reject(e.Value());
        return deferred.Promise();
    }
    // OnOK()/OnError() run later on this same thread, so setting these after Queue() is not a race
    reading_ = true;
    this->Ref();  // keep this object from being collected while the worker thread reads
    return deferred.Promise();
}

// ---- chdman info ----

// Map a chd_file's metadata tags to a stable type string (mirrors CHDType in index.ts).
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

// The four-character codec name chdman prints for a codec, or "none" for an unknown one
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

// Convert a ChdInfo to the JavaScript CHDInfo object. The single place that knows the JS-visible
// key names and value encodings; kept adjacent to ChdInfo so the two can be audited together.
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

// Opens a CHD on the thread pool and gathers its header information and hashes
class InfoWorker : public Napi::AsyncWorker {
   public:
    InfoWorker(Napi::Env env, Napi::Promise::Deferred deferred, std::string path)
        : Napi::AsyncWorker(env), deferred_(deferred), path_(std::move(path)) {}

    // Open the CHD and gather its ChdInfo. Runs on the worker thread.
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

    // Resolve with the CHDInfo
    void OnOK() override { deferred_.Resolve(ChdInfoToObject(Env(), data_)); }

    // Reject with the error Execute() set
    void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

   private:
    Napi::Promise::Deferred deferred_;
    std::string path_;
    ChdInfo data_;
};

// info(inputFilename): resolve a CHD's header information and hashes as a CHDInfo
static Napi::Value Info(const Napi::CallbackInfo& info) {
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

// ---- chdman list tracks ----

// Builds a CD-ROM/GD-ROM CHD's track listing on the thread pool
class ListTracksWorker : public Napi::AsyncWorker {
   public:
    ListTracksWorker(Napi::Env env, Napi::Promise::Deferred deferred, std::string path, int mode, std::string binArg,
                     std::string tocName)
        : Napi::AsyncWorker(env),
          deferred_(deferred),
          path_(std::move(path)),
          mode_(mode),
          binArg_(std::move(binArg)),
          tocName_(std::move(tocName)) {}

    // Open the CHD and build its listing. Runs on the worker thread.
    void Execute() override {
        try {
            std::string error;
            if (!BuildListing(path_, mode_, binArg_, tocName_, tocText_, tracks_, error)) {
                SetError(error);
            }
        } catch (const std::error_condition& e) {
            SetError(e.message());
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("unknown error listing CHD tracks");
        }
    }

    // Resolve with the TOC text and a descriptor for every track
    void OnOK() override {
        Napi::Env const env = Env();
        Napi::Object const out = Napi::Object::New(env);
        out.Set("tocText", tocText_);
        Napi::Array const arr = Napi::Array::New(env, tracks_.size());
        for (uint32_t i = 0; i < tracks_.size(); i++) {
            Napi::Object const t = Napi::Object::New(env);
            t.Set("index", Napi::Number::New(env, static_cast<double>(tracks_[i].index)));
            t.Set("filename", tracks_[i].filename);
            t.Set("type", tracks_[i].type);
            t.Set("size", Napi::Number::New(env, static_cast<double>(tracks_[i].size)));
            arr.Set(i, t);
        }
        out.Set("tracks", arr);
        deferred_.Resolve(out);
    }

    // Reject with the error Execute() set
    void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

   private:
    Napi::Promise::Deferred deferred_;
    std::string path_;
    int mode_;
    std::string binArg_;
    std::string tocName_;
    std::string tocText_;
    std::vector<TrackOut> tracks_;
};

// List the tracks of a CD-ROM/GD-ROM CHD: resolves the in-memory TOC text plus a
// per-track descriptor (index, output filename, type string, data-only size).
static Napi::Value ListTracks(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
    if (info.Length() < 4 || !info[0].IsString() || !info[1].IsNumber() || !info[2].IsString() || !info[3].IsString()) {
        deferred.Reject(
            Napi::TypeError::New(env, "listTracks(inputFilename, mode, binPatternOrBase, tocName) required").Value());
        return deferred.Promise();
    }

    // No serialization needed: BuildListing uses its own chd_file/cdrom_file and
    // touches no shared state.
    try {
        QueueWorker<ListTracksWorker>(env, deferred, info[0].As<Napi::String>().Utf8Value(),
                                      info[1].As<Napi::Number>().Int32Value(), info[2].As<Napi::String>().Utf8Value(),
                                      info[3].As<Napi::String>().Utf8Value());
    } catch (const Napi::Error& e) {
        deferred.Reject(e.Value());
    }
    return deferred.Promise();
}

// ---- chdman per-track pull reader ----

// A single CD-ROM (cue/bin) or GD-ROM (gdi) track. It owns its OWN chd_file +
// cdrom_file so that concurrent readers are fully independent (no shared state),
// and emits exactly the bytes chdman's do_extract_cd would write for that
// split-bin track: the DATA FRAMES ONLY. Virtual pregap/postgap are cue/gdi
// commands, never bytes; data-in-file pregaps are pulled from the previous track
// via splitframes.
//
// The CHD is opened lazily by the first read's worker, so no filesystem I/O runs on the main thread.
class TrackSource {
   public:
    // Remember the track; the CHD isn't opened until the first Produce()
    TrackSource(std::string input, int mode, int trackIndex)
        : input_(std::move(input)), mode_(mode), trackIndex_(trackIndex) {}

    // Emit up to maxBytes of this track's DATA-FRAME bytes (no pregap/postgap
    // silence). Mirrors do_extract_cd's per-frame read/byte-swap/splitframes pull.
    size_t Produce(uint8_t* out, size_t maxBytes);

   private:
    // Open the track, throwing std::out_of_range for a track index the CHD doesn't have. Runs on
    // the worker thread.
    void Open() {
        std::error_condition const err = chd_.open(input_, false, nullptr);
        if (err) {
            throw std::runtime_error("failed to open CHD: " + err.message());
        }
        try {
            cdrom_ = std::make_unique<cdrom_file>(&chd_);
            toc_ = cdrom_->get_toc();
            if (mode_ == MODE_CUEBIN && cdrom_->is_gdrom()) {
                apply_gdrom_cuebin_toc_adjustment(toc_);
            }
        } catch (const std::exception& e) {
            throw std::runtime_error(std::string("failed to read CHD TOC: ") + e.what());
        } catch (...) {
            throw std::runtime_error("failed to read CHD TOC");
        }
        // toc_.tracks is a fixed-size array; reject an out-of-range index before it
        // is used below (and in Produce) to avoid an out-of-bounds read.
        if (trackIndex_ < 0 || std::cmp_greater_equal(trackIndex_, toc_.numtrks)) {
            throw std::out_of_range("track index out of range");
        }
        chdVersion_ = chd_.version();
        const cdrom_file::track_info& t = toc_.tracks[trackIndex_];
        const std::string underflow = cuebin_underflow_error(t, trackIndex_);
        if (!underflow.empty()) {
            throw std::runtime_error(underflow);
        }
        actualframes_ = port_actual_frames(t);
        opened_ = true;
    }

    std::string input_;
    bool opened_ = false;
    int mode_ = MODE_CUEBIN;
    int trackIndex_ = 0;
    uint32_t chdVersion_ = 0;
    chd_file chd_;

    // Declared after chd_, which it points to, so it is destroyed first
    std::unique_ptr<cdrom_file> cdrom_;
    cdrom_file::toc toc_{};
    uint32_t actualframes_ = 0;
    uint32_t frame_ = 0;
    std::vector<uint8_t> frameBuf_;
    size_t frameBufPos_ = 0;
};

size_t TrackSource::Produce(uint8_t* out, size_t maxBytes) {
    if (!opened_) {
        Open();
    }
    size_t written = 0;
    const cdrom_file::track_info& t = toc_.tracks[trackIndex_];

    // frame_ is bumped when a frame is loaded, so the final frame's bytes can still be
    // buffered after frame_ reaches actualframes_. Keep draining frameBuf_ on leftover
    // bytes too, else a read(maxBytes) boundary mid-frame would drop that tail.
    while (written < maxBytes && (frameBufPos_ < frameBuf_.size() || frame_ < actualframes_)) {
        if (frameBufPos_ >= frameBuf_.size()) {
            int trk = 0;
            int frameofs = 0;
            if (trackIndex_ > 0 && frame_ < t.splitframes) {
                // pull data from previous track, the reverse of how splitframes is used
                // when making the GD-ROM CHDs
                trk = trackIndex_ - 1;
                frameofs = static_cast<int>(toc_.tracks[trk].frames) - static_cast<int>(t.splitframes) +
                           static_cast<int>(frame_);
            } else {
                trk = trackIndex_;
                frameofs = static_cast<int>(frame_) - static_cast<int>(t.splitframes);
            }
            const cdrom_file::track_info& st = toc_.tracks[trk];

            // A whole frame that fits is read straight into `out`, and only one that doesn't
            // goes through frameBuf_
            bool const direct = maxBytes - written >= st.datasize;
            uint8_t* frame = out + written;
            if (!direct) {
                frameBuf_.resize(st.datasize);
                frame = frameBuf_.data();
            }
            std::memset(frame, 0, st.datasize);

            // read_data's bool result is intentionally ignored, matching chdman's
            // do_extract_cd (chdman.cpp line 2991): on a read miss the pre-zeroed
            // buffer is emitted as silence rather than erroring, for byte parity.
            cdrom_->read_data(cdrom_->get_track_start_phys(trk) + frameofs, frame, st.trktype, true);

            // for CDRWin and GDI audio tracks must be reversed; for GDI with CHD
            // version < 5 the source CHD audio tracks are already reversed
            const bool swap = ((mode_ == MODE_GDI && chdVersion_ > 4) || mode_ == MODE_CUEBIN) &&
                              st.trktype == cdrom_file::CD_TRACK_AUDIO;
            if (swap) {
                std::span<uint8_t> const bytes(frame, st.datasize);
                for (uint32_t i = 0; i + 1 < st.datasize; i += 2) {
                    std::swap(bytes[i], bytes[i + 1]);
                }
            }
            frame_++;
            if (direct) {
                // frameBuf_ is already drained, so the next frame is loaded next
                written += st.datasize;
                continue;
            }
            frameBufPos_ = 0;
        }
        size_t const avail = frameBuf_.size() - frameBufPos_;
        size_t const n = std::min(maxBytes - written, avail);
        std::memcpy(out + written, frameBuf_.data() + frameBufPos_, n);
        frameBufPos_ += n;
        written += n;
    }
    return written;
}

// A pull reader over a TrackSource
class TrackReader : public ReaderBase<TrackReader, TrackSource> {
   public:
    // Define the JavaScript class, with its read() and close() methods
    static Napi::Function GetClass(Napi::Env env) {
        return DefineClass(env, "TrackReader",
                           {
                               InstanceMethod("read", &TrackReader::Read),
                               InstanceMethod("close", &TrackReader::Close),
                           });
    }

    // new TrackReader(inputFilename, mode, trackIndex): throws to JavaScript for bad arguments; the
    // track is opened by the first read(), which rejects with a RangeError for a track index the
    // CHD doesn't have
    explicit TrackReader(const Napi::CallbackInfo& info) : ReaderBase<TrackReader, TrackSource>(info) {
        Napi::Env const env = info.Env();
        if (info.Length() < 3 || !info[0].IsString() || !info[1].IsNumber() || !info[2].IsNumber()) {
            Napi::TypeError::New(env, "TrackReader(inputFilename, mode, trackIndex) required")
                .ThrowAsJavaScriptException();
            return;
        }
        std::string const inputPath = info[0].As<Napi::String>();
        int const mode = info[1].As<Napi::Number>().Int32Value();
        int const trackIndex = info[2].As<Napi::Number>().Int32Value();
        try {
            source_ = std::make_shared<TrackSource>(inputPath, mode, trackIndex);
        } catch (const std::exception& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        }
    }
};

// ---- chdman raw logical reader ----

// The full logical byte range of a RAW, HARD_DISK, or DVD CHD. Owns its own
// chd_file and emits exactly the bytes chd_file::read_bytes would write, i.e. the
// same bytes chdman's extractRaw would produce. The CHD is opened lazily by the first read's
// worker, so no filesystem I/O runs on the main thread.
class RawSource {
   public:
    // Remember the path; the CHD isn't opened until the first Produce()
    explicit RawSource(std::string input) : input_(std::move(input)) {}

    // Emit up to maxBytes of this CHD's logical bytes starting at pos_. Runs on the worker thread.
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

// A pull reader over a RawSource
class RawReader : public ReaderBase<RawReader, RawSource> {
   public:
    // Define the JavaScript class, with its read() and close() methods
    static Napi::Function GetClass(Napi::Env env) {
        return DefineClass(env, "RawReader",
                           {
                               InstanceMethod("read", &RawReader::Read),
                               InstanceMethod("close", &RawReader::Close),
                           });
    }

    // new RawReader(inputFilename): throws to JavaScript for a missing filename; the CHD is
    // opened by the first read()
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
    Napi::Env const env = info.Env();
    Napi::Function const ctor = env.GetInstanceData<Addon>()->trackReader.Value();
    return ctor.New({info[0], info[1], info[2]});
}

// Factory: construct a RawReader from the class constructor stored as the
// addon's instance data.
static Napi::Value OpenRawReader(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Function const ctor = env.GetInstanceData<Addon>()->rawReader.Value();
    return ctor.New({info[0]});
}

// Register the reader classes as instance data and export the addon's functions
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
