// Stub for DiscIO::DirectoryBlobReader::Create, referenced by DiscIO/Blob.cpp's
// CreateBlobReader() default branch. The real implementation (DirectoryBlob.cpp)
// pulls in the whole Dolphin volume/filesystem/IOS stack, unneeded for opening
// RVZ/GCZ/WIA files. Returns nullptr so callers fall through to the plain-file path.

#include "DiscIO/DirectoryBlob.h"

namespace DiscIO {
std::unique_ptr<DirectoryBlobReader> DirectoryBlobReader::Create(const std::string& dol_path) { return nullptr; }
}  // namespace DiscIO
