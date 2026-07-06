// Stubs for DiscIO::GetFSTOffset/GetFSTSize, referenced only by WIABlob.cpp's
// WIA/RVZ writing path, which this read-only addon never runs. Stubbed (rather
// than left undefined) because a Windows DLL must resolve every referenced symbol.

#include "DiscIO/DiscUtils.h"

#include <optional>

namespace DiscIO {
std::optional<u64> GetFSTOffset(const Volume& /*volume*/, const Partition& /*partition*/) { return std::nullopt; }
std::optional<u64> GetFSTSize(const Volume& /*volume*/, const Partition& /*partition*/) { return std::nullopt; }
}  // namespace DiscIO
