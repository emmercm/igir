#include <napi.h>

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <future>
#include <limits>
#include <memory>
#include <new>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include "Common/Align.h"
#include "Common/CommonTypes.h"
#include "Common/Crypto/AES.h"
#include "Common/Crypto/SHA1.h"
#include "DiscIO/Blob.h"
#include "DiscIO/VolumeWii.h"

// The DiscIO::VolumeWii statics that WIABlob.cpp and WiiEncryptionCache.cpp use to
// recompute/decrypt the Wii partition hash tree (H0/H1/H2) and re-encrypt partition data.
// The rest of VolumeWii.cpp (banner rendering, filesystem browsing, generic volume glue)
// is unneeded, so these four are ported individually rather than compiling the upstream
// .cpp. Names are fixed by VolumeWii.h, so they aren't `port_`-prefixed.

// ===== BEGIN ported from Source/Core/DiscIO/VolumeWii.cpp, Dolphin submodule tag 2606 =====
// Re-port when bumping the submodule: diff each function against its cited line range.
// clang-format off
// NOLINTBEGIN

namespace DiscIO
{
// VolumeWii.cpp lines 508-571.
bool VolumeWii::HashGroup(const std::array<u8, BLOCK_DATA_SIZE> in[BLOCKS_PER_GROUP],
                          HashBlock out[BLOCKS_PER_GROUP],
                          const std::function<bool(size_t block)>& read_function)
{
  std::array<std::future<void>, BLOCKS_PER_GROUP> hash_futures;
  bool success = true;

  for (size_t i = 0; i < BLOCKS_PER_GROUP; ++i)
  {
    if (read_function && success)
      success = read_function(i);

    hash_futures[i] = std::async(std::launch::async, [&in, &out, &hash_futures, success, i] {
      const size_t h1_base = Common::AlignDown(i, 8);

      if (success)
      {
        // H0 hashes
        for (size_t j = 0; j < 31; ++j)
          out[i].h0[j] = Common::SHA1::CalculateDigest(in[i].data() + j * 0x400, 0x400);

        // H0 padding
        out[i].padding_0 = {};

        // H1 hash
        out[h1_base].h1[i - h1_base] = Common::SHA1::CalculateDigest(out[i].h0);
      }

      if (i % 8 == 7)
      {
        for (size_t j = 0; j < 7; ++j)
          hash_futures[h1_base + j].get();

        if (success)
        {
          // H1 padding
          out[h1_base].padding_1 = {};

          // H1 copies
          for (size_t j = 1; j < 8; ++j)
            out[h1_base + j].h1 = out[h1_base].h1;

          // H2 hash
          out[0].h2[h1_base / 8] = Common::SHA1::CalculateDigest(out[i].h1);
        }

        if (i == BLOCKS_PER_GROUP - 1)
        {
          for (size_t j = 0; j < 7; ++j)
            hash_futures[j * 8 + 7].get();

          if (success)
          {
            // H2 padding
            out[0].padding_2 = {};

            // H2 copies
            for (size_t j = 1; j < BLOCKS_PER_GROUP; ++j)
              out[j].h2 = out[0].h2;
          }
        }
      }
    });
  }

  // Wait for all the async tasks to finish
  hash_futures.back().get();

  return success;
}

// VolumeWii.cpp lines 579-641.
bool VolumeWii::EncryptGroup(
    u64 offset, u64 partition_data_offset, u64 partition_data_decrypted_size,
    const std::array<u8, AES_KEY_SIZE>& key, BlobReader* blob,
    std::array<u8, GROUP_TOTAL_SIZE>* out,
    const std::function<void(HashBlock hash_blocks[BLOCKS_PER_GROUP])>& hash_exception_callback)
{
  std::vector<std::array<u8, BLOCK_DATA_SIZE>> unencrypted_data(BLOCKS_PER_GROUP);
  std::vector<HashBlock> unencrypted_hashes(BLOCKS_PER_GROUP);

  const bool success =
      HashGroup(unencrypted_data.data(), unencrypted_hashes.data(), [&](size_t block) {
        if (offset + (block + 1) * BLOCK_DATA_SIZE <= partition_data_decrypted_size)
        {
          if (!blob->ReadWiiDecrypted(offset + block * BLOCK_DATA_SIZE, BLOCK_DATA_SIZE,
                                      unencrypted_data[block].data(), partition_data_offset))
          {
            return false;
          }
        }
        else
        {
          unencrypted_data[block].fill(0);
        }
        return true;
      });

  if (!success)
    return false;

  if (hash_exception_callback)
    hash_exception_callback(unencrypted_hashes.data());

  const unsigned int threads =
      std::min(BLOCKS_PER_GROUP, std::max<unsigned int>(1, std::thread::hardware_concurrency()));

  std::vector<std::future<void>> encryption_futures(threads);

  auto aes_context = Common::AES::CreateContextEncrypt(key.data());

  for (size_t i = 0; i < threads; ++i)
  {
    encryption_futures[i] = std::async(
        std::launch::async,
        [&unencrypted_data, &unencrypted_hashes, &aes_context, &out](size_t start, size_t end) {
          for (size_t j = start; j < end; ++j)
          {
            u8* out_ptr = out->data() + j * BLOCK_TOTAL_SIZE;

            aes_context->CryptIvZero(reinterpret_cast<u8*>(&unencrypted_hashes[j]), out_ptr,
                                     BLOCK_HEADER_SIZE);

            aes_context->Crypt(out_ptr + 0x3D0, unencrypted_data[j].data(),
                               out_ptr + BLOCK_HEADER_SIZE, BLOCK_DATA_SIZE);
          }
        },
        i * BLOCKS_PER_GROUP / threads, (i + 1) * BLOCKS_PER_GROUP / threads);
  }

  for (std::future<void>& future : encryption_futures)
    future.get();

  return true;
}

// VolumeWii.cpp lines 643-646.
void VolumeWii::DecryptBlockHashes(const u8* in, HashBlock* out, Common::AES::Context* aes_context)
{
  aes_context->CryptIvZero(in, reinterpret_cast<u8*>(out), sizeof(HashBlock));
}

// VolumeWii.cpp lines 648-651.
void VolumeWii::DecryptBlockData(const u8* in, u8* out, Common::AES::Context* aes_context)
{
  aes_context->Crypt(&in[0x3d0], &in[sizeof(HashBlock)], out, BLOCK_DATA_SIZE);
}
}  // namespace DiscIO

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
        if (napi_create_string_utf8(env, "dolphin-tool", NAPI_AUTO_LENGTH, &name) != napi_ok ||
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

// Runs a Source's Produce() on a worker thread so blocking/decompressing blob reads
// never run on the V8 main thread, then tells the Reader the read is done. They must expose:
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
            error_ = "unknown blob read error";
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
    // Keeps the blob open until this worker is destroyed, even if the reader is closed or destroyed first
    std::shared_ptr<Source> source_;
    // A runtime-sized owning buffer, which is exactly what unique_ptr<T[]> is
    // for; std::array would need the size at compile time.
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays)
    std::unique_ptr<uint8_t[]> buf_;
    size_t cap_ = 0;
    size_t n_ = 0;
    std::string error_;  // Empty on success
};

// CRTP base for the async pull-reader lifecycle used by DolphinReader. Each Derived
// constructor stores the Source it reads from in source_.
//
// Safety invariant: the reader and the read worker in flight each hold the Source, so it is
// freed on the main thread only once neither does. Produce (worker thread) never runs on a
// freed Source, even if the reader is closed or destroyed mid-read. reading_ rejects a
// concurrent read(); Ref()/Unref() keep the object alive across the async read.
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

    // Release this reader's hold on the blob. A read worker in flight holds it too, so the
    // blob closes once the worker thread is done with it.
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
    this->Ref();  // keep this object (and its blob) alive while the worker thread reads
}

// ---- Dolphin blob reader ----

// A Dolphin blob's full logical (decompressed ISO) range. Owns its own BlobReader so
// concurrent readers are independent.
class DolphinSource {
   public:
    explicit DolphinSource(std::unique_ptr<DiscIO::BlobReader> blob)
        : blob_(std::move(blob)), total_(blob_->GetDataSize()) {}

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
    std::unique_ptr<DiscIO::BlobReader> blob_;
    uint64_t total_ = 0;
    uint64_t pos_ = 0;
};

// A pull reader over a DolphinSource
class DolphinReader : public ReaderBase<DolphinReader, DolphinSource> {
   public:
    static Napi::Function GetClass(Napi::Env env) {
        return DefineClass(env, "DolphinReader",
                           {
                               RawMethod("read", &DolphinReader::Read),
                               RawMethod("close", &DolphinReader::Close),
                           });
    }

    explicit DolphinReader(const Napi::CallbackInfo& info) : ReaderBase<DolphinReader, DolphinSource>(info) {
        Napi::Env const env = info.Env();
        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "DolphinReader(inputFilename) required").ThrowAsJavaScriptException();
            return;
        }
        std::string const input = info[0].As<Napi::String>();
        std::unique_ptr<DiscIO::BlobReader> blob = DiscIO::CreateBlobReader(input);
        if (!blob) {
            Napi::Error::New(env, "failed to open blob: " + input).ThrowAsJavaScriptException();
            return;
        }
        source_ = std::make_shared<DolphinSource>(std::move(blob));
    }
};

// ---- Dolphin info ----

static std::string BlobFormatString(DiscIO::BlobType type) {
    switch (type) {
        case DiscIO::BlobType::GCZ:
            return "GCZ";
        case DiscIO::BlobType::WIA:
            return "WIA";
        case DiscIO::BlobType::RVZ:
            return "RVZ";
        default:
            return "UNKNOWN";
    }
}

static Napi::Value Info(const Napi::CallbackInfo& info) {
    Napi::Env const env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "inputFilename (string) required").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string const inputPath = info[0].As<Napi::String>();

    // Header-only, fast enough to run synchronously on the main thread.
    std::unique_ptr<DiscIO::BlobReader> blob = DiscIO::CreateBlobReader(inputPath);
    if (!blob) {
        Napi::Error::New(env, "failed to open blob: " + inputPath).ThrowAsJavaScriptException();
        return env.Null();
    }

    const Napi::Object out = Napi::Object::New(env);
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
