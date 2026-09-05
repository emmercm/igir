/* crc32.c -- compile upstream 7zCrc.c with its hardware-CRC32 path disabled.

   deps/7zip/C/7zCrc.c selects a hardware CRC32 implementation like this:

       #if defined(MY_CPU_ARM_OR_ARM64)
         #if <compiler is new enough>
           #if !defined(__ARM_FEATURE_CRC32)
             #define __ARM_FEATURE_CRC32 1
             #define ATTRIB_CRC __attribute__((__target__("crc")))
           #endif
           #if defined(__ARM_FEATURE_CRC32)
             #define Z7_CRC_HW_USE
           #endif

   The `#if !defined(__ARM_FEATURE_CRC32)` guard is reached and evaluates
   true, so the file re-defines the macro the build deliberately undefined
   and then compiles a `__target__("crc")` function.  A command-line
   -U__ARM_FEATURE_CRC32 cannot survive that, and the resulting object
   contains crc32b/crc32x instructions -- an optional ARMv8 extension the
   addon is not allowed to reference.

   Undefining MY_CPU_ARM_OR_ARM64 for this translation unit only sends the
   file down its portable branch instead, where the hardware path is already
   compiled out.  Everything else, including the slicing-by-N tables and the
   whole public API, is upstream's own code, unmodified.  The macro is
   consumed by 7zCrc.c only inside the hardware-CRC block, so nothing else in
   this translation unit is affected.

   This file is deliberately NOT named after the upstream file it wraps: the
   "stubs" directory is on the include path, so on a case-insensitive
   filesystem a same-named wrapper would include itself.

   Keep this file thin.  Its value is that upstream stays upstream. */

#include "Precomp.h"
#include "CpuArch.h"

#undef MY_CPU_ARM_OR_ARM64

#include <7zCrc.c>
