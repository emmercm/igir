#include "DiscIO/VolumeWii.h"

#include <array>
#include <cstddef>
#include <cstring>
#include <functional>
#include <memory>
#include <vector>

#include "Common/Align.h"
#include "Common/CommonTypes.h"
#include "Common/Crypto/AES.h"
#include "Common/Crypto/SHA1.h"
#include "DiscIO/Blob.h"

// The DiscIO::VolumeWii statics that WIABlob.cpp and WiiEncryptionCache.cpp use to
// recompute/decrypt the Wii partition hash tree (H0/H1/H2) and re-encrypt partition data.
// The rest of VolumeWii.cpp (banner rendering, filesystem browsing, generic volume glue)
// is unneeded, so these four are ported individually rather than compiling the upstream
// .cpp. Names are fixed by VolumeWii.h, so they aren't `port_`-prefixed.

// ===== BEGIN ported from Source/Core/DiscIO/VolumeWii.cpp, Dolphin submodule tag 2609a =====
// Re-port when bumping the submodule: diff each function against its cited line range.
// clang-format off
// NOLINTBEGIN

namespace DiscIO
{
/**
 * VolumeWii.cpp lines 509-572. Upstream hashes each of the 64 blocks on its own std::async
 * thread; here they are hashed serially on the calling thread, which is a libuv thread pool
 * worker, so that the addon creates no threads of its own. The H0/H1/H2 results are unchanged,
 * as is the early stop: once a read fails, no later block is read or hashed.
 */
bool VolumeWii::HashGroup(const std::array<u8, BLOCK_DATA_SIZE> in[BLOCKS_PER_GROUP],
                          HashBlock out[BLOCKS_PER_GROUP],
                          const std::function<bool(size_t block)>& read_function)
{
  bool success = true;

  for (size_t i = 0; i < BLOCKS_PER_GROUP; ++i)
  {
    if (read_function && success)
      success = read_function(i);

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

    if (i % 8 == 7 && success)
    {
      // H1 padding
      out[h1_base].padding_1 = {};

      // H1 copies
      for (size_t j = 1; j < 8; ++j)
        out[h1_base + j].h1 = out[h1_base].h1;

      // H2 hash
      out[0].h2[h1_base / 8] = Common::SHA1::CalculateDigest(out[i].h1);

      if (i == BLOCKS_PER_GROUP - 1)
      {
        // H2 padding
        out[0].padding_2 = {};

        // H2 copies
        for (size_t j = 1; j < BLOCKS_PER_GROUP; ++j)
          out[j].h2 = out[0].h2;
      }
    }
  }

  return success;
}

/**
 * VolumeWii.cpp lines 580-642. Upstream encrypts across up to hardware_concurrency() std::async
 * threads; here every block is encrypted serially on the calling thread, for the same reason as
 * HashGroup above.
 */
bool VolumeWii::EncryptGroup(
    u64 offset, u64 partition_data_offset, u64 partition_data_decrypted_size,
    const std::array<u8, AES_KEY_SIZE>& key, BlobReader* blob,
    std::array<u8, GROUP_TOTAL_SIZE>* out,
    const std::function<void(HashBlock hash_blocks[BLOCKS_PER_GROUP])>& hash_exception_callback)
{
  std::vector<std::array<u8, BLOCK_DATA_SIZE>> unencrypted_data(BLOCKS_PER_GROUP);
  std::vector<HashBlock> unencrypted_hashes(BLOCKS_PER_GROUP);

  const bool success =
      HashGroup(unencrypted_data.data(), unencrypted_hashes.data(),
                /** Reads one decrypted block or pads beyond the partition before hashing. */
                [&](size_t block) {
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

  auto aes_context = Common::AES::CreateContextEncrypt(key.data());

  for (size_t j = 0; j < BLOCKS_PER_GROUP; ++j)
  {
    u8* out_ptr = out->data() + j * BLOCK_TOTAL_SIZE;

    aes_context->CryptIvZero(reinterpret_cast<u8*>(&unencrypted_hashes[j]), out_ptr,
                             BLOCK_HEADER_SIZE);

    aes_context->Crypt(out_ptr + 0x3D0, unencrypted_data[j].data(),
                       out_ptr + BLOCK_HEADER_SIZE, BLOCK_DATA_SIZE);
  }

  return true;
}

/** VolumeWii.cpp lines 644-647. */
void VolumeWii::DecryptBlockHashes(const u8* in, HashBlock* out, Common::AES::Context* aes_context)
{
  aes_context->CryptIvZero(in, reinterpret_cast<u8*>(out), sizeof(HashBlock));
}

/** VolumeWii.cpp lines 649-652. */
void VolumeWii::DecryptBlockData(const u8* in, u8* out, Common::AES::Context* aes_context)
{
  aes_context->Crypt(&in[0x3d0], &in[sizeof(HashBlock)], out, BLOCK_DATA_SIZE);
}
}  // namespace DiscIO

// NOLINTEND
// clang-format on
// ===== END ported region =====
