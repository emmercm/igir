/* sha256Scalar.c -- compile upstream Sha256.c with its hardware-SHA path
   disabled.

   C/Sha256.c's ARM ladder keys off __ARM_ARCH and the compiler version rather
   than the feature macros the build undefines, so it defines
   Z7_COMPILER_SHA256_SUPPORTED anyway and dispatches to Sha256_UpdateBlocks_HW.
   Linking that to satisfy the reference would put SHA-NI or sha256h
   instructions in the binary.

   Undefining the two architecture macros for this translation unit makes both
   branches false, so the file compiles only its own portable
   Sha256_UpdateBlocks, Sha256Prepare() becomes empty, and Sha256_SetFunction()
   rejects every algorithm above SHA256_ALGO_SW.  The macros are read only
   inside the hardware-dispatch blocks, so nothing else here is affected.

   This is a live decode path, not dead code: the XZ decoder hashes the decoded
   stream when an .xz file declares XZ_CHECK_SHA256.

   Deliberately NOT named after the file it wraps: "stubs" is on the include
   path, so on a case-insensitive filesystem a same-named wrapper would include
   itself.

   Keep this file thin.  Its value is that upstream stays upstream. */

#include "Precomp.h"
#include "CpuArch.h"

#undef MY_CPU_X86_OR_AMD64
#undef MY_CPU_ARM_OR_ARM64

#include <Sha256.c>
