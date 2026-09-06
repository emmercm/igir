/* Stub implementations of Ppmd8_EncodeSymbol and Ppmd8_Flush_RangeEnc
   (deps/7zip/C/Ppmd8.h:175-176), the two range-encoder entry points that
   C/Ppmd8Enc.c defines and that NPpmdZip::CEncoder::Code() calls
   (CPP/7zip/Compress/PpmdZip.cpp:283, :284, :293).

   CPP/7zip/Compress/PpmdZip.cpp holds both NPpmdZip::CDecoder -- ZIP
   compression method 98, a legitimate decode path that ZipHandler.cpp:1168
   reaches -- and NPpmdZip::CEncoder, with no Z7_EXTRACT_ONLY guard between
   them.  The whole translation unit is compiled unconditionally, so the
   encoder comes along as dead code and its calls into Ppmd8Enc.c reach the
   linker even though nothing constructs a CEncoder.

   Leaving those two symbols undefined is not portable.  A Node addon is the
   one place an undefined symbol is not a link error, and each toolchain
   fails differently:

     - macOS:   node-gyp links with -undefined dynamic_lookup and -dead_strip
                removes the encoder outright, so the symbols never appear.
     - Linux:   a shared object may carry undefined symbols and resolve them
                lazily, so this links but leaves a null call site.  Enabling
                --gc-sections does not help by itself: without
                -fvisibility=hidden, CEncoder::Code is a default-visibility
                symbol in a .so and therefore a GC root.
     - Windows: MSVC resolves every referenced symbol when linking a DLL, so
                this is an LNK2019 and the addon does not build at all.
                /OPT:REF runs after symbol resolution and cannot rescue it.

   Defining them here makes all three behave the same, with no dependence on
   whether a given linker's dead-code elimination happens to fire.  This is
   the same technique stubs/bzip2Encoder.cpp, stubs/zipUpdate.cpp and
   stubs/myAes.cpp use for the other compressors this decode-only addon
   deliberately does not link.

   Both functions return void, so unlike the C++ stubs they cannot report
   E_NOTIMPL to a caller.  There is no return value that would let CEncoder
   fail cleanly -- it would simply emit a truncated stream -- so reaching
   either one aborts instead.  Silent output corruption is the worse outcome.

   These bodies are unreachable by construction: NPpmdZip::CEncoder is the
   only caller, and nothing in a decode-only build constructs one.  Note that
   nothing enforces this mechanically.  Defining the symbols here deliberately
   gave up the one tripwire that existed -- an undefined symbol, which was
   fatal only on the toolchains above -- in exchange for building the same way
   everywhere.  The invariant is maintained by review, so if you add a code
   path that can construct a CEncoder, these aborts are what you will hit at
   runtime.  Do not add C/Ppmd8Enc.c to satisfy them. */

#include "Precomp.h"

#include <stdio.h>
#include <stdlib.h>

#include "Ppmd8.h"

static void Ppmd8Enc_Unreachable(const char *name)
{
  fprintf(stderr,
      "7zip addon: %s was called, but this addon is built decode-only and "
      "links no PPMd encoder. Reaching it means NPpmdZip::CEncoder became "
      "constructible; see stubs/ppmd8Enc.c.\n",
      name);
  abort();
}

void Ppmd8_Flush_RangeEnc(CPpmd8 *p)
{
  UNUSED_VAR(p)
  Ppmd8Enc_Unreachable("Ppmd8_Flush_RangeEnc");
}

void Ppmd8_EncodeSymbol(CPpmd8 *p, int symbol)
{
  UNUSED_VAR(p)
  UNUSED_VAR(symbol)
  Ppmd8Enc_Unreachable("Ppmd8_EncodeSymbol");
}
