#pragma once

#include <napi.h>

#include <cstdint>
#include <string>

namespace sevenzip {

// Resolves to an array of entry objects; rejects with an Error on failure.
// `path` is copied, so the caller's JS value need not outlive it.
//
// Each entry object carries `entryPath`, `size`, `crc32`, `isDirectory` and
// `isEncrypted`. The first three are `undefined` when the format does not record
// them, which is not the same as empty or zero -- a `.bz2` member really can be
// zero bytes long, and only the caller can tell "empty" from "unknown".
//
// Entry paths are reported VERBATIM, exactly as the archive recorded them,
// separators included. An entry written on Windows comes back with backslashes.
// Normalizing here would be a lie about the archive's contents, and callers that
// want a normalized form can do it in one line; callers that want the truth
// could not get it back. Passing either spelling to extractEntry() works
// regardless -- see FindEntryIndex() in sevenZip.h.
//
// The work happens on the libuv thread pool. Nothing there blocks on another
// thread: it opens the archive, walks its item table, and returns.
Napi::Value ListEntries(Napi::Env env, std::string path, uint32_t formatIndex);

}  // namespace sevenzip
