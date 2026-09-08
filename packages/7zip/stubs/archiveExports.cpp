// Upstream's ArchiveExports.cpp, compiled here with INITGUID so that this one
// translation unit emits real storage for CLSID_CArchiveHandler. Without a real
// definition somewhere the symbol stays an unresolved extern and the addon
// fails to load; upstream normally gets it from the DLL-export source this
// addon does not compile. INITGUID stays scoped to this file, because defining
// it project-wide would make every other translation unit emit storage for the
// same GUIDs and collide at link time.
//
// The upstream file is included rather than copied so that it stays upstream.

#define INITGUID before including
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
