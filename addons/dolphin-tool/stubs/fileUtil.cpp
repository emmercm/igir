// Stub for File::Delete, referenced only by CompressedBlob.cpp's ConvertToGCZ
// (GCZ writing), which this read-only addon never runs.

#include "Common/FileUtil.h"

#include <string>

namespace File {
/** Unreachable; returns false, as a failed delete would */
bool Delete(const std::string& /*filename*/, IfAbsentBehavior /*behavior*/) { return false; }
}  // namespace File
