// chdman native addon.
//
// chdman.cpp is a CLI tool whose entry point is `int CLIB_DECL main(...)`. We
// rename that symbol via a build-time macro and #include the (unmodified)
// submodule source so that all of its `static` handlers become visible to the
// N-API glue appended below, without editing anything under deps/mame.
#define main chdman_main
#include "deps/mame/src/tools/chdman.cpp"
#undef main

// MAME normally generates src/version.cpp at build time; it is not part of the
// submodule, and chdman.cpp references only `build_version`, so we define that
// stub here. The leading `extern` declaration forces external linkage (a
// namespace-scope `const` array would otherwise be internal-linkage in C++) so
// chdman.cpp's `extern const char build_version[]` reference resolves.
extern const char build_version[];
const char build_version[] = "chdman (igir native addon)";

#include <napi.h>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <mutex>
#include <optional>
#include <sstream>
#include <streambuf>

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
  // thread; it is fast enough that no AsyncWorker is needed. Do not copy this
  // synchronous pattern for bulk extraction (see extract*, which use AsyncWorker).
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

// ---- chdman extract ----

// Discards everything written to it (used for stdout, which only carries progress).
struct NullBuffer : std::streambuf {
  int overflow(int ch) override { return ch; }
};

// Thrown by the stderr watchdog to abort a runaway/invalid chdman extraction,
// mirroring how @emmercm/chdman killed the subprocess on >100% / nan% progress.
struct ChdmanAbortError : public std::exception {
  explicit ChdmanAbortError(std::string message) : message_(std::move(message)) {}
  const char* what() const noexcept override { return message_.c_str(); }
private:
  std::string message_;
};

// Captures chdman's stderr (so a fatal_error's human message can be recovered) and
// watches the progress output. chdman prints "Extracting, X.Y% complete... \r" to
// std::cerr; a valid extraction never exceeds 100%, so a percentage >= 101% or a
// "nan%" indicates a runaway/invalid extraction that would otherwise write gigabytes
// before failing. On detecting that, it throws to abort the in-progress chdman call.
class WatchdogBuffer : public std::streambuf {
public:
  std::string text() const { return captured_; }
protected:
  std::streamsize xsputn(const char* s, std::streamsize count) override {
    append(s, count);
    return count;
  }
  int overflow(int ch) override {
    if (ch != traits_type::eof()) {
      const char c = static_cast<char>(ch);
      append(&c, 1);
    }
    return ch;
  }
private:
  void append(const char* s, std::streamsize count) {
    captured_.append(s, static_cast<size_t>(count));
    for (std::streamsize i = 0; i < count; i++) {
      const char c = s[i];
      if (c == '\r' || c == '\n') {
        checkLine();
        line_.clear();
      } else {
        line_ += c;
      }
    }
  }
  void checkLine() {
    if (line_.find("nan%") != std::string::npos) {
      throw ChdmanAbortError("chdman aborted: invalid input (nan% progress)");
    }
    const size_t percent = line_.find('%');
    if (percent == std::string::npos) {
      return;
    }
    size_t start = percent;
    while (start > 0 && (std::isdigit(static_cast<unsigned char>(line_[start - 1])) ||
                         line_[start - 1] == '.')) {
      start--;
    }
    if (start == percent) {
      return;
    }
    const double value = std::strtod(line_.substr(start, percent - start).c_str(), nullptr);
    if (value >= 101.0) {
      throw ChdmanAbortError("chdman aborted: runaway extraction (" +
                             line_.substr(start, percent - start) + "% progress)");
    }
  }
  std::string captured_;
  std::string line_;
};

// Capture chdman's diagnostic output in memory by swapping the std::cout/std::cerr
// stream buffers for the duration of a call: stdout (progress) is discarded and
// stderr (error messages) is captured and watched for runaway progress. chdman
// writes all console output via util::stream_format(std::cout/std::cerr, ...), so
// this needs no temporary files and never touches the process's stdout/stderr file
// descriptors, leaving the host application's own console output untouched.
class StreamCapture {
public:
  StreamCapture()
    : oldOut_(std::cout.rdbuf(&nullBuffer_)),
      oldErr_(std::cerr.rdbuf(&watchdogBuffer_)),
      oldErrExceptions_(std::cerr.exceptions()) {
    // Make exceptions thrown by the watchdog propagate out of std::ostream writes.
    std::cerr.exceptions(std::ios_base::badbit);
  }
  ~StreamCapture() {
    // Clear the watchdog-set badbit BEFORE restoring the exception mask: if the old
    // mask included badbit, restoring it while badbit is set would throw from this
    // destructor. Then restore the mask and the original stream buffers.
    std::cerr.clear();
    std::cerr.exceptions(oldErrExceptions_);
    std::cout.rdbuf(oldOut_);
    std::cerr.rdbuf(oldErr_);
  }
  StreamCapture(const StreamCapture&) = delete;
  StreamCapture& operator=(const StreamCapture&) = delete;
  std::string stderrText() { return watchdogBuffer_.text(); }

private:
  NullBuffer nullBuffer_;
  WatchdogBuffer watchdogBuffer_;
  std::streambuf* oldOut_;
  std::streambuf* oldErr_;
  std::ios_base::iostate oldErrExceptions_;
};

// Serialize all chdman calls: chdman has file-scope statics (e.g. lastprogress).
static std::mutex g_chdmanMutex;

class ExtractWorker : public Napi::AsyncWorker {
public:
  ExtractWorker(Napi::Env env, bool isCd, std::string input, std::string output,
                bool splitBin, std::string outputBin)
    : Napi::AsyncWorker(env), deferred_(Napi::Promise::Deferred::New(env)),
      isCd_(isCd), input_(std::move(input)), output_(std::move(output)),
      splitBin_(splitBin), outputBin_(std::move(outputBin)) {}

  Napi::Promise GetPromise() { return deferred_.Promise(); }

  void Execute() override {
    std::lock_guard<std::mutex> lock(g_chdmanMutex);
    StreamCapture capture;
    try {
      parameters_map params;
      std::string empty;
      // do_extract_cd mutates the string pointed to by OPTION_OUTPUT_BIN (it
      // strips the extension in place), so pass a local copy, not the member.
      std::string outputBin = outputBin_;
      params[OPTION_INPUT] = &input_;
      params[OPTION_OUTPUT] = &output_;
      if (isCd_) {
        if (!outputBin.empty()) params[OPTION_OUTPUT_BIN] = &outputBin;
        if (splitBin_) params[OPTION_OUTPUT_SPLITBIN] = &empty;
        do_extract_cd(params);
      } else {
        do_extract_raw(params);
      }
    } catch (const std::error_condition& e) {
      SetError(e.message());
    } catch (const ChdmanAbortError& e) {
      SetError(e.what());
    } catch (const fatal_error& e) {
      std::string msg = capture.stderrText();
      SetError(msg.empty() ? ("chdman error " + std::to_string(e.error())) : msg);
    } catch (const std::exception& e) {
      SetError(e.what());
    } catch (...) {
      SetError("unknown chdman error");
    }
  }

  void OnOK() override { deferred_.Resolve(Env().Undefined()); }
  void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

private:
  Napi::Promise::Deferred deferred_;
  bool isCd_;
  std::string input_, output_;
  bool splitBin_;
  std::string outputBin_;
};

static Napi::Value ExtractRaw(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    Napi::TypeError::New(env, "inputFilename and outputFilename (strings) required")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  std::string input = info[0].As<Napi::String>();
  std::string output = info[1].As<Napi::String>();
  auto* worker = new ExtractWorker(env, false, input, output, false, "");
  Napi::Promise promise = worker->GetPromise();
  worker->Queue();
  return promise;
}

static Napi::Value ExtractCd(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    Napi::TypeError::New(env, "inputFilename and outputFilename (strings) required")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  std::string input = info[0].As<Napi::String>();
  std::string output = info[1].As<Napi::String>();
  bool splitBin = info.Length() > 2 && info[2].ToBoolean();
  std::string outputBin = (info.Length() > 3 && info[3].IsString())
    ? std::string(info[3].As<Napi::String>()) : std::string();
  auto* worker = new ExtractWorker(env, true, input, output, splitBin, outputBin);
  Napi::Promise promise = worker->GetPromise();
  worker->Queue();
  return promise;
}

// Diagnostic: return the bundled chdman/MAME build version string.
static Napi::Value Version(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), build_version);
}

static Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  exports.Set("info", Napi::Function::New(env, Info));
  exports.Set("extractRaw", Napi::Function::New(env, ExtractRaw));
  exports.Set("extractCd", Napi::Function::New(env, ExtractCd));
  exports.Set("version", Napi::Function::New(env, Version));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll)
