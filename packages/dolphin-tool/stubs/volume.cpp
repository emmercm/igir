// Stub for DiscIO::CreateDisc(const std::string&), referenced only by WIABlob.cpp's
// ConvertToWIAOrRVZ (WIA/RVZ *writing*), which this read-only addon never runs. The
// real Volume.cpp pulls in every VolumeGC/VolumeWii/filesystem reader. A Windows DLL
// must resolve every referenced symbol; Linux/macOS tolerate it as undefined.

#include "DiscIO/Volume.h"

#include <memory>
#include <string>
// Complete type (not just Volume.h's forward declaration) so the unique_ptr<VolumeDisc>
// deleter can be instantiated, which libstdc++ and MSVC require even for `return nullptr`.
#include "DiscIO/VolumeDisc.h"

namespace DiscIO {
std::unique_ptr<VolumeDisc> CreateDisc(const std::string& /*path*/) { return nullptr; }
}  // namespace DiscIO
