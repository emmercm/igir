#pragma once

#include <napi.h>

#include <cstdint>
#include <string>

namespace sevenzip {

// Resolves to an array of entry objects; rejects with an Error on failure.
// `path` is copied, so the caller's JS value need not outlive it.
//
// Each entry object carries `entryIndex`, `entryPath`, `size`, `crc32`,
// `isDirectory` and `isEncrypted`. The path, size and CRC are `undefined` when
// the format does not record them, which is not the same as empty or zero:
// only the caller can tell "empty" from "unknown".
//
// Entry paths are reported with `/` separators on every platform, because some
// handlers rewrite `/` to the host's separator before the path can be read and
// the same archive would otherwise list differently on Windows and on Linux.
// A reported path resolves back to the entry it came from.
//
// The work happens on a dedicated thread that blocks on nothing: it opens the
// archive, walks its item table, and returns. Environment teardown cancels the
// listing and waits for it.
Napi::Value ListEntries(Napi::Env env, std::string path, uint32_t formatIndex);

}  // namespace sevenzip
