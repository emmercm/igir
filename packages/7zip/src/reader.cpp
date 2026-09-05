#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include "reader.h"
#include "7zip/Archive/IArchive.h"
#include "Common/MyCom.h"
#include "archive.h"

namespace sevenzip {

// Neither of the two classes below appears in reader.h: nothing outside this
// file drives them, so declaring them here keeps binding.cpp from parsing the
// threading machinery at all.

// A fixed-capacity byte queue with one producer (the extraction thread) and one
// consumer (a libuv worker thread). Capacity never grows, so a slow consumer
// applies back-pressure to 7-Zip instead of buffering an entire entry in memory.
class RingBuffer {
   public:
    explicit RingBuffer(size_t capacity) : buffer_(capacity) {}

    RingBuffer(const RingBuffer&) = delete;
    RingBuffer& operator=(const RingBuffer&) = delete;
    RingBuffer(RingBuffer&&) = delete;
    RingBuffer& operator=(RingBuffer&&) = delete;
    ~RingBuffer() = default;

    // Blocks until every byte is queued. Returns false if Abort() was called,
    // in which case nothing further should be written.
    bool Write(const uint8_t* data, size_t length);

    // Blocks until bytes are available, the producer finishes, or Abort() is
    // called. Returns the number of bytes copied; 0 means end of stream, and is
    // returned only once Finish() or Abort() has been called -- a short or empty
    // result never stands in for EOF. `maxBytes` must be at least 1;
    // std::invalid_argument is thrown otherwise, because a zero-length copy has
    // no answer that is distinguishable from end of stream.
    size_t Read(uint8_t* out, size_t maxBytes);

    // The producer has written its last byte.
    void Finish();

    // Unblock both sides and refuse further writes.
    void Abort();

   private:
    mutable std::mutex mutex_;
    std::condition_variable notFull_;
    std::condition_variable notEmpty_;
    std::vector<uint8_t> buffer_;
    size_t head_ = 0;   // next byte to read
    size_t count_ = 0;  // bytes currently queued
    bool finished_ = false;
    bool aborted_ = false;
};

// Runs 7-Zip's push-based Extract() on a dedicated thread and exposes its output
// as a pull-based Read(). One Pump owns one archive, one entry, and one thread.
class Pump {
   public:
    static constexpr size_t kBufferBytes = 1U << 20U;  // 1 MiB of back-pressure

    Pump(std::string path, uint32_t formatIndex, uint32_t entryIndex);

    Pump(const Pump&) = delete;
    Pump& operator=(const Pump&) = delete;
    Pump(Pump&&) = delete;
    Pump& operator=(Pump&&) = delete;

    // Aborts and joins the producer thread. After this returns, no other thread
    // touches any state this object owns.
    ~Pump();

    // Copies up to maxBytes of decompressed output. Returns 0 at end of entry.
    // Throws std::runtime_error carrying the producer's failure, if any, and
    // std::invalid_argument when maxBytes is 0.
    size_t Read(uint8_t* out, size_t maxBytes);

    // Wakes a Read() that is blocked waiting for the producer and makes every
    // subsequent Read() report end of stream. Does NOT join, so it is the only
    // teardown step that is safe to take while a Read() is in flight; the join
    // still has to happen later, through Stop() or the destructor.
    void Cancel() noexcept;

    // Idempotent. Safe to call while a Read() is NOT in flight.
    void Stop() noexcept;

   private:
    // The producer thread's entry point. Nothing may escape it: an exception
    // leaving a std::thread's callable calls std::terminate(). It is not marked
    // noexcept -- that would turn such a throw into the very terminate() we are
    // avoiding; it catches everything internally instead.
    void Run();

    // The extraction itself, so that Run() needs exactly one try/catch.
    void Extract();

    void SetError(std::string message);

    std::string path_;
    uint32_t formatIndex_;
    uint32_t entryIndex_;
    RingBuffer buffer_{kBufferBytes};
    std::atomic<bool> abort_{false};
    std::mutex errorMutex_;
    std::string error_;
    std::thread thread_;
};

bool RingBuffer::Write(const uint8_t* data, size_t length) {
    std::unique_lock<std::mutex> lock(mutex_);
    size_t written = 0;
    while (written < length) {
        notFull_.wait(lock, [this]() { return aborted_ || count_ < buffer_.size(); });
        if (aborted_) {
            return false;
        }
        size_t const tail = (head_ + count_) % buffer_.size();
        size_t const contiguous = std::min(buffer_.size() - tail, buffer_.size() - count_);
        size_t const chunk = std::min(contiguous, length - written);
        std::memcpy(buffer_.data() + tail, data + written, chunk);
        count_ += chunk;
        written += chunk;
        notEmpty_.notify_one();
    }
    return true;
}

size_t RingBuffer::Read(uint8_t* out, size_t maxBytes) {
    if (maxBytes == 0) {
        // The loop below would copy nothing and return 0, which callers read as
        // end of stream while bytes are still queued. Throwing instead makes a
        // zero return value mean exactly one thing.
        throw std::invalid_argument("maxBytes must be at least 1");
    }
    std::unique_lock<std::mutex> lock(mutex_);
    notEmpty_.wait(lock, [this]() { return aborted_ || finished_ || count_ > 0; });
    if (aborted_ || count_ == 0) {
        // Aborted: whatever is still queued is discarded, so a consumer that
        // closed mid-read observes end of stream rather than a partial chunk.
        return 0;
    }
    size_t read = 0;
    while (read < maxBytes && count_ > 0) {
        size_t const contiguous = std::min(buffer_.size() - head_, count_);
        size_t const chunk = std::min(contiguous, maxBytes - read);
        std::memcpy(out + read, buffer_.data() + head_, chunk);
        head_ = (head_ + chunk) % buffer_.size();
        count_ -= chunk;
        read += chunk;
    }
    notFull_.notify_one();
    return read;
}

void RingBuffer::Finish() {
    {
        std::lock_guard<std::mutex> const lock(mutex_);
        finished_ = true;
    }
    notEmpty_.notify_all();
    notFull_.notify_all();
}

void RingBuffer::Abort() {
    {
        std::lock_guard<std::mutex> const lock(mutex_);
        aborted_ = true;
    }
    notEmpty_.notify_all();
    notFull_.notify_all();
}

namespace {

// Both callback classes below are declared with upstream's own class macro, so
// the base list, QueryInterface/AddRef/Release, and every method signature come
// from the vendored headers instead of being transcribed here. A signature
// change in a future 7-Zip drop then becomes a compile error rather than
// something to spot by eye. See deps/7zip/CPP/Common/MyCom.h and the same idiom
// in deps/7zip/CPP/7zip/UI/Common/ArchiveExtractCallback.cpp.
//
// The addon is built with Z7_ST (see binding.gyp), which makes the macro-supplied
// Z7_COM_ADDREF_RELEASE a plain non-atomic ++/-- (MyCom.h:379-385). That is safe
// only because every reference to these objects is created, copied and released
// on the producer thread alone. Dropping Z7_ST -- or handing one of these objects
// to another thread -- would introduce a reference-count race.

// The sink 7-Zip writes decompressed bytes into. Every Write() blocks while the
// ring buffer is full, which is what keeps memory bounded; it returns E_ABORT
// once the consumer has closed, which unwinds Extract() promptly.
Z7_CLASS_IMP_COM_1(BufferOutStream, ISequentialOutStream)
   public:
    BufferOutStream(RingBuffer& buffer, std::atomic<bool>& abort)
        : buffer_(buffer), abort_(abort) {}

   private:
    RingBuffer& buffer_;
    std::atomic<bool>& abort_;
};

// Extraction driver. GetStream() hands 7-Zip the sink for the one entry we want
// and nullptr for anything else. SetCompleted() is the second abort check: for a
// solid 7z folder whose target entry is last, no Write() happens for a long
// time, so without this an abort would not be observed until decoding finished.
Z7_CLASS_IMP_COM_1(ExtractCallback, IArchiveExtractCallback)
    Z7_IFACE_COM7_IMP(IProgress)
   public:
    ExtractCallback(UInt32 entryIndex, RingBuffer& buffer, std::atomic<bool>& abort)
        : entryIndex_(entryIndex), buffer_(buffer), abort_(abort) {}

    Int32 OpResult() const { return opResult_; }

   private:
    UInt32 entryIndex_;
    RingBuffer& buffer_;
    std::atomic<bool>& abort_;
    Int32 opResult_ = NArchive::NExtract::NOperationResult::kOK;
};

Z7_COM7F_IMF(BufferOutStream::Write(const void* data, UInt32 size, UInt32* processedSize)) {
    if (processedSize != nullptr) {
        *processedSize = 0;
    }
    if (abort_.load(std::memory_order_relaxed)) {
        return E_ABORT;
    }
    if (!buffer_.Write(static_cast<const uint8_t*>(data), size)) {
        return E_ABORT;
    }
    if (processedSize != nullptr) {
        *processedSize = size;
    }
    return S_OK;
}

// IProgress
Z7_COM7F_IMF(ExtractCallback::SetTotal(UInt64 /*total*/)) { return S_OK; }

Z7_COM7F_IMF(ExtractCallback::SetCompleted(const UInt64* /*completeValue*/)) {
    return abort_.load(std::memory_order_relaxed) ? E_ABORT : S_OK;
}

// IArchiveExtractCallback
Z7_COM7F_IMF(ExtractCallback::GetStream(UInt32 index, ISequentialOutStream** outStream,
                                        Int32 askExtractMode)) {
    *outStream = nullptr;
    if (askExtractMode != NArchive::NExtract::NAskMode::kExtract || index != entryIndex_) {
        return S_OK;  // skip: 7-Zip decodes past it without materializing bytes
    }
    if (abort_.load(std::memory_order_relaxed)) {
        return E_ABORT;
    }
    CMyComPtr<ISequentialOutStream> sink(new BufferOutStream(buffer_, abort_));
    *outStream = sink.Detach();
    return S_OK;
}

Z7_COM7F_IMF(ExtractCallback::PrepareOperation(Int32 /*askExtractMode*/)) { return S_OK; }

Z7_COM7F_IMF(ExtractCallback::SetOperationResult(Int32 opRes)) {
    opResult_ = opRes;
    return S_OK;
}

}  // namespace

Pump::Pump(std::string path, uint32_t formatIndex, uint32_t entryIndex)
    : path_(std::move(path)), formatIndex_(formatIndex), entryIndex_(entryIndex) {
    thread_ = std::thread([this]() { Run(); });
}

Pump::~Pump() { Stop(); }

void Pump::Cancel() noexcept {
    try {
        abort_.store(true, std::memory_order_relaxed);
        buffer_.Abort();
    } catch (...) {  // NOLINT(bugprone-empty-catch)
        // Abort() locks a mutex, which can in principle fail. There is nowhere
        // to report that, and this runs on paths that must not throw.
    }
}

void Pump::Stop() noexcept {
    Cancel();
    try {
        if (thread_.joinable()) {
            thread_.join();
        }
    } catch (...) {  // NOLINT(bugprone-empty-catch)
        // join() throws std::system_error on a failed join. Stop() is reached
        // from ~Pump(), which is reached from ~EntryReader() on the garbage
        // collector's path, so letting anything escape here would terminate the
        // process. A thread we could not join is left running; it only ever
        // touches state this object owns, and the abort above tells it to stop.
    }
}

void Pump::SetError(std::string message) {
    std::lock_guard<std::mutex> const lock(errorMutex_);
    if (error_.empty()) {
        error_ = std::move(message);
    }
}

void Pump::Extract() {
    // Everything 7-Zip owns lives inside this scope so that it is destroyed --
    // and every file handle closed -- before the thread exits.
    OpenedArchive opened;
    HRESULT hr = OpenArchive(path_, formatIndex_, &opened);
    if (hr != S_OK) {
        SetError(OpenErrorMessage(hr));
        return;
    }

    UInt32 count = 0;
    if (opened.archive->GetNumberOfItems(&count) != S_OK || entryIndex_ >= count) {
        SetError("entry index out of range");
        return;
    }

    // Held through the interface pointer because the class macro makes
    // AddRef()/Release() private on the concrete class; `raw` stays valid for
    // OpResult() because `callback` owns a reference.
    auto* raw = new ExtractCallback(entryIndex_, buffer_, abort_);
    CMyComPtr<IArchiveExtractCallback> const callback(raw);
    UInt32 const index = entryIndex_;
    hr = opened.archive->Extract(&index, 1, 0 /* testMode */, callback);
    if (hr == E_ABORT || abort_.load(std::memory_order_relaxed)) {
        // The consumer closed early; not an error.
    } else if (hr != S_OK) {
        char message[128];
        std::snprintf(message, sizeof(message), "failed to extract entry (HRESULT 0x%08x)",
                      static_cast<unsigned>(hr));
        SetError(message);
    } else if (raw->OpResult() != NArchive::NExtract::NOperationResult::kOK) {
        SetError("entry failed to extract (data error, CRC error, or unsupported method)");
    }
}

void Pump::Run() {
    try {
        try {
            Extract();
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("unknown 7-Zip error");
        }
    } catch (...) {  // NOLINT(bugprone-empty-catch)
        // The handlers above allocate a std::string and lock a mutex, so they
        // can throw in turn. There is no way left to report that, and escaping
        // this thread's entry point would call std::terminate().
    }
    try {
        // Always signal completion, on every path, so a waiting consumer cannot
        // hang -- including when the error reporting above failed.
        buffer_.Finish();
    } catch (...) {  // NOLINT(bugprone-empty-catch)
    }
}

size_t Pump::Read(uint8_t* out, size_t maxBytes) {
    size_t const read = buffer_.Read(out, maxBytes);
    if (read == 0) {
        std::lock_guard<std::mutex> const lock(errorMutex_);
        if (!error_.empty()) {
            throw std::runtime_error(error_);
        }
    }
    return read;
}

namespace {

class ReadWorker : public Napi::AsyncWorker {
   public:
    ReadWorker(Napi::Env env, Napi::Promise::Deferred deferred, EntryReader* reader,
               size_t maxBytes)
        : Napi::AsyncWorker(env),
          deferred_(std::move(deferred)),
          reader_(reader),
          buf_(maxBytes) {}

    // Nothing may escape this boundary: N-API is built here with
    // NAPI_DISABLE_CPP_EXCEPTIONS, so an exception leaving Execute() aborts the
    // process rather than rejecting the promise. Pump::Read() throws by design,
    // and the vendored code it drives throws on allocation failure.
    void Execute() override {
        try {
            n_ = reader_->Produce(buf_.data(), buf_.size());
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("unknown 7-Zip read error");
        }
    }

    void OnOK() override {
        Napi::Env const env = Env();
        // close() discards whatever was still buffered, which has to include
        // the bytes this worker had already copied out. Execute() runs on a
        // pool thread and may well have finished before close() was called, so
        // without this the promise resolves with data the caller was told it
        // would not get -- and which read of the two wins is a race.
        if (reader_->WasClosed() || n_ == 0) {
            deferred_.Resolve(env.Null());
        } else {
            // Move the worker's buffer onto the heap and hand its storage to JS;
            // the finalizer frees it. unique_ptr owns it until New() succeeds, so
            // a failure here cannot leak.
            auto owned = std::make_unique<std::vector<uint8_t>>(std::move(buf_));
            owned->resize(n_);  // shrink-only: never reallocates, data() stays stable
            Napi::Buffer<uint8_t> const out = Napi::Buffer<uint8_t>::New(
                env, owned->data(), n_,
                [](Napi::Env /*unused*/, uint8_t* /*unused*/, std::vector<uint8_t>* v) { delete v; },
                owned.get());
            if (out.IsEmpty()) {
                // With C++ exceptions disabled, a failed New() returns an empty
                // value and leaves a JS exception pending. Keep ownership so that
                // `owned` frees the vector, and reject instead of resolving with
                // an empty value that JavaScript would read as end of stream.
                deferred_.Reject(env.IsExceptionPending()
                                     ? env.GetAndClearPendingException().Value()
                                     : Napi::Error::New(env, "failed to allocate the read result")
                                           .Value());
            } else {
                owned.release();  // NOLINT(bugprone-unused-return-value)
                deferred_.Resolve(out);
            }
        }
        reader_->FinishRead();  // last use of reader_: may release it
    }

    void OnError(const Napi::Error& e) override {
        deferred_.Reject(e.Value());
        reader_->FinishRead();  // last use of reader_: may release it
    }

   private:
    Napi::Promise::Deferred deferred_;
    EntryReader* reader_;
    std::vector<uint8_t> buf_;
    size_t n_ = 0;
};

}  // namespace

Napi::Function EntryReader::GetClass(Napi::Env env) {
    return DefineClass(env, "EntryReader",
                       {
                           InstanceMethod("read", &EntryReader::Read),
                           InstanceMethod("close", &EntryReader::Close),
                       });
}

EntryReader::EntryReader(const Napi::CallbackInfo& info) : Napi::ObjectWrap<EntryReader>(info) {
    Napi::Env const env = info.Env();
    try {
        Construct(info);
    } catch (...) {
        // Reading the arguments allocates, and starting the Pump creates a
        // std::thread, which throws std::system_error when the OS refuses.
        Napi::Error::New(env, "failed to open the entry for reading")
            .ThrowAsJavaScriptException();
    }
}

EntryReader::~EntryReader() = default;

void EntryReader::Construct(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    if (info.Length() < 3 || !info[0].IsString() || !info[1].IsNumber() || !info[2].IsNumber()) {
        Napi::TypeError::New(env,
                             "expected (path: string, formatIndex: number, entryIndex: number)")
            .ThrowAsJavaScriptException();
        return;
    }
    pump_ = std::make_unique<Pump>(info[0].As<Napi::String>().Utf8Value(),
                                   info[1].As<Napi::Number>().Uint32Value(),
                                   info[2].As<Napi::Number>().Uint32Value());
}

size_t EntryReader::Produce(uint8_t* out, size_t maxBytes) {
    if (!pump_) {
        return 0;
    }
    return pump_->Read(out, maxBytes);
}

void EntryReader::Teardown() {
    // Pump's destructor aborts and joins the producer thread, so every 7-Zip
    // object and file handle is released here. Idempotent: reset() on an already
    // null pointer is a no-op.
    pump_.reset();
}

void EntryReader::Close(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    try {
        Shutdown();
    } catch (...) {
        Napi::Error::New(env, "failed to close the entry reader").ThrowAsJavaScriptException();
    }
}

void EntryReader::Shutdown() {
    closed_ = true;
    if (reading_) {
        // A read is in flight on a worker thread, so the join in Teardown() has
        // to wait for FinishRead(). Wake the blocked producer/consumer now,
        // though: without this the outstanding read() stays pending until the
        // producer happens to emit bytes, which for a solid archive whose target
        // entry is last can be the whole decode.
        if (pump_) {
            pump_->Cancel();
        }
        return;
    }
    Teardown();
}

void EntryReader::FinishRead() {
    reading_ = false;
    if (closed_) {
        Teardown();
    }
    Unref();  // balances the Ref() taken in Read()
}

Napi::Value EntryReader::Read(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
    // A napi_deferred may be settled exactly once, and once the worker is queued
    // the worker owns it. Nothing between the queue and StartRead's return
    // throws today, so this only guards a future edit -- but settling twice is
    // undefined behavior, not an error, so it is worth a bool.
    bool settled = false;
    try {
        StartRead(info, deferred, &settled);
    } catch (...) {
        // Allocating the worker's buffer can throw std::bad_alloc; rejecting is
        // the only option that neither aborts the process nor strands the caller.
        if (!settled) {
            deferred.Reject(Napi::Error::New(env, "failed to start a read").Value());
        }
    }
    return deferred.Promise();
}

void EntryReader::StartRead(const Napi::CallbackInfo& info,
                            const Napi::Promise::Deferred& deferred,
                            bool* settled) {
    Napi::Env const env = info.Env();
    if (closed_) {
        *settled = true;
        deferred.Reject(Napi::Error::New(env, "read after close").Value());
        return;
    }
    if (reading_) {
        *settled = true;
        deferred.Reject(Napi::Error::New(env, "concurrent read not allowed").Value());
        return;
    }
    if (info.Length() < 1 || !info[0].IsNumber()) {
        *settled = true;
        deferred.Reject(Napi::TypeError::New(env, "expected (maxBytes: number)").Value());
        return;
    }
    // index.ts rejects anything that is not an integer in [1, 2^32-1], so the
    // only job here is to stay safe if that guard is ever bypassed: clamp to the
    // ring buffer (a 4 GiB allocation would be a denial of service, and no single
    // Read() can yield more than the buffer holds anyway) and refuse a request
    // that rounds to zero, which would report end of stream with bytes still
    // buffered.
    size_t const maxBytes =
        std::min<size_t>(info[0].As<Napi::Number>().Uint32Value(), Pump::kBufferBytes);
    if (maxBytes == 0) {
        *settled = true;
        deferred.Reject(Napi::TypeError::New(env, "maxBytes must be at least 1").Value());
        return;
    }

    // Allocate before mutating reader state: a throw here must not leave
    // reading_/Ref() dangling.
    auto* worker = new ReadWorker(env, deferred, this, maxBytes);
    reading_ = true;
    Ref();
    worker->Queue();
    *settled = true;
    if (env.IsExceptionPending()) {
        // Queue() failed, so neither Execute() nor OnOK()/OnError() will ever
        // run. Undo the state they were going to unwind, or the promise never
        // settles and close() can never tear the pump down.
        reading_ = false;
        Unref();
        delete worker;
        deferred.Reject(env.GetAndClearPendingException().Value());
    }
}

}  // namespace sevenzip
