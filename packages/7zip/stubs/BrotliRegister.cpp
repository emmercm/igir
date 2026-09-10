// Keep codec callbacks on the addon's dedicated producer thread.
#include <memory>

#include "7zip/Compress/BrotliDecoder.h"

namespace {
/** Creates the decoder with one worker so the addon's own producer thread is the only execution context. */
void* CreateDecoder() {
    auto decoder = std::make_unique<NCompress::NBROTLI::CDecoder>();
    decoder->SetNumberOfThreads(1);
    return static_cast<ICompressCoder*>(decoder.release());
}
// These are upstream registration macros whose required C array and global
// constructor deliberately match the rest of 7-Zip's compiled codec registry.
// NOLINTBEGIN(cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays,modernize-use-designated-initializers,bugprone-throwing-static-initialization,cppcoreguidelines-avoid-non-const-global-variables)
REGISTER_CODECS_VAR{
    {CreateDecoder, nullptr, 0x4F71102, "BROTLI", 1, false},
};
REGISTER_CODECS(Brotli)
// NOLINTEND(cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays,modernize-use-designated-initializers,bugprone-throwing-static-initialization,cppcoreguidelines-avoid-non-const-global-variables)
}  // namespace
