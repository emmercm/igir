// Stubs for the handful of Dolphin symbols that are referenced only by the
// disc-image *writing/conversion* code paths of the blob readers we compile, but
// never by the reading paths this addon actually exercises:
//
//   File::Delete            <- CompressedBlob.cpp ConvertToGCZ (error cleanup)
//   DiscIO::GetFSTOffset    <- WIABlob.cpp WIARVZFileReader::SetUpDataEntriesForWriting
//   DiscIO::GetFSTSize      <- WIABlob.cpp WIARVZFileReader::SetUpDataEntriesForWriting
//   DiscIO::CreateDisc      <- WIABlob.cpp ConvertToWIAOrRVZ
//   IOS::ES::TicketReader::IsValid / GetTitleKey
//                           <- WIABlob.cpp WIARVZFileReader::SetUpDataEntriesForWriting
//
// The real implementations (FileUtil.cpp, DiscUtils.cpp, Volume.cpp, Formats.cpp)
// would each pull in large slices of the Dolphin volume/filesystem/IOS stack that
// are unnecessary for opening RVZ/GCZ/WIA files. On Linux/macOS the addon links as
// a shared module that tolerates these as undefined symbols; a Windows DLL requires
// every referenced symbol to resolve, so provide inert definitions here. They return
// failure/empty defaults and are never reached at runtime.

#include <array>
#include <memory>
#include <optional>
#include <string>

#include "Common/FileUtil.h"
#include "Core/IOS/ES/Formats.h"
#include "DiscIO/DiscUtils.h"
#include "DiscIO/Volume.h"
// CreateDisc returns std::unique_ptr<VolumeDisc>; libstdc++ and MSVC need
// VolumeDisc complete (not just the forward declaration in Volume.h) to
// instantiate the deleter, even for a `return nullptr` (Apple libc++ defers
// this, so a macOS-only build wouldn't catch it).
#include "DiscIO/VolumeDisc.h"

namespace File {
bool Delete(const std::string& filename, IfAbsentBehavior behavior) { return false; }
}  // namespace File

namespace DiscIO {
std::optional<u64> GetFSTOffset(const Volume& volume, const Partition& partition) { return std::nullopt; }
std::optional<u64> GetFSTSize(const Volume& volume, const Partition& partition) { return std::nullopt; }
std::unique_ptr<VolumeDisc> CreateDisc(const std::string& path) { return nullptr; }
}  // namespace DiscIO

namespace IOS::ES {
bool TicketReader::IsValid() const { return false; }
std::array<u8, 16> TicketReader::GetTitleKey() const { return {}; }
}  // namespace IOS::ES
