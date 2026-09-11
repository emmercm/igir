#pragma once

#include <napi.h>

#include <cstdint>
#include <string>

namespace sevenzip {

/**
 * Starts a dedicated listing job and returns its JavaScript promise.
 *
 * Each result contains index, path, size, CRC, directory, and encryption
 * metadata; unavailable properties remain undefined. Paths use `/` on every
 * platform and resolve back to their items. The copied path and native worker
 * do not depend on the caller's JavaScript value, and teardown cancels and
 * drains the job.
 */
Napi::Value ListEntries(Napi::Env env, std::string path, uint32_t formatIndex);

}  // namespace sevenzip
