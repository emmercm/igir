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

/** chdman.cpp: msf_string_from_frames (verbatim, line 1076). */
static std::string port_msf_string_from_frames(uint32_t frames) {
  return util::string_format("%02d:%02d:%02d", frames / (75 * 60), (frames / 75) % 60, frames % 75);
}

/**
 * chdman's do_extract_cd writes `frames - padframes + splitframes` data frames
 * per split bin (chdman.cpp line 2972). Callers must first confirm the track does
 * not underflow via cuebin_underflow_error().
 */
static uint32_t port_actual_frames(const cdrom_file::track_info& t) {
  return static_cast<uint32_t>(int64_t(t.frames) + int64_t(t.splitframes) - int64_t(t.padframes));
}

/**
 * Some GD-ROM CHDs cannot be expressed as cue/bin: their high-density track has
 * padframes exceeding frames+splitframes, so chdman's uint32 frame formula above
 * underflows to ~4.29e9 frames (~10 TB) and extraction would run far past chdman's
 * total_bytes (chdman.cpp line 2738) -- i.e. past 100% of the disc. The underflow
 * is detected up front instead, so callers (e.g. ChdBinCue) fall back to gdi/raw.
 *
 * Returns the reason `t` cannot be extracted as cue/bin, or an empty string if it
 * is safe. Returning the message (rather than throwing) keeps it off the C++
 * exception path, whose what() string MSVC mis-copies on arm64 in this build; the
 * caller hands the returned std::string straight to Napi::Error, which is unaffected.
 */
static std::string cuebin_underflow_error(const cdrom_file::track_info& t, int tracknum) {
  const int64_t frames = int64_t(t.frames) + int64_t(t.splitframes) - int64_t(t.padframes);
  if (frames >= 0) {
    return {};
  }
  return "CHD cannot be extracted as cue/bin: track " + std::to_string(tracknum + 1) +
         " frame count underflows (padframes " + std::to_string(t.padframes) + " > frames " +
         std::to_string(t.frames) + " + splitframes " + std::to_string(t.splitframes) + ")";
}

/**
 * chdman.cpp output_track_metadata 1531-1590, MODE_GDI + MODE_CUEBIN only,
 * writing to std::ostream& via util::stream_format(out, ...).
 */
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

    /** output TRACK entry */
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

/** chdman.cpp 2852-2916, GD-ROM Redump TOC adjustment, mutating toc in place. */
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

/** chdman.cpp 2748-2808, %t templating for one track (always split-bin). */
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

/**
 * One track in the in-memory listing. `size` is the data-only byte count written
 * to the split bin (subcode is never included in cue/gdi extraction).
 */
struct TrackOut {
  int index;
  std::string filename;
  std::string type;
  uint64_t size;
};

/**
 * Build the TOC text and per-track listing for a CHD, mirroring chdman's
 * do_extract_cd (2638-3021) but writing to memory instead of files. For MODE_GDI
 * the TOC text is normalized to the .gdi form ChdGdi expects (quote-stripped,
 * CRLF line endings) after assembly.
 */
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

// ---- chdman list tracks ----

/** Builds a CD-ROM/GD-ROM CHD's track listing on the thread pool */
class ListTracksWorker : public Napi::AsyncWorker {
   public:
    /** Stores listing arguments and the loop-created promise before queueing work. */
    ListTracksWorker(Napi::Env env, Napi::Promise::Deferred deferred, std::string path, int mode, std::string binArg,
                     std::string tocName)
        : Napi::AsyncWorker(env),
          deferred_(deferred),
          path_(std::move(path)),
          mode_(mode),
          binArg_(std::move(binArg)),
          tocName_(std::move(tocName)) {}

    /** Open the CHD and build its listing. Runs on the worker thread. */
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

    /** Resolve with the TOC text and a descriptor for every track */
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

    /** Reject with the error Execute() set */
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

/**
 * List the tracks of a CD-ROM/GD-ROM CHD: resolves the in-memory TOC text plus a
 * per-track descriptor (index, output filename, type string, data-only size).
 */
Napi::Value ListTracks(const Napi::CallbackInfo& info) {
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

/**
 * A single CD-ROM (cue/bin) or GD-ROM (gdi) track. It owns its OWN chd_file +
 * cdrom_file so that concurrent readers are fully independent (no shared state),
 * and emits exactly the bytes chdman's do_extract_cd would write for that
 * split-bin track: the DATA FRAMES ONLY. Virtual pregap/postgap are cue/gdi
 * commands, never bytes; data-in-file pregaps are pulled from the previous track
 * via splitframes.
 *
 * The CHD is opened lazily by the first read's worker, so no filesystem I/O runs on the main thread.
 */
class TrackSource {
   public:
    /** Remember the track; the CHD isn't opened until the first Produce() */
    TrackSource(std::string input, int mode, int trackIndex)
        : input_(std::move(input)), mode_(mode), trackIndex_(trackIndex) {}

    /**
     * Emit up to maxBytes of this track's DATA-FRAME bytes (no pregap/postgap
     * silence). Mirrors do_extract_cd's per-frame read/byte-swap/splitframes pull.
     */
    size_t Produce(uint8_t* out, size_t maxBytes);

   private:
    /**
     * Open the track, throwing std::out_of_range for a track index the CHD doesn't have. Runs on
     * the worker thread.
     */
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

Napi::Function TrackReader::GetClass(Napi::Env env) {
    return DefineClass(env, "TrackReader",
                       {
                           InstanceMethod("read", &TrackReader::Read),
                           InstanceMethod("close", &TrackReader::Close),
                       });
}

TrackReader::TrackReader(const Napi::CallbackInfo& info) : ReaderBase<TrackReader, TrackSource>(info) {
    Napi::Env const env = info.Env();
    if (info.Length() < 3 || !info[0].IsString() || !info[1].IsNumber() || !info[2].IsNumber()) {
        Napi::TypeError::New(env, "TrackReader(inputFilename, mode, trackIndex) required").ThrowAsJavaScriptException();
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
