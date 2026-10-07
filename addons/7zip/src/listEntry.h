#pragma once

#include <napi.h>

#include <cstdint>
#include <optional>
#include <string>

#include "7zip/Archive/IArchive.h"

namespace sevenzip::detail {

/** Native snapshot of the six archive-item properties exposed to JavaScript. */
struct Entry {
    // The archive's own item index, stored rather than recovered from this
    // queue's position, so that it stays correct however the list is later
    // filtered or ordered
    uint32_t index = 0;
    std::optional<std::string> entryPath;
    std::optional<uint64_t> size;
    std::optional<uint32_t> crc32;
    bool isDirectory = false;
    bool isEncrypted = false;
};

/** Reads one item's native properties on the listing worker into its existing record. */
void ReadEntry(IInArchive& archive, uint32_t i, Entry& entry);

/** Fills the existing JS object on the loop thread without taking ownership of its native record. */
void WriteEntry(Napi::Env env, const Entry& entry, Napi::Object object);

}  // namespace sevenzip::detail
