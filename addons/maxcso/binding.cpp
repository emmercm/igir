#include <napi.h>

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <exception>
#include <memory>
#include <span>
#include <stdexcept>
#include <string>
#include <utility>

#include "src/container.h"

using PathString = File::PathString;

#ifdef _WIN32
/** Converts a JavaScript string to the platform-native file path on the loop thread. */
static PathString ToPath(const Napi::String& value) {
    std::u16string const utf16 = value.Utf16Value();
    return {utf16.begin(), utf16.end()};
}
#else
/** Converts a JavaScript string to the platform-native file path on the loop thread. */
static PathString ToPath(const Napi::String& value) { return value.Utf8Value(); }
#endif

// ---- shared pull-reader scaffolding ----

// The most one read() may request. Each read allocates a buffer of the requested size, and Node.js
// 22 aborts the process when it cannot allocate one instead of throwing. This bound is far past
// any useful read size, and small enough to allocate on 32-bit targets.
constexpr size_t kMaxRequestBytes = 64U << 20U;  // 64 MiB

/**
 * Create and queue a worker, which deletes itself once OnOK() or OnError() has run. A worker that
 * cannot be created or queued throws a Napi::Error instead, having been freed.
 */
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

/**
 * Drops a Source's last reference on the thread pool, so that its file closes there, as Node.js'
 * own fs.close() does. A read worker in flight may hold the other reference, in which case it
 * drops the last one at the end of its own Execute(), also on the thread pool.
 */
template <typename Source>
class CloseWorker : public Napi::AsyncWorker {
   public:
    /** Transfers source ownership to the close worker until its pool-thread execution. */
    CloseWorker(Napi::Env env, std::shared_ptr<Source> source) : Napi::AsyncWorker(env), source_(std::move(source)) {}

    /** Release the Source. Runs on the worker thread. */
    void Execute() override { source_.reset(); }

    /** Nothing to settle: close() does not report its outcome */
    void OnOK() override {}

   private:
    std::shared_ptr<Source> source_;
};

#ifdef __EMSCRIPTEN__
/**
 * Copies bytes into a new Buffer. It calls Node-API directly because Napi::Buffer makes emnapi mirror
 * the Buffer on the WebAssembly heap until garbage collection.
 */
static Napi::Value CopyToBuffer(Napi::Env env, const uint8_t* data, size_t length) {
    napi_value value = nullptr;
    napi_status const status = napi_create_buffer_copy(env, length, data, nullptr, &value);
    NAPI_THROW_IF_FAILED(env, status, Napi::Value());
    return {env, value};
}
#endif

/**
 * Runs one read() on the thread pool: fills memory from a Source's Produce(), then tells the Reader
 * the read is done and settles the read's promise. Source and Reader must provide:
 *   size_t Source::Produce(uint8_t* out, size_t maxBytes);  // worker thread
 *   void   Reader::FinishRead();                             // main thread, after Execute()
 *
 * Under Emscripten, it fills scratch memory and resolves with a copy, because emnapi frees a Buffer's
 * WebAssembly heap memory only on garbage collection.
 */
template <typename Reader, typename Source>
class ReadWorker : public Napi::AsyncWorker {
   public:
    /**
     * Natively, fills a Buffer, which is V8's own allocation rather than an external one: freeing an
     * external Buffer's memory posts its finalizer to the owning environment's thread, which races a
     * terminating Worker closing that environment's handles. The reference keeps the Buffer alive
     * while the worker thread writes to it; an environment tearing down waits for thread pool work
     * to finish before it releases any reference.
     */
    ReadWorker(Napi::Env env, Napi::Promise::Deferred deferred, std::shared_ptr<Reader*> reader,
               std::shared_ptr<Source> source, size_t maxBytes)
        : Napi::AsyncWorker(env),
          deferred_(deferred),
          reader_(std::move(reader)),
          source_(std::move(source)),
#ifndef __EMSCRIPTEN__
          buffer_(Napi::Persistent(Napi::Buffer<uint8_t>::New(env, maxBytes))),
          data_(buffer_.Value().Data()),
#endif
          cap_(maxBytes) {
    }

    /** Fill the memory from the Source. Runs on the worker thread. */
    void Execute() override {
        try {
#ifdef __EMSCRIPTEN__
            // Allocated here so that failing to allocate rejects the read
            // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays)
            scratch_ = std::make_unique_for_overwrite<uint8_t[]>(cap_);
            n_ = source_->Produce(scratch_.get(), cap_);
#else
            n_ = source_->Produce(data_, cap_);
#endif
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("unknown maxcso read error");
        }

        // If the reader was closed mid-read, this is the last reference, and the file closes here
        // on the thread pool rather than when this worker is destroyed on the main thread
        source_.reset();
    }

    /** Resolve with the bytes read, or null at the end */
    void OnOK() override {
        // First, so that resolving can't throw past it and leave the reader Ref()'d and reading
        NotifyReader();
        Napi::Env const env = Env();
        if (n_ == 0) {
            deferred_.Resolve(env.Null());
            return;
        }
#ifdef __EMSCRIPTEN__
        deferred_.Resolve(CopyToBuffer(env, scratch_.get(), n_));
#else
        Napi::Buffer<uint8_t> const buffer = buffer_.Value();
        if (n_ == cap_) {
            deferred_.Resolve(buffer);
        } else {
            // A view of the first n_ bytes, which shares the Buffer's memory rather than copying
            // it. Only those bytes were written; the rest are uninitialized.
            deferred_.Resolve(
                buffer.Get("subarray")
                    .As<Napi::Function>()
                    .Call(buffer, {Napi::Number::New(env, 0), Napi::Number::New(env, static_cast<double>(n_))}));
        }
#endif
    }

    /** Reject with the error Execute() set */
    void OnError(const Napi::Error& e) override {
        NotifyReader();
        deferred_.Reject(e.Value());
    }

   private:
    /**
     * Tell the reader the read is done, unless it was destroyed. The reader holds a Ref() while it
     * reads, so only an environment tearing down, such as a terminated Worker's, destroys it first.
     */
    void NotifyReader() {
        if (*reader_ != nullptr) {
            (*reader_)->FinishRead();  // may release the reader
        }
    }

    Napi::Promise::Deferred deferred_;

    // Cleared by the reader's destructor
    std::shared_ptr<Reader*> reader_;

    // Keeps the file open until Execute() is done with it, even if the reader is closed or destroyed first
    std::shared_ptr<Source> source_;

    // The memory that Execute() fills, and its size
#ifdef __EMSCRIPTEN__
    std::unique_ptr<uint8_t[]> scratch_;  // NOLINT(cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays)
#else
    Napi::Reference<Napi::Buffer<uint8_t>> buffer_;
    uint8_t* data_;
#endif
    size_t cap_;
    size_t n_ = 0;
};

/**
 * CRTP base for the JavaScript pull reader MaxcsoReader, which reads a Source on the thread pool,
 * one read at a time. Each Derived constructor stores the Source it reads from in source_.
 *
 * Safety invariant: the reader and the read worker in flight each hold the Source, so it is
 * freed only once neither does. Produce() never runs on a freed Source, even if the reader is
 * closed or destroyed mid-read. close() and the read worker both drop their references on the
 * thread pool; only a reader garbage collected without close() frees its Source on the main
 * thread, as Node.js does for a FileHandle that was never closed.
 */
template <typename Derived, typename Source>
class ReaderBase : public Napi::ObjectWrap<Derived> {
   public:
    /** Construct without a Source, which the Derived constructor then sets */
    explicit ReaderBase(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<Derived>(info), self_(std::make_shared<ReaderBase*>(this)) {}

    /** Tell any read worker still in flight that this reader no longer exists */
    ~ReaderBase() override { *self_ = nullptr; }

    ReaderBase(const ReaderBase&) = delete;
    ReaderBase& operator=(const ReaderBase&) = delete;
    ReaderBase(ReaderBase&&) = delete;
    ReaderBase& operator=(ReaderBase&&) = delete;

    /**
     * read(maxBytes): resolve up to maxBytes bytes, or null at the end. Rejects a read after
     * close() or while another read is in flight.
     */
    Napi::Value Read(const Napi::CallbackInfo& info);

    /**
     * Release this reader's hold on the file, on the thread pool. A read worker in flight holds
     * it too, so the file closes once the worker thread is done with it.
     */
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
            // The worker could not be created or queued, so the file closes here instead, on the
            // main thread, when `source` goes out of scope
        }
    }

    /** Mark the read as done. Called on the main thread by the read worker after Execute has returned. */
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
        QueueWorker<ReadWorker<ReaderBase, Source>>(env, deferred, self_, source_, static_cast<size_t>(requested));
    } catch (const Napi::Error& e) {
        deferred.Reject(e.Value());
        return deferred.Promise();
    }
    // OnOK()/OnError() run later on this same thread, so setting these after Queue() is not a race
    reading_ = true;
    this->Ref();  // keep this object from being collected while the worker thread reads
    return deferred.Promise();
}

// ---- maxcso reader ----

/**
 * A container's decompressed ISO bytes. The file is opened and parsed lazily by the first read's
 * worker, so no filesystem I/O runs on the main thread. Each source owns its own file handle,
 * decompressor, and buffers, so concurrent readers are independent.
 */
class MaxcsoSource {
   public:
    /** Remember the path; the file isn't opened until the first Produce() */
    explicit MaxcsoSource(PathString path) : path_(std::move(path)) {}

    /**
     * Emit up to maxBytes of decompressed bytes. Runs on the worker thread. The container writes
     * straight into `out` where it can; what it returns in its own buffers that doesn't fit stays
     * in pending_, which the next read drains first.
     */
    size_t Produce(uint8_t* out, size_t maxBytes) {
        if (!container_) {
            // The first read's size, which is the stream's highWaterMark, sets how much the
            // container reads from the file at a time for the rest of the stream
            container_ = std::make_unique<Container>(path_, Open::kRead, maxBytes);
        }
        std::span<uint8_t> const dest(out, maxBytes);
        size_t written = 0;
        while (written < maxBytes) {
            if (pending_.empty()) {
                std::span<uint8_t> const rest = dest.subspan(written);
                std::span<const uint8_t> const next = container_->Next(rest);
                if (next.empty()) {
                    break;
                }
                if (next.data() == rest.data()) {
                    // Already in place
                    written += next.size();
                    continue;
                }
                pending_ = next;
            }
            size_t const count = std::min(pending_.size(), maxBytes - written);
            std::ranges::copy(pending_.first(count), dest.subspan(written).begin());
            pending_ = pending_.subspan(count);
            written += count;
        }
        return written;
    }

   private:
    PathString path_;
    std::unique_ptr<Container> container_;

    // Points into container_'s buffers
    std::span<const uint8_t> pending_;
};

/** A pull reader over a MaxcsoSource */
class MaxcsoReader : public ReaderBase<MaxcsoReader, MaxcsoSource> {
   public:
    /** Define the JavaScript class, with its read() and close() methods */
    static Napi::Function GetClass(Napi::Env env) {
        return DefineClass(env, "MaxcsoReader",
                           {
                               InstanceMethod("read", &MaxcsoReader::Read),
                               InstanceMethod("close", &MaxcsoReader::Close),
                           });
    }

    /**
     * new MaxcsoReader(inputFilename): throws to JavaScript for a missing filename; the file is
     * opened by the first read()
     */
    explicit MaxcsoReader(const Napi::CallbackInfo& info) : ReaderBase<MaxcsoReader, MaxcsoSource>(info) {
        Napi::Env const env = info.Env();
        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "MaxcsoReader(inputFilename) required").ThrowAsJavaScriptException();
            return;
        }
        try {
            source_ = std::make_shared<MaxcsoSource>(ToPath(info[0].As<Napi::String>()));
        } catch (const std::exception& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        }
    }
};

// ---- maxcso info ----

/**
 * Opens a container on the thread pool, making the checks upstream makes while opening, and
 * resolves its header information
 */
class InfoWorker : public Napi::AsyncWorker {
   public:
    /** Stores the loop-created promise and input path for worker-thread inspection. */
    InfoWorker(Napi::Env env, Napi::Promise::Deferred deferred, PathString path)
        : Napi::AsyncWorker(env), deferred_(deferred), path_(std::move(path)) {}

    /**
     * Open the container for Open::kHeader and keep its header information. Runs on the worker
     * thread.
     */
    void Execute() override {
        try {
            Container const container(path_, Open::kHeader, 0);
            format_ = container.FormatName();
            size_ = container.Size();
            blockSize_ = container.BlockSize();
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("unknown maxcso info error");
        }
    }

    /** Resolve with the header information */
    void OnOK() override {
        Napi::Env const env = Env();
        Napi::Object const out = Napi::Object::New(env);
        out.Set("format", format_);
        out.Set("uncompressedSize", static_cast<double>(size_));
        out.Set("blockSize", blockSize_);
        deferred_.Resolve(out);
    }

    /** Reject with the error Execute() set */
    void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

   private:
    Napi::Promise::Deferred deferred_;
    PathString path_;
    const char* format_ = "";
    uint64_t size_ = 0;
    uint32_t blockSize_ = 0;
};

/** info(inputFilename): resolve a container's format, uncompressed size, and block size */
static Napi::Value Info(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
    if (info.Length() < 1 || !info[0].IsString()) {
        deferred.Reject(Napi::TypeError::New(env, "inputFilename (string) required").Value());
        return deferred.Promise();
    }
    try {
        QueueWorker<InfoWorker>(env, deferred, ToPath(info[0].As<Napi::String>()));
    } catch (const Napi::Error& e) {
        deferred.Reject(e.Value());
    }
    return deferred.Promise();
}

// ---- addon init ----

/**
 * Holds the class constructors for every ObjectWrap type registered by this addon. Stored as the
 * addon's instance data so factories can retrieve them without a global.
 */
struct Addon {
    Napi::FunctionReference maxcsoReader;
};

/** openReader(inputFilename): construct a MaxcsoReader from the stored class constructor */
static Napi::Value OpenReader(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Function const ctor = env.GetInstanceData<Addon>()->maxcsoReader.Value();
    return ctor.New({info[0]});
}

/** Register the reader class as instance data and export the addon's functions */
static Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    Napi::Function const cls = MaxcsoReader::GetClass(env);
    env.SetInstanceData(new Addon{.maxcsoReader = Napi::Persistent(cls)});
    exports.Set("info", Napi::Function::New(env, Info));
    exports.Set("openReader", Napi::Function::New(env, OpenReader));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll)
