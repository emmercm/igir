/* Stub implementations of Ppmd8_EncodeSymbol and Ppmd8_Flush_RangeEnc, the two
   range-encoder entry points NPpmdZip::CEncoder calls.

   PpmdZip.cpp holds both CDecoder (ZIP method 98, a live decode path) and
   CEncoder, with no Z7_EXTRACT_ONLY guard between them, so the encoder is
   compiled as dead code and its calls reach the linker even though nothing
   constructs one.

   Leaving the two symbols undefined is not portable.  A Node addon is the one
   place an undefined symbol is not necessarily a link error, and each toolchain
   behaves differently:

     - macOS:   -undefined dynamic_lookup plus -dead_strip removes the encoder
                outright, so the symbols never appear.
     - Linux:   a shared object may carry them and resolve them lazily, leaving
                a null call site.  --gc-sections does not help on its own:
                without -fvisibility=hidden, CEncoder::Code is a GC root.
     - Windows: MSVC resolves every referenced symbol when linking a DLL, so
                this is an LNK2019 and the addon does not build at all.

   Defining them here makes all three behave the same, with no dependence on
   whether a given linker's dead-code elimination fires.

   Both return void, so unlike the C++ stubs they cannot report E_NOTIMPL to a
   caller: CEncoder would simply emit a truncated stream. Reaching either one
   aborts instead.  Nothing enforces the invariant mechanically: if you add
   a code path that can construct a CEncoder, these aborts are what you will hit
   at runtime.  Do not add C/Ppmd8Enc.c to satisfy them. */

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
