// Stub for File::Delete, referenced only by CompressedBlob.cpp's ConvertToGCZ
// (GCZ *writing*), which this read-only addon never runs. The real FileUtil.cpp
// pulls in the wider host-filesystem layer. A Windows DLL must resolve every
// referenced symbol; Linux/macOS tolerate it as undefined.

#include "Common/FileUtil.h"

#include <string>

namespace File {
bool Delete(const std::string& filename, IfAbsentBehavior behavior) { return false; }
}  // namespace File
