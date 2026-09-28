// Stubs for DiscIO::GetFSTOffset/GetFSTSize, referenced only by WIABlob.cpp's
// WIA/RVZ writing path, which this read-only addon never runs.

#include "DiscIO/DiscUtils.h"

#include <optional>

namespace DiscIO {
// Unreachable; returns no offset
std::optional<u64> GetFSTOffset(const Volume& /*volume*/, const Partition& /*partition*/) { return std::nullopt; }

// Unreachable; returns no size
std::optional<u64> GetFSTSize(const Volume& /*volume*/, const Partition& /*partition*/) { return std::nullopt; }
}  // namespace DiscIO
