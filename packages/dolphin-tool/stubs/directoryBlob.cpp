// Stub for DiscIO::DirectoryBlobReader::Create.
//
// DiscIO/Blob.cpp's CreateBlobReader() references DirectoryBlobReader::Create in
// its default branch (for extracted-disc directories). The real implementation
// (DiscIO/DirectoryBlob.cpp) pulls in the entire Dolphin volume/filesystem/IOS
// stack, none of which the addon needs to open RVZ/GCZ/WIA blob files. This stub
// provides just that one referenced symbol, returning nullptr so callers fall
// through to the plain-file path. Dolphin submodule tag 2606.

#include "DiscIO/DirectoryBlob.h"

namespace DiscIO
{
std::unique_ptr<DirectoryBlobReader> DirectoryBlobReader::Create(const std::string& dol_path)
{
  return nullptr;
}
}  // namespace DiscIO
