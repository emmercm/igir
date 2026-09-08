/* crc32.c -- compile upstream 7zCrc.c with its hardware-CRC32 path disabled.

   C/7zCrc.c re-defines __ARM_FEATURE_CRC32 itself when it sees an ARM target
   and a new enough compiler, so a command-line -U cannot keep it off; the
   resulting object carries crc32b/crc32x, an optional ARMv8 extension this
   addon may not reference. Undefining MY_CPU_ARM_OR_ARM64 for this translation
   unit sends the file down its portable branch instead, where the hardware path
   is already compiled out. The macro is read only inside that block, so nothing
   else here is affected, and the tables and public API are upstream's own code.

   Deliberately NOT named after the file it wraps: "stubs" is on the include
   path, so on a case-insensitive filesystem a same-named wrapper would include
   itself.

   Keep this file thin.  Its value is that upstream stays upstream. */

#include "Precomp.h"
#include "CpuArch.h"

#undef MY_CPU_ARM_OR_ARM64

#include <7zCrc.c>
