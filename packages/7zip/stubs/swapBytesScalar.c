/* swapBytesScalar.c -- compile upstream SwapBytes.c with its SIMD paths disabled.

   deps/7zip/C/SwapBytes.c raises its own vectorization ceiling:

       #ifdef MY_CPU_X86_OR_AMD64
         #if <compiler is new enough>
           #define k_SwapBytes_Mode_MAX  k_SwapBytes_Mode_AVX2
           #define SWAP_ATTRIB_SSE2  __attribute__((__target__("sse2")))
           ...

   That unconditional #define overrides the -Dk_SwapBytes_Mode_MAX=0 the
   build passes in (clang reports -Wmacro-redefined and keeps its own value),
   so an x86-64 object ends up carrying SSE2/SSSE3/AVX2 code paths.  The
   `#ifndef k_SwapBytes_Mode_MAX / #define 0` fallback further down IS still
   reached on x86, it just no-ops: the macro is already defined by that point,
   so the #ifndef is false and the fallback contributes nothing.

   Undefining the two architecture macros for this translation unit only
   sends the file down its portable #else branch, which is plain scalar C.
   NEON is baseline on AArch64 and would be permitted, but taking the same
   branch everywhere keeps one behavior to reason about.  The functions
   themselves are upstream's own code, unmodified.

   This file is deliberately NOT named after the upstream file it wraps: the
   "stubs" directory is on the include path, so on a case-insensitive
   filesystem a same-named wrapper would include itself.

   Keep this file thin.  Its value is that upstream stays upstream. */

#include "Precomp.h"
#include "CpuArch.h"

#undef MY_CPU_X86_OR_AMD64
#undef MY_CPU_ARM_OR_ARM64

#include <SwapBytes.c>
