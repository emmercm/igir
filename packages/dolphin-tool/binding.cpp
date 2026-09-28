#include <napi.h>

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <future>
#include <limits>
#include <memory>
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

// Runs a Source's Produce() on a worker thread so blocking/decompressing blob reads
// never run on the V8 main thread, then tells the Reader the read is done. They must expose:
//   size_t Source::Produce(uint8_t* out, size_t maxBytes);  // worker thread
//   void   Reader::FinishRead();                             // main thread, post-Execute
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

    void Execute() override {
        try {
            n_ = source_->Produce(data_, cap_);
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("unknown blob read error");
        }
    }

    void OnOK() override {
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
        NotifyReader();
    }

    void OnError(const Napi::Error& e) override {
        deferred_.Reject(e.Value());
        NotifyReader();
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
    // Keeps the blob open until this worker is destroyed, even if the reader is closed or destroyed first
    std::shared_ptr<Source> source_;
    // The Buffer that Execute() fills, and its memory
    Napi::Reference<Napi::Buffer<uint8_t>> buffer_;
    uint8_t* data_;
    size_t cap_;
    size_t n_ = 0;
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
    Napi::Value Read(const Napi::CallbackInfo& info);

    // Release this reader's hold on the blob. A read worker in flight holds it too, so the
    // blob closes once the worker thread is done with it.
    void Close(const Napi::CallbackInfo& /*unused*/) { source_.reset(); }

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

// Defined out-of-line because it constructs a ReadWorker, whose full
// definition must precede this. Shared by every ReaderBase subclass.
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
    // Bounded so the static_cast<size_t> below is defined, and to Number.MAX_SAFE_INTEGER, past
    // which JavaScript cannot request an exact byte count
    constexpr double kMaxRequestBytes =
        std::min(9007199254740991.0, static_cast<double>(std::numeric_limits<size_t>::max()));
    bool const valid = requested >= 1 && requested <= kMaxRequestBytes;
    if (!valid) {
        deferred.Reject(Napi::TypeError::New(env, "maxBytes must be a positive number").Value());
        return deferred.Promise();
    }
    Napi::Buffer<uint8_t> const buffer = Napi::Buffer<uint8_t>::New(env, static_cast<size_t>(requested));
    if (buffer.IsEmpty()) {
        // With C++ exceptions disabled a failed New() returns an empty value and leaves a JS
        // exception pending
        deferred.Reject(env.IsExceptionPending() ? env.GetAndClearPendingException().Value()
                                                 : Napi::Error::New(env, "failed to allocate the read buffer").Value());
        return deferred.Promise();
    }
    (new ReadWorker<ReaderBase, Source>(env, deferred, self_, source_, buffer))->Queue();
    // OnOK()/OnError() run later on this same thread, so setting these after Queue() is not a race
    reading_ = true;
    this->Ref();  // keep this object (and its blob) alive while the worker thread reads
    return deferred.Promise();
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
                               InstanceMethod("read", &DolphinReader::Read),
                               InstanceMethod("close", &DolphinReader::Close),
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
