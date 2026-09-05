/* sha256Scalar.c -- compile upstream Sha256.c with its hardware-SHA path disabled.

   deps/7zip/C/Sha256.c selects a hardware SHA-256 implementation like this:

       #ifdef MY_CPU_X86_OR_AMD64
         #if <compiler is new enough>
           #define Z7_COMPILER_SHA256_SUPPORTED
         #endif
       #elif defined(MY_CPU_ARM_OR_ARM64) && defined(MY_CPU_LE)
         #if defined(__ARM_FEATURE_SHA2) || defined(__ARM_FEATURE_CRYPTO)
           #define Z7_COMPILER_SHA256_SUPPORTED
         #else
           ... a compiler-version ladder that also defines it ...

   The ARM ladder is reached even with -U__ARM_FEATURE_SHA2 and
   -U__ARM_FEATURE_CRYPTO on the command line: it keys off __ARM_ARCH and the
   compiler version, not off the feature macros the build undefines, so
   Z7_COMPILER_SHA256_SUPPORTED ends up defined anyway.  Once it is,
   Sha256_Init() dispatches through g_SHA256_FUNC_UPDATE_BLOCKS and
   Sha256Prepare() resolves that to Sha256_UpdateBlocks_HW -- which lives in
   C/Sha256Opt.c and is compiled `__attribute__((__target__("sha2")))`.
   Linking that file to satisfy the reference would put SHA-NI (x86) or
   sha256h/sha256su0 (AArch64) instructions in the binary.

   Undefining the two architecture macros for this translation unit only makes
   both branches false, so the file never defines
   Z7_COMPILER_SHA256_SUPPORTED, never references Sha256_UpdateBlocks_HW, and
   compiles only its own portable Sha256_UpdateBlocks.  Sha256Prepare() becomes
   an empty function and Sha256_SetFunction() rejects every algorithm above
   SHA256_ALGO_SW, which is the behavior this addon wants.  The two macros are
   consumed by Sha256.c only inside the hardware-dispatch blocks, so nothing
   else in this translation unit is affected.

   The reference comes from the XZ decoder: C/Xz.c and C/XzDec.c hash the
   decoded stream when an .xz file declares XZ_CHECK_SHA256, so this is a live
   decode path, not dead code.

   This file is deliberately NOT named after the upstream file it wraps: the
   "stubs" directory is on the include path, so on a case-insensitive
   filesystem a same-named wrapper would include itself.

   Keep this file thin.  Its value is that upstream stays upstream. */

#include "Precomp.h"
#include "CpuArch.h"

#undef MY_CPU_X86_OR_AMD64
#undef MY_CPU_ARM_OR_ARM64

#include <Sha256.c>
