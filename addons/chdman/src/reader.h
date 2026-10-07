#pragma once

#include <napi.h>

#include <cstddef>
#include <cstdint>
#include <exception>
#include <memory>
#include <stdexcept>
#include <utility>

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
 * Drops a Source's last reference on the thread pool, so that its CHD closes there, as Node.js'
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
        if (rangeError_) {
            deferred_.Reject(Napi::RangeError::New(Env(), e.Message()).Value());
        } else {
            deferred_.Reject(e.Value());
        }
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

    // Keeps the CHD open until Execute() is done with it, even if the reader is closed or destroyed first
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

    // Whether Execute() failed with std::out_of_range, which rejects with a RangeError
    bool rangeError_ = false;
};

/**
 * CRTP base for the JavaScript pull readers TrackReader and RawReader, which read a Source on
 * the thread pool, one read at a time. Each Derived constructor stores the Source it reads from
 * in source_.
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
     * Release this reader's hold on the CHD, on the thread pool. A read worker in flight holds
     * it too, so the CHD closes once the worker thread is done with it.
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
            // The worker could not be created or queued, so the CHD closes here instead, on the
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
