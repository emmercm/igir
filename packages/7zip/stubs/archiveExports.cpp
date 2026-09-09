// Upstream's ArchiveExports.cpp, compiled here with INITGUID so that this one
// translation unit emits real storage for CLSID_CArchiveHandler. Without a real
// definition somewhere the symbol stays an unresolved extern and the addon
// fails to load; upstream normally gets it from the DLL-export source this
// addon does not compile. INITGUID stays scoped to this file, because defining
// it project-wide would make every other translation unit emit storage for the
// same GUIDs and collide at link time.
//
// The upstream file is included rather than copied so that it stays upstream.

#define INITGUID
// NOLINTNEXTLINE(bugprone-suspicious-include): including the .cpp is the point.
#include "7zip/Archive/ArchiveExports.cpp"
