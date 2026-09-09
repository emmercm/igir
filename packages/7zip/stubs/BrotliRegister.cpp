// Keep codec callbacks on the addon's dedicated producer thread.
#include <memory>

#include "7zip/Compress/BrotliDecoder.h"

namespace {
void* CreateDecoder() {
    auto decoder = std::make_unique<NCompress::NBROTLI::CDecoder>();
    decoder->SetNumberOfThreads(1);
    return static_cast<ICompressCoder*>(decoder.release());
}
REGISTER_CODECS_VAR{
    {CreateDecoder, nullptr, 0x4F71102, "BROTLI", 1, false},
};
REGISTER_CODECS(Brotli)
}  // namespace
