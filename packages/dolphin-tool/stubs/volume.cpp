// Stub for DiscIO::CreateDisc, referenced only by WIABlob.cpp's WIA/RVZ writing
// path, which this read-only addon never runs.

#include "DiscIO/Volume.h"

#include <memory>
#include <string>
// Complete type (Volume.h only forward-declares it) so the unique_ptr<VolumeDisc>
// deleter can be instantiated, which libstdc++/MSVC require even for `return nullptr`.
#include "DiscIO/VolumeDisc.h"

namespace DiscIO {
std::unique_ptr<VolumeDisc> CreateDisc(const std::string& /*path*/) { return nullptr; }
}  // namespace DiscIO
