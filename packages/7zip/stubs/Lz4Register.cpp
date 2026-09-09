// Keep codec callbacks on the addon's dedicated producer thread.
#include <memory>

#include "7zip/Compress/Lz4Decoder.h"

namespace {
void* CreateDecoder() {
    auto decoder = std::make_unique<NCompress::NLZ4::CDecoder>();
    decoder->SetNumberOfThreads(1);
    return static_cast<ICompressCoder*>(decoder.release());
}
REGISTER_CODECS_VAR{
    {CreateDecoder, nullptr, 0x4F71104, "LZ4", 1, false},
};
REGISTER_CODECS(Lz4)
}  // namespace
