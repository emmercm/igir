// Stub for File::Delete, referenced only by CompressedBlob.cpp's ConvertToGCZ
// (GCZ writing), which this read-only addon never runs. Stubbed because a
// Windows DLL must resolve every referenced symbol.

#include "Common/FileUtil.h"

#include <string>

namespace File {
bool Delete(const std::string& /*filename*/, IfAbsentBehavior /*behavior*/) { return false; }
}  // namespace File
