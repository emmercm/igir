// Real storage for the 7-Zip interface IIDs this addon uses. The SDK's
// DEFINE_GUID/Z7_DEFINE_GUID macros emit storage only where INITGUID is defined
// as a header declares a GUID, and expand to a bare `extern` everywhere else --
// so exactly one translation unit has to be compiled with it active.
//
// It has to be this file's own gyp target, with INITGUID as a -D flag rather
// than a `#define` here. Every target force-includes stubs/handlerOut.h, which
// pulls in these same interface headers; a forced include is processed before
// the source file's own first line, so a `#define` here would arrive after the
// headers' include guards were already set and their GUID macros already
// expanded in their extern-only form. A -D flag is in effect from the start of
// preprocessing and beats the forced include.
//
// Only ICoder.h and IPassword.h are included: stubs/archiveExports.cpp already
// real-defines the IArchive, IStream and IProgress GUIDs, and IID_IUnknown
// comes from Common/MyWindows.h. Including any of those again here would be a
// duplicate definition, not merely redundant.

#include "7zip/ICoder.h"
#include "7zip/IPassword.h"
