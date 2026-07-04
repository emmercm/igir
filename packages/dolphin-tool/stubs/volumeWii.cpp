// Ported implementation of the DiscIO::VolumeWii static helpers referenced by
// WIABlob.cpp and WiiEncryptionCache.cpp.
//
// These recompute/decrypt the Wii partition hash tree (H0/H1/H2) and re-encrypt partition
// data when reading *Wii* (not GameCube) disc images out of a WIA/RVZ/GCZ container. They
// only need the AES and SHA-1 primitives already linked into the addon and the per-partition
// title key already stored (decrypted) in the container, never the Wii Common Key. The rest
// of VolumeWii.cpp (banner rendering, filesystem browsing, generic volume glue) is not needed
// and is intentionally not linked here, so these four functions are ported individually
// instead of compiling the upstream .cpp file directly. Bodies are verbatim from upstream;
// the class-qualified names are fixed by DiscIO::VolumeWii's declarations in VolumeWii.h and
// so are not `port_`-prefixed per the project's ported-helper convention.
//
// Ported from Source/Core/DiscIO/VolumeWii.cpp (DiscIO::VolumeWii::HashGroup, ::EncryptGroup,
// ::DecryptBlockHashes, ::DecryptBlockData), Dolphin submodule tag 2606.

// clang-format off
// NOLINTBEGIN

#include "DiscIO/VolumeWii.h"

#include <algorithm>
#include <array>
#include <cstddef>
#include <future>
#include <thread>
#include <vector>

#include "Common/Align.h"
#include "Common/CommonTypes.h"
#include "Common/Crypto/AES.h"
#include "Common/Crypto/SHA1.h"

#include "DiscIO/Blob.h"

namespace DiscIO
{
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

void VolumeWii::DecryptBlockHashes(const u8* in, HashBlock* out, Common::AES::Context* aes_context)
{
  aes_context->CryptIvZero(in, reinterpret_cast<u8*>(out), sizeof(HashBlock));
}

void VolumeWii::DecryptBlockData(const u8* in, u8* out, Common::AES::Context* aes_context)
{
  aes_context->Crypt(&in[0x3d0], &in[sizeof(HashBlock)], out, BLOCK_DATA_SIZE);
}
}  // namespace DiscIO

// NOLINTEND
// clang-format on
