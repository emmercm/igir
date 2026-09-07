// ArchiveExports.cpp implements GetNumberOfFormats/GetHandlerProperty2 (used
// directly by src/sevenZip.cpp) and, via Common/RegisterArc.h, calls
// Z7_DEFINE_GUID(CLSID_CArchiveHandler, ...). That macro (see
// Common/MyGuidDef.h) only produces a real definition (storage) for the GUID
// when INITGUID is defined at the point of inclusion; otherwise it expands to
// a plain `extern` declaration. Upstream normally gets a real definition from
// Archive/DllExports2.cpp, which #define INITGUID before including
// Common/MyInitGuid.h -- but this addon does not compile DllExports2.cpp (DLL
// export / COM self-registration boilerplate it has no use for). Without a
// real definition somewhere, CLSID_CArchiveHandler stays an unresolved
// extern and the addon fails to dlopen ("symbol not found in flat namespace
// '_CLSID_CArchiveHandler'").
//
// INITGUID is defined only for this one translation unit -- not project-wide,
// which would cause duplicate-definition link errors for the many other GUIDs
// DEFINE_GUID'd throughout the SDK once every TU that includes those headers
// started emitting real storage for them too. The real, unmodified upstream
// ArchiveExports.cpp is re-included here (not copied) so its only compiled
// instance is this one, with INITGUID active.

#define INITGUID
// NOLINTNEXTLINE(bugprone-suspicious-include): including the .cpp is the point.
#include "7zip/Archive/ArchiveExports.cpp"
