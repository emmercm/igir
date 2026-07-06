// Stub for DiscIO::DirectoryBlobReader::Create, called by Blob.cpp's
// CreateBlobReader() default branch. The real DirectoryBlob.cpp pulls in the whole
// volume/filesystem/IOS stack, unneeded for opening RVZ/GCZ/WIA files. Returns
// nullptr so callers fall through to the plain-file path.

#include "DiscIO/DirectoryBlob.h"

namespace DiscIO {
std::unique_ptr<DirectoryBlobReader> DirectoryBlobReader::Create(const std::string& /*dol_path*/) { return nullptr; }
}  // namespace DiscIO
