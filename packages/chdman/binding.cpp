#include <napi.h>

#include <algorithm>
#include <array>
#include <cstring>
#include <limits>
#include <memory>
#include <new>
#include <optional>
#include <ostream>
#include <regex>
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
// total_bytes (chdman.cpp line 2738) -- i.e. past 100% of the disc. The chdman CLI
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
// NOLINTEND
// clang-format on
// ===== END ported region =====

// ---- shared pull-reader scaffolding ----

// Reject a promise with JavaScript's pending exception, or else a new error from create, returning
// whether JavaScript could receive it
static bool Reject(napi_env env, napi_deferred deferred, const std::string& message,
                   decltype(&napi_create_error) create = napi_create_error) {
    bool pending = false;
    napi_value error = nullptr;
    if (napi_is_exception_pending(env, &pending) == napi_ok && pending) {
        if (napi_get_and_clear_last_exception(env, &error) != napi_ok) {
            return false;
        }
    } else {
        napi_value text = nullptr;
        if (napi_create_string_utf8(env, message.data(), message.size(), &text) != napi_ok ||
            create(env, nullptr, text, &error) != napi_ok) {
            return false;
        }
    }
    return napi_reject_deferred(env, deferred, error) == napi_ok;
}

// Read a call's first N arguments, leaving any it wasn't passed undefined
template <size_t N>
static bool GetArgs(napi_env env, napi_callback_info info, std::array<napi_value, N>& args) {
    size_t argc = N;
    return napi_get_cb_info(env, info, &argc, args.data(), nullptr, nullptr) == napi_ok;
}

// Read a JavaScript string, returning whether value is one
static bool GetString(napi_env env, napi_value value, std::string& out) {
    napi_valuetype type = napi_undefined;
    size_t length = 0;
    if (napi_typeof(env, value, &type) != napi_ok || type != napi_string ||
        napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok) {
        return false;
    }
    out.resize(length);
    return napi_get_value_string_utf8(env, value, out.data(), length + 1, &length) == napi_ok;
}

// Read a JavaScript number as an int32, returning whether value is one
static bool GetInt32(napi_env env, napi_value value, int32_t& out) {
    napi_valuetype type = napi_undefined;
    return napi_typeof(env, value, &type) == napi_ok && type == napi_number &&
           napi_get_value_int32(env, value, &out) == napi_ok;
}

// Create a JavaScript string, or nullptr if JavaScript can't receive it
static napi_value ToString(napi_env env, const std::string& value) {
    napi_value result = nullptr;
    napi_create_string_utf8(env, value.data(), value.size(), &result);
    return result;
}

// Create a JavaScript number, or nullptr if JavaScript can't receive it
static napi_value ToNumber(napi_env env, double value) {
    napi_value result = nullptr;
    napi_create_double(env, value, &result);
    return result;
}

// Create JavaScript's undefined, or nullptr if JavaScript can't receive it
static napi_value ToUndefined(napi_env env) {
    napi_value result = nullptr;
    napi_get_undefined(env, &result);
    return result;
}

// Set an object's property, returning whether it was set, which it isn't for a value that failed
// to be created
static bool SetProperty(napi_env env, napi_value object, const char* key, napi_value value) {
    return value != nullptr && napi_set_named_property(env, object, key, value) == napi_ok;
}

// Set an array's element, returning whether it was set, which it isn't for a value that failed to
// be created
static bool SetElement(napi_env env, napi_value array, uint32_t index, napi_value value) {
    return value != nullptr && napi_set_element(env, array, index, value) == napi_ok;
}

// Runs Derived's Execute() on the thread pool, then its Complete() on the main thread unless the
// environment cancelled the task. Uses the N-API C functions rather than Napi::AsyncWorker: with C++
// exceptions disabled, node-addon-api aborts the process when a call fails, and every call can fail
// once a terminated Worker's environment can no longer run JavaScript.
template <typename Derived>
class AsyncTask {
   public:
    // Queue a task on the thread pool, returning whether it was queued
    static bool Queue(napi_env env, std::unique_ptr<Derived> task) {
        napi_value name = nullptr;
        if (napi_create_string_utf8(env, "chdman", NAPI_AUTO_LENGTH, &name) != napi_ok ||
            napi_create_async_work(env, nullptr, name, Run, Finish, task.get(), &task->work_) != napi_ok) {
            return false;
        }
        if (napi_queue_async_work(env, task->work_) != napi_ok) {
            napi_delete_async_work(env, task->work_);
            return false;
        }
        task.release();  // freed by Finish()
        return true;
    }

   private:
    static void Run(napi_env /*env*/, void* data) { static_cast<Derived*>(data)->Execute(); }

    static void Finish(napi_env env, napi_status status, void* data) {
        std::unique_ptr<Derived> const task(static_cast<Derived*>(data));
        napi_delete_async_work(env, task->work_);
        napi_handle_scope scope = nullptr;
        if (status == napi_cancelled || napi_open_handle_scope(env, &scope) != napi_ok) {
            return;
        }
        task->Complete(env);
        napi_close_handle_scope(env, scope);
    }

    napi_async_work work_ = nullptr;
};

// Drives a Source's Produce() on a worker thread so the (blocking, possibly
// decompressing) CHD reads never run on the V8 main thread, then tells the Reader
// the read is done. One template covers all reader types; they must expose
//   size_t Source::Produce(uint8_t* out, size_t maxBytes);  // worker thread
//   void   Reader::FinishRead();                             // main thread, post-Execute
template <typename Reader, typename Source>
class ReadWorker : public AsyncTask<ReadWorker<Reader, Source>> {
   public:
    ReadWorker(napi_deferred deferred, std::shared_ptr<Reader*> reader, std::shared_ptr<Source> source, size_t maxBytes)
        : deferred_(deferred),
          reader_(std::move(reader)),
          source_(std::move(source)),
          // new[] rather than std::vector, deliberately: a vector would
          // value-initialize every byte, and Produce() overwrites the only part
          // of it anyone is ever shown. Zeroing a chunk per read just to memcpy
          // over it is measurable on a multi-gigabyte image and buys nothing --
          // n_ bounds what is exposed, and the bytes past it never leave here.
          buf_(new uint8_t[maxBytes]),
          cap_(maxBytes) {}

    // Read from the source on the thread pool
    void Execute() {
        try {
            n_ = source_->Produce(buf_.get(), cap_);
        } catch (const std::exception& e) {
            error_ = e.what();
        } catch (...) {
            error_ = "unknown CHD read error";
        }
    }

    // Settle the read's promise and tell the reader the read is done, unless the reader was
    // destroyed or JavaScript can't run. The reader holds a Ref() while it reads, so only an
    // environment tearing down, such as a terminated Worker's, destroys it first: that finalizes
    // every object before it runs the callbacks of reads still in flight, and nothing is left to
    // receive their results.
    void Complete(napi_env env) {
        if (*reader_ != nullptr && Settle(env)) {
            (*reader_)->FinishRead();  // may release the reader
        }
    }

   private:
    // Resolve or reject the read's promise, returning whether JavaScript could receive it
    bool Settle(napi_env env) {
        if (!error_.empty()) {
            return Reject(env, deferred_, error_);
        }
        napi_value result = nullptr;
        if (n_ == 0) {
            return napi_get_null(env, &result) == napi_ok && napi_resolve_deferred(env, deferred_, result) == napi_ok;
        }
        // Give JS the worker's own allocation as the Buffer's backing store
        // rather than copying it: the finalizer frees it once JS is done.
        // Only the first n_ bytes are exposed; the rest are uninitialized.
        // `raw` is unowned between release() and a successful creation, which
        // is what the failure path below cleans up.
        uint8_t* raw = buf_.release();
        if (napi_create_external_buffer(
                env, n_, raw,
                [](napi_env /*env*/, void* data, void* /*hint*/) { delete[] static_cast<uint8_t*>(data); }, nullptr,
                &result) != napi_ok) {
            // Reject rather than resolving with no value, which JavaScript would read as the end of
            // the stream
            delete[] raw;
            return Reject(env, deferred_, "failed to allocate the read result");
        }
        return napi_resolve_deferred(env, deferred_, result) == napi_ok;
    }

    napi_deferred deferred_;
    // Cleared by the reader's destructor
    std::shared_ptr<Reader*> reader_;
    // Keeps the CHD open until this worker is destroyed, even if the reader is closed or destroyed first
    std::shared_ptr<Source> source_;
    // A runtime-sized owning buffer, which is exactly what unique_ptr<T[]> is
    // for; std::array would need the size at compile time.
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays)
    std::unique_ptr<uint8_t[]> buf_;
    size_t cap_ = 0;
    size_t n_ = 0;
    std::string error_;  // Empty on success
};

// CRTP base implementing the single audited copy of the async pull-reader
// lifecycle shared by TrackReader and RawReader. Each Derived constructor stores
// the Source it reads from in source_.
//
// Safety invariant: the reader and the read worker in flight each hold the Source,
// so it is freed on the main thread only once neither does. Produce (worker
// thread) never runs on a freed Source, even if the reader is closed or destroyed
// mid-read. The reading_ flag rejects a second concurrent read(). Ref()/Unref()
// keep the object alive across the async read and always balance, on both the OK
// and error paths, so a destroyed stream cannot leak.
template <typename Derived, typename Source>
class ReaderBase : public Napi::ObjectWrap<Derived> {
   public:
    explicit ReaderBase(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<Derived>(info), self_(std::make_shared<ReaderBase*>(this)) {}

    ~ReaderBase() override { *self_ = nullptr; }

    ReaderBase(const ReaderBase&) = delete;
    ReaderBase& operator=(const ReaderBase&) = delete;
    ReaderBase(ReaderBase&&) = delete;
    ReaderBase& operator=(ReaderBase&&) = delete;

    // read(maxBytes): resolve up to maxBytes bytes, or null at the end
    static napi_value Read(napi_env env, napi_callback_info info);

    // Release this reader's hold on the CHD. A read worker in flight holds it too,
    // so the CHD closes once the worker thread is done with it.
    static napi_value Close(napi_env env, napi_callback_info info);

    // Describe a method that N-API calls directly. node-addon-api's instance methods abort the
    // process when they can't unwrap the reader, which JavaScript can still call after a terminated
    // Worker's environment has finalized it.
    static Napi::ClassPropertyDescriptor<Derived> RawMethod(const char* name, napi_callback callback) {
        return napi_property_descriptor{.utf8name = name, .method = callback, .attributes = napi_default};
    }

    // Mark the read as done. Called on the main thread by the read worker after Execute has returned.
    void FinishRead() {
        reading_ = false;
        this->Unref();  // balances the Ref() taken in StartRead(); may allow GC of this object
    }

   protected:
    // Empty after Close(), and after a constructor that threw, whose object JavaScript never receives
    std::shared_ptr<Source> source_;

   private:
    // Start a read of up to maxBytes bytes that settles deferred
    void StartRead(napi_env env, napi_deferred deferred, napi_value maxBytes);

    // Shared with every read worker so they know whether this reader still exists
    std::shared_ptr<ReaderBase*> self_;
    bool reading_ = false;
};

// Uses the N-API C functions rather than node-addon-api's, which abort the process when a call
// fails: JavaScript can still call these while a terminated Worker's environment tears down, after
// it has finalized every reader
template <typename Derived, typename Source>
napi_value ReaderBase<Derived, Source>::Read(napi_env env, napi_callback_info info) {
    napi_deferred deferred = nullptr;
    napi_value promise = nullptr;
    if (napi_create_promise(env, &deferred, &promise) != napi_ok) {
        return nullptr;
    }
    size_t argc = 1;
    napi_value maxBytes = nullptr;
    napi_value self = nullptr;
    void* reader = nullptr;
    if (napi_get_cb_info(env, info, &argc, &maxBytes, &self, nullptr) != napi_ok ||
        napi_unwrap(env, self, &reader) != napi_ok) {
        Reject(env, deferred, "read after finalization");
        return promise;
    }
    ReaderBase* const base = static_cast<Derived*>(reader);
    base->StartRead(env, deferred, maxBytes);
    return promise;
}

template <typename Derived, typename Source>
napi_value ReaderBase<Derived, Source>::Close(napi_env env, napi_callback_info info) {
    napi_value self = nullptr;
    void* reader = nullptr;
    if (napi_get_cb_info(env, info, nullptr, nullptr, &self, nullptr) == napi_ok &&
        napi_unwrap(env, self, &reader) == napi_ok) {
        ReaderBase* const base = static_cast<Derived*>(reader);
        base->source_.reset();
    }
    return nullptr;
}

// Defined out-of-line because it constructs a ReadWorker, whose full
// definition must precede this. Shared by every ReaderBase subclass.
template <typename Derived, typename Source>
void ReaderBase<Derived, Source>::StartRead(napi_env env, napi_deferred deferred, napi_value maxBytes) {
    if (!source_) {
        Reject(env, deferred, "read after close");
        return;
    }
    if (reading_) {
        // Only one read worker may touch this reader's mutable state at a time.
        Reject(env, deferred, "concurrent read not allowed");
        return;
    }
    // A zero-byte read would resolve null, which JavaScript reads as the end of the stream
    double requested = 0;
    napi_valuetype type = napi_undefined;
    if (napi_typeof(env, maxBytes, &type) != napi_ok || type != napi_number ||
        napi_get_value_double(env, maxBytes, &requested) != napi_ok) {
        requested = 0;
    }
    // Bounded so the static_cast<size_t> below is defined, and to Number.MAX_SAFE_INTEGER, past
    // which JavaScript cannot request an exact byte count
    constexpr double kMaxRequestBytes =
        std::min(9007199254740991.0, static_cast<double>(std::numeric_limits<size_t>::max()));
    bool const valid = requested >= 1 && requested <= kMaxRequestBytes;
    if (!valid) {
        Reject(env, deferred, "maxBytes must be a positive number", napi_create_type_error);
        return;
    }
    auto const count = static_cast<size_t>(requested);
    // Allocate the worker (and its count-byte buffer) BEFORE mutating reader state:
    // if that allocation throws, reading_/Ref() must not be left dangling
    std::unique_ptr<ReadWorker<ReaderBase, Source>> worker;
    try {
        worker = std::make_unique<ReadWorker<ReaderBase, Source>>(deferred, self_, source_, count);
    } catch (const std::bad_alloc&) {
        Reject(env, deferred, "failed to allocate the read buffer");
        return;
    }
    if (!ReadWorker<ReaderBase, Source>::Queue(env, std::move(worker))) {
        // The worker will never run, so reader state must not be left marked as reading
        Reject(env, deferred, "failed to queue the read");
        return;
    }
    // Complete() runs later on this same thread, so setting these after Queue() is not a race
    reading_ = true;
    this->Ref();  // keep this object (and its CHD) alive while the worker thread reads
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

// The single place that knows the JS-visible key names and value encodings. Keep
// this adjacent to ChdInfo so the struct and its marshalling can be audited together.
static napi_value ChdInfoToObject(napi_env env, const ChdInfo& info) {
    napi_value out = nullptr;
    napi_value compression = nullptr;
    if (napi_create_object(env, &out) != napi_ok || napi_create_array(env, &compression) != napi_ok) {
        return nullptr;
    }
    for (uint32_t i = 0; i < info.compression.size(); i++) {
        if (!SetElement(env, compression, i, ToString(env, info.compression[i]))) {
            return nullptr;
        }
    }
    bool const set =
        SetProperty(env, out, "inputFile", ToString(env, info.inputFile)) &&
        SetProperty(env, out, "type", ToString(env, info.type)) &&
        SetProperty(env, out, "fileVersion", ToNumber(env, static_cast<double>(info.fileVersion))) &&
        SetProperty(env, out, "logicalSize", ToNumber(env, static_cast<double>(info.logicalSize))) &&
        SetProperty(env, out, "hunkSize", ToNumber(env, static_cast<double>(info.hunkSize))) &&
        SetProperty(env, out, "totalHunks", ToNumber(env, static_cast<double>(info.totalHunks))) &&
        SetProperty(env, out, "unitSize", ToNumber(env, static_cast<double>(info.unitSize))) &&
        SetProperty(env, out, "totalUnits", ToNumber(env, static_cast<double>(info.totalUnits))) &&
        SetProperty(env, out, "compression", compression) &&
        SetProperty(env, out, "chdSize", ToNumber(env, static_cast<double>(info.chdSize))) &&
        SetProperty(env, out, "sha1", info.sha1.has_value() ? ToString(env, *info.sha1) : ToUndefined(env)) &&
        SetProperty(env, out, "dataSha1", info.dataSha1.has_value() ? ToString(env, *info.dataSha1) : ToUndefined(env));
    return set ? out : nullptr;
}

static napi_value Info(napi_env env, napi_callback_info info) {
    std::array<napi_value, 1> args{};
    std::string inputPath;
    if (!GetArgs(env, info, args) || !GetString(env, args[0], inputPath)) {
        napi_throw_type_error(env, nullptr, "inputFilename (string) required");
        return nullptr;
    }

    chd_file chd;
    // NOTE: this reads only the CHD header and runs synchronously on the V8 main
    // thread; it is fast enough that no AsyncWorker is needed.
    std::error_condition const err = chd.open(inputPath, false, nullptr);
    if (err) {
        napi_throw_error(env, nullptr, ("failed to open CHD: " + err.message()).c_str());
        return nullptr;
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
        chd_codec_type const c = chd.compression(i);
        if (c != CHD_CODEC_NONE) data.compression.push_back(CompressionString(c));
    }

    uint64_t filesize = 0;
    // Best-effort: file size is metadata only, so leave it at 0 on a length() error.
    if (chd.file().length(filesize)) {
        filesize = 0;
    }
    data.chdSize = filesize;

    util::sha1_t const sha1 = chd.sha1();
    if (sha1 != util::sha1_t::null) {
        data.sha1 = sha1.as_string();
    }
    util::sha1_t const rawSha1 = chd.raw_sha1();
    if (rawSha1 != util::sha1_t::null) {
        data.dataSha1 = rawSha1.as_string();
    }

    chd.close();

    napi_deferred deferred = nullptr;
    napi_value promise = nullptr;
    if (napi_create_promise(env, &deferred, &promise) != napi_ok) {
        return nullptr;
    }
    napi_value out = ChdInfoToObject(env, data);
    if (out == nullptr || napi_resolve_deferred(env, deferred, out) != napi_ok) {
        Reject(env, deferred, "failed to create the info result");
    }
    return promise;
}

// ---- chdman list tracks ----

// Create the JavaScript object for a track listing, or nullptr if JavaScript can't receive it
static napi_value TrackListingToObject(napi_env env, const std::string& tocText, const std::vector<TrackOut>& tracks) {
    napi_value out = nullptr;
    napi_value arr = nullptr;
    if (napi_create_object(env, &out) != napi_ok ||
        napi_create_array_with_length(env, tracks.size(), &arr) != napi_ok) {
        return nullptr;
    }
    for (uint32_t i = 0; i < tracks.size(); i++) {
        napi_value t = nullptr;
        if (napi_create_object(env, &t) != napi_ok ||
            !SetProperty(env, t, "index", ToNumber(env, static_cast<double>(tracks[i].index))) ||
            !SetProperty(env, t, "filename", ToString(env, tracks[i].filename)) ||
            !SetProperty(env, t, "type", ToString(env, tracks[i].type)) ||
            !SetProperty(env, t, "size", ToNumber(env, static_cast<double>(tracks[i].size))) ||
            !SetElement(env, arr, i, t)) {
            return nullptr;
        }
    }
    bool const set = SetProperty(env, out, "tocText", ToString(env, tocText)) && SetProperty(env, out, "tracks", arr);
    return set ? out : nullptr;
}

// List the tracks of a CD-ROM/GD-ROM CHD: returns the in-memory TOC text plus a
// per-track descriptor (index, output filename, type string, data-only size).
static napi_value ListTracks(napi_env env, napi_callback_info info) {
    std::array<napi_value, 4> args{};
    std::string inputPath;
    int32_t mode = 0;
    std::string binArg;
    std::string tocName;
    if (!GetArgs(env, info, args) || !GetString(env, args[0], inputPath) || !GetInt32(env, args[1], mode) ||
        !GetString(env, args[2], binArg) || !GetString(env, args[3], tocName)) {
        napi_throw_type_error(env, nullptr, "listTracks(inputFilename, mode, binPatternOrBase, tocName) required");
        return nullptr;
    }

    napi_deferred deferred = nullptr;
    napi_value promise = nullptr;
    if (napi_create_promise(env, &deferred, &promise) != napi_ok) {
        return nullptr;
    }
    // No serialization needed: BuildListing uses its own chd_file/cdrom_file and
    // touches no shared state.
    std::string tocText;
    std::vector<TrackOut> tracks;
    std::string error;
    bool listed = false;
    try {
        listed = BuildListing(inputPath, mode, binArg, tocName, tocText, tracks, error);
    } catch (const std::error_condition& e) {
        error = e.message();
    } catch (const std::exception& e) {
        error = e.what();
    } catch (...) {
        error = "unknown error listing CHD tracks";
    }
    if (!listed) {
        Reject(env, deferred, error);
        return promise;
    }
    napi_value out = TrackListingToObject(env, tocText, tracks);
    if (out == nullptr || napi_resolve_deferred(env, deferred, out) != napi_ok) {
        Reject(env, deferred, "failed to create the track listing");
    }
    return promise;
}

// ---- chdman per-track pull reader ----

// A single CD-ROM (cue/bin) or GD-ROM (gdi) track. It owns its OWN chd_file +
// cdrom_file so that concurrent readers are fully independent (no shared state),
// and emits exactly the bytes chdman's do_extract_cd would write for that
// split-bin track: the DATA FRAMES ONLY. Virtual pregap/postgap are cue/gdi
// commands, never bytes; data-in-file pregaps are pulled from the previous track
// via splitframes.
class TrackSource {
   public:
    // Open the track, throwing std::out_of_range for a track index the CHD doesn't have
    TrackSource(const std::string& input, int mode, int trackIndex) : mode_(mode), trackIndex_(trackIndex) {
        std::error_condition const err = chd_.open(input, false, nullptr);
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
    }

    // Emit up to maxBytes of this track's DATA-FRAME bytes (no pregap/postgap
    // silence). Mirrors do_extract_cd's per-frame read/byte-swap/splitframes pull.
    size_t Produce(uint8_t* out, size_t maxBytes);

   private:
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
            frameBuf_.assign(st.datasize, 0);
            // read_data's bool result is intentionally ignored, matching chdman's
            // do_extract_cd (chdman.cpp line 2991): on a read miss the pre-zeroed
            // buffer is emitted as silence rather than erroring, for byte parity.
            cdrom_->read_data(cdrom_->get_track_start_phys(trk) + frameofs, frameBuf_.data(), st.trktype, true);
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
    static Napi::Function GetClass(Napi::Env env) {
        return DefineClass(env, "TrackReader",
                           {
                               RawMethod("read", &TrackReader::Read),
                               RawMethod("close", &TrackReader::Close),
                           });
    }

    explicit TrackReader(const Napi::CallbackInfo& info) : ReaderBase<TrackReader, TrackSource>(info) {
        napi_env env = info.Env();
        std::array<napi_value, 3> args{};
        std::string inputPath;
        int32_t mode = 0;
        int32_t trackIndex = 0;
        if (!GetArgs(env, static_cast<napi_callback_info>(info), args) || !GetString(env, args[0], inputPath) ||
            !GetInt32(env, args[1], mode) || !GetInt32(env, args[2], trackIndex)) {
            napi_throw_type_error(env, nullptr, "TrackReader(inputFilename, mode, trackIndex) required");
            return;
        }
        try {
            source_ = std::make_shared<TrackSource>(inputPath, mode, trackIndex);
        } catch (const std::out_of_range& e) {
            napi_throw_range_error(env, nullptr, e.what());
        } catch (const std::exception& e) {
            napi_throw_error(env, nullptr, e.what());
        }
    }
};

// ---- chdman raw logical reader ----

// The full logical byte range of a RAW, HARD_DISK, or DVD CHD. Owns its own
// chd_file and emits exactly the bytes chd_file::read_bytes would write, i.e. the
// same bytes chdman's extractRaw would produce.
class RawSource {
   public:
    explicit RawSource(const std::string& input) {
        std::error_condition const err = chd_.open(input, false, nullptr);
        if (err) {
            throw std::runtime_error("failed to open CHD: " + err.message());
        }
        total_ = chd_.logical_bytes();
    }

    // Emit up to maxBytes of this CHD's logical bytes starting at pos_.
    size_t Produce(uint8_t* out, size_t maxBytes) {
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
    chd_file chd_;
    uint64_t total_ = 0;
    uint64_t pos_ = 0;
};

// A pull reader over a RawSource
class RawReader : public ReaderBase<RawReader, RawSource> {
   public:
    static Napi::Function GetClass(Napi::Env env) {
        return DefineClass(env, "RawReader",
                           {
                               RawMethod("read", &RawReader::Read),
                               RawMethod("close", &RawReader::Close),
                           });
    }

    explicit RawReader(const Napi::CallbackInfo& info) : ReaderBase<RawReader, RawSource>(info) {
        napi_env env = info.Env();
        std::array<napi_value, 1> args{};
        std::string inputPath;
        if (!GetArgs(env, static_cast<napi_callback_info>(info), args) || !GetString(env, args[0], inputPath)) {
            napi_throw_type_error(env, nullptr, "RawReader(inputFilename) required");
            return;
        }
        try {
            source_ = std::make_shared<RawSource>(inputPath);
        } catch (const std::exception& e) {
            napi_throw_error(env, nullptr, e.what());
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

// Construct the class the addon stored in member, passing it this call's first N arguments
template <size_t N>
static napi_value Construct(napi_env env, napi_callback_info info, Napi::FunctionReference Addon::* member) {
    std::array<napi_value, N> args{};
    void* data = nullptr;
    napi_value ctor = nullptr;
    napi_value instance = nullptr;
    if (!GetArgs(env, info, args) || napi_get_instance_data(env, &data) != napi_ok || data == nullptr ||
        napi_get_reference_value(env, static_cast<Addon*>(data)->*member, &ctor) != napi_ok ||
        napi_new_instance(env, ctor, args.size(), args.data(), &instance) != napi_ok) {
        return nullptr;
    }
    return instance;
}

// Factory: construct a TrackReader from the class constructor stored as the
// addon's instance data.
static napi_value OpenTrackReader(napi_env env, napi_callback_info info) {
    return Construct<3>(env, info, &Addon::trackReader);
}

// Factory: construct a RawReader from the class constructor stored as the
// addon's instance data.
static napi_value OpenRawReader(napi_env env, napi_callback_info info) {
    return Construct<1>(env, info, &Addon::rawReader);
}

// Export a function that N-API calls directly, returning whether it was exported
static bool Export(napi_env env, napi_value exports, const char* name, napi_callback callback) {
    napi_value function = nullptr;
    return napi_create_function(env, name, NAPI_AUTO_LENGTH, callback, nullptr, &function) == napi_ok &&
           napi_set_named_property(env, exports, name, function) == napi_ok;
}

// Uses N-API's C functions for every function JavaScript calls, rather than node-addon-api's, which
// abort the process when a call fails: JavaScript can still call these while a terminated Worker's
// environment tears down
static Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    Napi::Function const trackReaderClass = TrackReader::GetClass(env);
    Napi::Function const rawReaderClass = RawReader::GetClass(env);
    env.SetInstanceData(
        new Addon{.trackReader = Napi::Persistent(trackReaderClass), .rawReader = Napi::Persistent(rawReaderClass)});

    if (!Export(env, exports, "info", Info) || !Export(env, exports, "listTracks", ListTracks) ||
        !Export(env, exports, "openTrackReader", OpenTrackReader) ||
        !Export(env, exports, "openRawReader", OpenRawReader)) {
        napi_throw_error(env, nullptr, "failed to export the chdman functions");
    }
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll)
