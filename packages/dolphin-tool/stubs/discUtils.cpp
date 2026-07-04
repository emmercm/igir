// Stubs for DiscIO::GetFSTOffset/GetFSTSize, referenced only by WIABlob.cpp's
// WIARVZFileReader::SetUpDataEntriesForWriting (WIA/RVZ *writing*), which this
// read-only addon never runs. The real DiscUtils.cpp pulls in the filesystem
// stack. A Windows DLL must resolve every referenced symbol; Linux/macOS
// tolerate them as undefined.

#include "DiscIO/DiscUtils.h"

#include <optional>

namespace DiscIO {
std::optional<u64> GetFSTOffset(const Volume&, const Partition&) { return std::nullopt; }
std::optional<u64> GetFSTSize(const Volume&, const Partition&) { return std::nullopt; }
}  // namespace DiscIO
