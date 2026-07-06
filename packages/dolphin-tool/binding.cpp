#include <napi.h>

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <future>
#include <memory>
#include <stdexcept>
#include <string>
#include <thread>
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

// Runs a reader's Produce() on a worker thread so blocking/decompressing blob reads
// never run on the V8 main thread. Each Reader must expose:
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
            // Hand JS the worker's own buffer instead of copying it: move buf_ onto the heap
            // and expose it as the Buffer's backing store, freed by the finalizer once JS is
            // done. unique_ptr owns it until New() succeeds, so a throw here can't leak. The
            // bytes are independent of reader_/blob, so the teardown invariant is untouched.
            auto owned = std::make_unique<std::vector<uint8_t>>(std::move(buf_));
            owned->resize(n_);  // shrink-only: never reallocates, keeps data() stable
            Napi::Buffer<uint8_t> const out = Napi::Buffer<uint8_t>::New(
                env, owned->data(), n_,
                [](Napi::Env /*unused*/, uint8_t* /*unused*/, std::vector<uint8_t>* v) { delete v; }, owned.get());
            owned.release();  // ownership transferred to the Buffer's finalizer
            deferred_.Resolve(out);
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

// CRTP base for the async pull-reader lifecycle used by DolphinReader. Each Derived
// supplies:
//   size_t Produce(uint8_t* out, size_t maxBytes);  // worker thread; emits bytes
//   void   Teardown();                               // main thread; releases handles
//
// Safety invariant: Produce (worker thread) never overlaps Teardown (main thread),
// which runs only from Close() with no read in flight or from FinishRead() (main
// thread, after Execute returns). reading_ rejects a concurrent read(); Ref()/Unref()
// keep the object alive across the async read.
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
