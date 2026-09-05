// Real storage for every 7-Zip interface IID (IID_ICompressCoder, IID_IInArchive,
// IID_IUnknown, etc.) used anywhere in this addon.
//
// Common/MyGuidDef.h's DEFINE_GUID/Z7_DEFINE_GUID macros only allocate real storage
// for a GUID when the INITGUID preprocessor macro is #define'd at the exact point a
// header declares that GUID; otherwise the macro expands to a plain `extern const
// GUID name;` declaration with no storage. Every interface header in this SDK
// (ICoder.h, IArchive.h, IStream.h, ...) declares its IIDs this way, and each such
// header is written to be included from many translation units, so upstream expects
// exactly one of those inclusions -- normally Archive/DllExports2.cpp, a DLL-export/
// COM-registration TU this addon does not compile -- to happen with INITGUID active.
//
// This must be its own translation unit, built as its own gyp target ("guiddefs" in
// binding.gyp) with "INITGUID" in that target's own "defines", rather than a source
// added to the "binding" or "sevenzip" target's "sources" list. Reason: every target
// in this project force-includes stubs/handlerOut.h via target_defaults' cflags_cc
// ("-include handlerOut.h"), which transitively #includes these same interface
// headers. A "-include" file is processed as if it were the very first line of the
// main source file, before that file's own text (including any #define INITGUID it
// might write) ever runs -- so a plain `#define INITGUID` at the top of a .cpp added
// to an existing target's "sources" arrives too late: handlerOut.h's own chain has
// already caused every interface header's include guard to be set, and their
// Z7_DEFINE_GUID/DEFINE_GUID macro invocations to be expanded, using the
// non-INITGUID (extern-only) macro body, before this file's own #define could ever
// take effect. A GYP "defines" entry, by contrast, is a compiler -D flag: it is a
// predefined macro in effect from the very start of preprocessing this TU, before
// even the forced "-include handlerOut.h" is processed -- so it is active in time
// for every interface header, however it gets pulled in.
//
// INITGUID is defined only for this one gyp target/TU, not project-wide: every
// other TU in "sevenzip" and "binding" still gets the extern-only macro form for
// these same GUIDs, so their declarations resolve to the one real definition
// created here, without duplicate-symbol link errors.

// INITGUID itself is supplied by this file's own gyp target ("guiddefs" in
// binding.gyp), as a compiler -D flag -- not a `#define` here -- specifically so
// it is active before the "-include handlerOut.h" that target_defaults forces
// onto every target (including this one) is processed; see the file-level
// comment above for why that ordering matters. handlerOut.h's own transitive
// chain already reaches Common/MyWindows.h, whose non-_WIN32 branch defines
// IID_IUnknown directly, so it does not need to be separately requested here
// (doing so via Common/MyInitGuid.h as well would redefine it: that header
// makes the exact same DEFINE_GUID(IID_IUnknown, ...) call a second time).
//
// Only ICoder.h and IPassword.h are included here, not IArchive.h/IStream.h/
// IProgress.h: stubs/archiveExports.cpp (built with its own #define INITGUID,
// see that file) already transitively real-defines those three via
// ArchiveExports.cpp -> RegisterArc.h -> IArchive.h -> IStream.h/IProgress.h.
// Including them again here would just be a second, equally-real definition of
// the same GUIDs -- a duplicate-symbol link error, not merely redundant text.

#include "7zip/ICoder.h"
#include "7zip/IPassword.h"
