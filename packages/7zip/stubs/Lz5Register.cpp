// Keep codec callbacks on the addon's dedicated producer thread.
#include <memory>

#include "7zip/Compress/Lz5Decoder.h"

namespace {
void* CreateDecoder() {
    auto decoder = std::make_unique<NCompress::NLZ5::CDecoder>();
    decoder->SetNumberOfThreads(1);
    return static_cast<ICompressCoder*>(decoder.release());
}
REGISTER_CODECS_VAR{
    {CreateDecoder, nullptr, 0x4F71105, "LZ5", 1, false},
};
REGISTER_CODECS(Lz5)
}  // namespace
