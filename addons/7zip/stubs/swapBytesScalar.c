/* swapBytesScalar.c: compile upstream SwapBytes.c with its SIMD paths
   disabled.

   C/SwapBytes.c defines k_SwapBytes_Mode_MAX itself on x86, overriding the
   -Dk_SwapBytes_Mode_MAX=0 the build passes in, so the object ends up carrying
   SSE2/SSSE3/AVX2 code paths.  Undefining the two architecture macros for this
   translation unit sends the file down its portable #else branch, which is
   plain scalar C.  NEON is baseline on AArch64 and would be permitted, but
   taking the same branch everywhere keeps one behavior to reason about.  The
   functions themselves are upstream's own code, unmodified.

   Deliberately NOT named after the file it wraps: "stubs" is on the include
   path, so on a case-insensitive filesystem a same-named wrapper would include
   itself.

   Keep this file thin.  Its value is that upstream stays upstream. */

#include "Precomp.h"
#include "CpuArch.h"

#undef MY_CPU_X86_OR_AMD64
#undef MY_CPU_ARM_OR_ARM64

#include <SwapBytes.c>
