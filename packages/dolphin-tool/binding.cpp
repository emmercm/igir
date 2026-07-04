#include <napi.h>

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

#include "DiscIO/Blob.h"

// ---- shared pull-reader scaffolding ----

// Drives a reader's Produce() on a worker thread so the (blocking, possibly
// decompressing) blob reads never run on the V8 main thread. One template covers
// all reader types; each must expose
//   size_t Produce(uint8_t* out, size_t maxBytes);  // worker thread
//   void   FinishRead();                             // main thread, post-Execute
template <typename Reader>
class ReadWorker : public Napi::AsyncWorker {
   public:
    ReadWorker(Napi::Env env, Reader* reader, size_t maxBytes)
        : Napi::AsyncWorker(env), deferred_(Napi::Promise::Deferred::New(env)), reader_(reader), buf_(maxBytes) {}

    Napi::Promise GetPromise() { return deferred_.Promise(); }

    void Execute() override {
        try {
            n_ = reader_->Produce(buf_.data(), buf_.size());
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("unknown blob read error");
        }
    }

    void OnOK() override {
        Napi::Env const env = Env();
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
// lifecycle used by DolphinReader. Each Derived supplies:
//   size_t Produce(uint8_t* out, size_t maxBytes);  // worker thread; emits bytes
//   void   Teardown();                               // main thread; releases handles
//
// Safety invariant: Produce (worker thread) never overlaps Teardown (main
// thread). Teardown runs only from Close() when no read is in flight, or from
// FinishRead(), which N-API calls on the main thread after Execute() returns.
// The reading_ flag rejects a second concurrent read(). Ref()/Unref() keep the
// object (and its blob handle) alive across the async read and always balance,
// on both the OK and error paths, so a destroyed stream cannot leak.
template <typename Derived>
class ReaderBase : public Napi::ObjectWrap<Derived> {
   public:
    explicit ReaderBase(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Derived>(info) {}

    Napi::Value Read(const Napi::CallbackInfo& info);

    // Deterministically release the blob handle. If a read worker is in flight,
    // the teardown is deferred to FinishRead() so the worker thread is never
    // reading the blob while the main thread frees it.
    void Close(const Napi::CallbackInfo& /*unused*/) {
        closed_ = true;
        if (!reading_) {
            static_cast<Derived*>(this)->Teardown();
        }
    }

    // Called on the main thread by the read worker once Produce has fully completed
    // (Execute has returned), so touching the blob here is safe.
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
    Napi::Env const env = info.Env();
    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
    if (closed_) {
        deferred.Reject(Napi::Error::New(env, "read after close").Value());
        return deferred.Promise();
    }
    if (reading_) {
        // Only one read worker may touch this reader's mutable state at a time.
        deferred.Reject(Napi::Error::New(env, "concurrent read not allowed").Value());
        return deferred.Promise();
    }
    size_t const maxBytes = info[0].As<Napi::Number>().Uint32Value();
    // Allocate the worker (and its maxBytes buffer) BEFORE mutating reader state:
    // if that allocation throws, reading_/Ref() must not be left dangling.
    auto* worker = new ReadWorker<Derived>(env, static_cast<Derived*>(this), maxBytes);
    Napi::Promise promise = worker->GetPromise();
    reading_ = true;
    this->Ref();  // keep this object (and its blob) alive while the worker thread reads
    worker->Queue();
    return promise;
}

// ---- Dolphin blob reader ----

// A pull reader over a Dolphin blob's full logical (decompressed ISO) range.
// Owns its own BlobReader so concurrent readers are independent.
class DolphinReader : public ReaderBase<DolphinReader> {
   public:
    static Napi::Function GetClass(Napi::Env env) {
        return DefineClass(env, "DolphinReader",
                           {
                               InstanceMethod("read", &DolphinReader::Read),
                               InstanceMethod("close", &DolphinReader::Close),
                           });
    }

    explicit DolphinReader(const Napi::CallbackInfo& info) : ReaderBase<DolphinReader>(info) {
        Napi::Env const env = info.Env();
        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "DolphinReader(inputFilename) required").ThrowAsJavaScriptException();
            return;
        }
        std::string const input = info[0].As<Napi::String>();
        blob_ = DiscIO::CreateBlobReader(input);
        if (!blob_) {
            Napi::Error::New(env, "failed to open blob: " + input).ThrowAsJavaScriptException();
            return;
        }
        total_ = blob_->GetDataSize();
    }

    // Emit up to maxBytes of decompressed bytes starting at pos_. Runs on the worker thread.
    size_t Produce(uint8_t* out, size_t maxBytes) {
        if (pos_ >= total_) return 0;
        uint64_t const n = std::min<uint64_t>(maxBytes, total_ - pos_);
        if (!blob_->Read(pos_, n, out)) {
            throw std::runtime_error("blob Read failed");
        }
        pos_ += n;
        return static_cast<size_t>(n);
    }

   private:
    friend class ReaderBase<DolphinReader>;
    void Teardown() { blob_.reset(); }  // idempotent: reset() on null is a no-op

    std::unique_ptr<DiscIO::BlobReader> blob_;
    uint64_t total_ = 0;
    uint64_t pos_ = 0;
};

// ---- Dolphin info ----

static std::string BlobFormatString(DiscIO::BlobType type) {
    switch (type) {
        case DiscIO::BlobType::GCZ: return "GCZ";
        case DiscIO::BlobType::WIA: return "WIA";
        case DiscIO::BlobType::RVZ: return "RVZ";
        default: return "UNKNOWN";
    }
}

static Napi::Value Info(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "inputFilename (string) required").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string const inputPath = info[0].As<Napi::String>();

    // Header-only, fast enough to run synchronously on the main thread (like chdman info()).
    std::unique_ptr<DiscIO::BlobReader> blob = DiscIO::CreateBlobReader(inputPath);
    if (!blob) {
        Napi::Error::New(env, "failed to open blob: " + inputPath).ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object out = Napi::Object::New(env);
    out.Set("inputFile", inputPath);
    out.Set("format", BlobFormatString(blob->GetBlobType()));
    out.Set("decompressedSize", Napi::Number::New(env, static_cast<double>(blob->GetDataSize())));

    Napi::Promise::Deferred const deferred = Napi::Promise::Deferred::New(env);
    deferred.Resolve(out);
    return deferred.Promise();
}

// ---- addon init ----

struct Addon {
    Napi::FunctionReference dolphinReader;
};

static Napi::Value OpenReader(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    Napi::Function const ctor = env.GetInstanceData<Addon>()->dolphinReader.Value();
    return ctor.New({info[0]});
}

static Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    Napi::Function const cls = DolphinReader::GetClass(env);
    env.SetInstanceData(new Addon{.dolphinReader = Napi::Persistent(cls)});
    exports.Set("info", Napi::Function::New(env, Info));
    exports.Set("openReader", Napi::Function::New(env, OpenReader));
    return exports;
}
NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll)
