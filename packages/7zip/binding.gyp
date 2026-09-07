{
  "variables": {"z7": "deps/7zip"},

  "target_defaults": {
    # 7-Zip's own code (MyString.cpp, MyVector.h, etc.) throws on allocation
    # failure/overflow; Node's common.gypi defaults to -fno-exceptions. Both the
    # "sevenzip" static library and the "binding" target (which compiles several
    # upstream *Register.cpp/handler TUs directly, see below) need real C++
    # exceptions and RTTI to compile 7-Zip sources, even though N-API access
    # itself stays NAPI_DISABLE_CPP_EXCEPTIONS.
    "cflags_cc!": ["-std=gnu++17", "-fno-exceptions", "-fno-rtti"],
    # -include handlerOut.h: see stubs/handlerOut.h. It supplies CMultiMethodProps /
    # CSingleMethodProps, which Z7_EXTRACT_ONLY omits from upstream's HandlerOut.h but
    # which CPP/7zip/Archive/Zip/ZipCompressionMode.h and Bz2Handler.cpp still require
    # to compile. Found via the "stubs" include_dir added to every target below
    # (a bare filename, not an absolute path, because gyp's make generator does not
    # shell-quote absolute paths and this repo's directory name contains a space).
    # cflags_cc (not cflags) keeps this off the C sources in "sevenzip".
    "cflags_cc": ["-std=c++20", "-fexceptions", "-frtti", "-include", "handlerOut.h"],
    # Dead-code elimination, the GCC/Clang counterpart to xcode_settings'
    # DEAD_CODE_STRIPPING below. This is a size optimization ONLY -- correctness
    # must never depend on it, which is why every compressor this addon declines
    # to link has a stub (see stubs/) instead of a symbol left undefined for the
    # linker to garbage-collect. -fvisibility=hidden is the load-bearing half:
    # --gc-sections treats any default-visibility symbol in a shared object as a
    # GC root, so without it the section flags accomplish nothing for exactly the
    # dead C++ classes worth dropping. It also matches what
    # GCC_SYMBOLS_PRIVATE_EXTERN already does on macOS; the N-API entry points
    # are exported by NAPI_MODULE's own visibility attribute, not by defaulting
    # the whole object to public.
    #
    # -flto and -fno-semantic-interposition are the speed half, matching what
    # packages/chdman and packages/dolphin-tool already use. Interposition in
    # particular is pure loss here: nothing outside this addon may replace one of
    # its symbols, so the indirection GCC emits to allow it buys nothing.
    #
    # Deliberately NOT here: -O3. node-gyp's own common.gypi already puts it in
    # every Release build's cflags, so repeating it (as packages/zlib-1.1.3 does)
    # would only be a second spelling of the same flag. The macOS counterpart is
    # not redundant and IS set below -- see GCC_OPTIMIZATION_LEVEL.
    "cflags": ["-ffunction-sections", "-fdata-sections", "-fvisibility=hidden",
               "-fno-semantic-interposition", "-flto"],
    "cflags_cc+": ["-fvisibility-inlines-hidden"],
    # --exclude-libs,ALL keeps the two static libraries' symbols out of the
    # shared object's dynamic table. That is what lets --gc-sections above
    # actually collect them: a symbol in the dynamic table is a GC root, and
    # -fvisibility=hidden only covers the code compiled here, not what arrives
    # through libsevenzip.a.
    "ldflags": ["-Wl,--gc-sections", "-Wl,--exclude-libs,ALL", "-flto"],
    "xcode_settings": {
      "CLANG_CXX_LANGUAGE_STANDARD": "c++20",
      "OTHER_CPLUSPLUSFLAGS": ["-std=c++20", "-fexceptions", "-frtti", "-include", "handlerOut.h"],
      # gyp defaults this to "s" (-Os) when it is unset, so unlike the -O3 in
      # cflags this one is load-bearing: without it the macOS build is optimized
      # for size. packages/zlib-1.1.3 sets it for the same reason.
      "GCC_OPTIMIZATION_LEVEL": "3",
      "LLVM_LTO": "YES",
      "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
      "GCC_INLINES_ARE_PRIVATE_EXTERN": "YES",
      "GCC_GENERATE_DEBUGGING_SYMBOLS": "NO",
      "DEAD_CODE_STRIPPING": "YES"
    },
    "msvs_settings": {
      # /Gy + /OPT:REF,ICF are the MSVC equivalent of the -ffunction-sections /
      # --gc-sections pair above, and carry the same caveat: a size optimization,
      # not a correctness mechanism. /OPT:REF in particular runs only after symbol
      # resolution has already succeeded, so it can never substitute for a stub.
      # WholeProgramOptimization (/GL) plus LinkTimeCodeGeneration (/LTCG) on
      # both the librarian and the linker is MSVC's LTO, the counterpart to
      # -flto above; /GL objects have to be archived and linked with /LTCG or
      # they are rejected.
      #
      # Deliberately NOT here: Optimization, FavorSizeOrSpeed and
      # EnableIntrinsicFunctions. node-gyp's common.gypi Release config already
      # sets them to /Ox, /Ot and /Oi -- copying packages/zlib-1.1.3's values
      # would DOWNGRADE this build, since its Optimization 2 is /O2 and its
      # FavorSizeOrSpeed 2 is /Os, favoring size over speed.
      "VCCLCompilerTool": {"ExceptionHandling": 1, "RuntimeTypeInfo": "true", "EnableFunctionLevelLinking": "true", "WholeProgramOptimization": "true", "AdditionalOptions": ["/std:c++20", "/FIhandlerOut.h"]},
      "VCLibrarianTool": {"AdditionalOptions": ["/LTCG"]},
      # OptimizeReferences 2 is already /OPT:REF, so no /OPT:REF is added to
      # AdditionalOptions here; /Brepro, /deterministic and /DEBUG:NONE are for
      # reproducible, debug-info-free prebuilds rather than for speed.
      "VCLinkerTool": {"OptimizeReferences": 2, "EnableCOMDATFolding": 2, "LinkTimeCodeGeneration": "1", "AdditionalOptions": ["/Brepro", "/deterministic", "/DEBUG:NONE"], "AdditionalOptions/": [["exclude", "lldltojobs"]]}
    },
    # Pin the instruction set to each platform's mandatory ABI floor -- SSE2 on
    # x86-64, NEON on AArch64 -- so the compiler cannot auto-vectorize into an
    # optional extension. Undefining feature macros is not sufficient on its own:
    # clang targeting arm64-apple-darwin defaults to -mcpu=apple-m1, which enables
    # FEAT_SHA3, and it will happily emit `bcax` for an ordinary scalar XOR loop.
    # Note -march=armv8-a does NOT prevent that on Apple clang (verified: the
    # flag is accepted and the SHA3 instructions are still emitted); -mcpu=generic
    # does. MSVC needs no equivalent: it targets the SSE2 baseline unless given an
    # explicit /arch: above it.
    "conditions": [
      ["target_arch=='x64'", {
        "cflags": ["-march=x86-64"],
        "xcode_settings": {
          "OTHER_CFLAGS": ["-march=x86-64"],
          "OTHER_CPLUSPLUSFLAGS": ["-march=x86-64"]
        }
      }],
      # ia32 must NOT share the x64 baseline: -march=x86-64 names a 64-bit CPU
      # and GCC and Clang both reject it outright when targeting 32-bit x86
      # ("bad value for -march= switch"), so this leg previously could not
      # compile at all. i686 plus an explicit SSE2 floor is the 32-bit
      # equivalent of what -march=x86-64 pins on the other leg -- SSE2 is
      # optional on i686, but Node's own ia32 builds require it -- and
      # -mfpmath=sse keeps the compiler off x87 for scalar float work.
      # There is no ia32 prebuild leg (see .github/workflows/node-addon-prebuild.yml),
      # so this path exists only for building from source on 32-bit x86.
      ["target_arch=='ia32'", {
        "cflags": ["-march=i686", "-msse2", "-mfpmath=sse"],
        "xcode_settings": {
          "OTHER_CFLAGS": ["-march=i686", "-msse2", "-mfpmath=sse"],
          "OTHER_CPLUSPLUSFLAGS": ["-march=i686", "-msse2", "-mfpmath=sse"]
        }
      }],
      ["target_arch=='arm64'", {
        "cflags": ["-mcpu=generic"],
        "xcode_settings": {
          "OTHER_CFLAGS": ["-mcpu=generic"],
          "OTHER_CPLUSPLUSFLAGS": ["-mcpu=generic"]
        }
      }],
      # linux/arm/v7 prebuild leg (see .github/workflows/node-addon-prebuild.yml).
      # Pin the same way as the other architectures so this leg gets a baseline
      # too, instead of compiling with whatever -march the toolchain defaults to.
      ["target_arch=='arm'", {
        "cflags": ["-march=armv7-a"],
        "xcode_settings": {
          "OTHER_CFLAGS": ["-march=armv7-a"],
          "OTHER_CPLUSPLUSFLAGS": ["-march=armv7-a"]
        }
      }]
    ]
  },

  "targets": [
    {
      "target_name": "sevenzip",
      "type": "static_library",
      "defines": ["Z7_ST", "Z7_NO_CRYPTO", "Z7_EXTRACT_ONLY", "k_SwapBytes_Mode_MAX=0",
                  "Z7_ZIP_LZFSE_DISABLE"],
      "include_dirs": ["stubs", "<(z7)/C", "<(z7)/CPP", "<(z7)/CPP/myWindows", "<(z7)/CPP/include_windows"],
      "cflags": ["-U__ARM_FEATURE_CRC32", "-U__ARM_FEATURE_CRYPTO", "-U__ARM_FEATURE_SHA2",
                 "-U__AES__", "-U__SHA__", "-U__SSSE3__", "-U__SSE4_1__", "-U__SSE4_2__",
                 "-U__AVX__", "-U__AVX2__", "-U__PCLMUL__"],
      "xcode_settings": {"OTHER_CFLAGS": ["-U__ARM_FEATURE_CRC32", "-U__ARM_FEATURE_CRYPTO",
                                          "-U__ARM_FEATURE_SHA2", "-U__AES__", "-U__SHA__",
                                          "-U__SSSE3__", "-U__SSE4_1__", "-U__SSE4_2__",
                                          "-U__AVX__", "-U__AVX2__", "-U__PCLMUL__"]},
      "sources": [
        # <(z7)/C/7zCrc.c and <(z7)/C/SwapBytes.c are compiled through the
        # thin wrappers stubs/crc32.c and stubs/swapBytesScalar.c, which disable
        # those files' self-selected hardware paths before including them
        # verbatim. Both wrappers explain why in their header comments.
        "<(z7)/C/7zCrcOpt.c",
        "<(z7)/C/Alloc.c", "<(z7)/C/Bcj2.c",
        "<(z7)/C/Bra.c", "<(z7)/C/Bra86.c", "<(z7)/C/BraIA64.c", "<(z7)/C/CpuArch.c",
        "<(z7)/C/Delta.c", "<(z7)/C/LzmaDec.c", "<(z7)/C/Lzma2Dec.c",
        # Lzma2Decoder.cpp calls Lzma2DecMt_Create/Decode/Destroy unconditionally --
        # they are the ST wrappers around Lzma2Dec when Z7_ST is defined. Without
        # this file the addon still links (node addons resolve undefined symbols
        # dynamically) but jumps to a null pointer the first time an LZMA2 entry
        # is extracted.
        "<(z7)/C/Lzma2DecMt.c",
        "<(z7)/C/Ppmd7.c",
        "<(z7)/C/Ppmd7Dec.c",
        # Ppmd8 is the ZIP flavor of PPMd (7z uses Ppmd7). Compress/PpmdZip.cpp's
        # CDecoder, which ZipHandler.cpp instantiates for compression method 98,
        # is built on it. Ppmd8Enc.c is deliberately absent, replaced by
        # stubs/ppmd8Enc.c -- see the comment on PpmdZip.cpp below.
        "<(z7)/C/Ppmd8.c", "<(z7)/C/Ppmd8Dec.c",
        "stubs/ppmd8Enc.c",
        "<(z7)/C/Sort.c", "<(z7)/C/Threads.c",
        "<(z7)/C/Xz.c", "<(z7)/C/XzDec.c", "<(z7)/C/XzCrc64.c",
        # XzCrc64.c dispatches to XzCrc64UpdateT12, which is name-pasted into
        # existence by XzCrc64Opt.c (Z7_CRC64_NUM_TABLES_USE == 12). Unlike
        # 7zCrcOpt.c's siblings this file is plain table-driven C with no
        # hardware path, so it needs no wrapper. .xz streams whose check type is
        # CRC64 -- the default xz check -- reach it.
        "<(z7)/C/XzCrc64Opt.c",
        # Xxh64.c is zstd's frame checksum (ZstdDec.c calls Xxh64State_Init and
        # friends unconditionally). Plain C: its only conditional code path is an
        # MSVC-x86-only inline-asm block, so it needs no wrapper either.
        "<(z7)/C/Xxh64.c",
        "<(z7)/C/ZstdDec.c",
        "stubs/crc32.c",
        # <(z7)/C/Sha256.c is compiled through stubs/sha256Scalar.c for the same
        # reason as the two wrappers above: it self-selects a __target__("sha2")
        # implementation from C/Sha256Opt.c. Xz.c/XzDec.c call Sha256_Init/Update/
        # Final for .xz streams whose check type is SHA-256.
        "stubs/sha256Scalar.c",
        "stubs/swapBytesScalar.c",
        "<(z7)/CPP/Common/MyString.cpp", "<(z7)/CPP/Common/MyVector.cpp",
        "<(z7)/CPP/Common/MyWindows.cpp", "<(z7)/CPP/Common/NewHandler.cpp",
        "<(z7)/CPP/Common/IntToString.cpp", "<(z7)/CPP/Common/StringConvert.cpp",
        "<(z7)/CPP/Common/UTFConvert.cpp",
        "<(z7)/CPP/Common/StringToInt.cpp",
        "<(z7)/CPP/Common/Wildcard.cpp",
        "<(z7)/CPP/Windows/FileIO.cpp", "<(z7)/CPP/Windows/FileFind.cpp",
        "<(z7)/CPP/Windows/FileDir.cpp", "<(z7)/CPP/Windows/FileName.cpp",
        "<(z7)/CPP/Windows/PropVariant.cpp", "<(z7)/CPP/Windows/PropVariantUtils.cpp",
        "<(z7)/CPP/Windows/TimeUtils.cpp",
        "<(z7)/CPP/Windows/System.cpp",
        "<(z7)/CPP/7zip/Common/CreateCoder.cpp", "<(z7)/CPP/7zip/Common/FileStreams.cpp",
        "<(z7)/CPP/7zip/Common/FilterCoder.cpp", "<(z7)/CPP/7zip/Common/InBuffer.cpp",
        "<(z7)/CPP/7zip/Common/OutBuffer.cpp", "<(z7)/CPP/7zip/Common/LimitedStreams.cpp",
        "<(z7)/CPP/7zip/Common/MethodProps.cpp", "<(z7)/CPP/7zip/Common/ProgressUtils.cpp",
        "<(z7)/CPP/7zip/Common/PropId.cpp", "<(z7)/CPP/7zip/Common/StreamObjects.cpp",
        "<(z7)/CPP/7zip/Common/StreamUtils.cpp", "<(z7)/CPP/7zip/Common/CWrappers.cpp",
        "stubs/archiveExports.cpp",
        "<(z7)/CPP/7zip/Archive/Common/CoderMixer2.cpp",
        "<(z7)/CPP/7zip/Archive/Common/DummyOutStream.cpp",
        "<(z7)/CPP/7zip/Archive/Common/FindSignature.cpp",
        "<(z7)/CPP/7zip/Archive/Common/ItemNameUtils.cpp",
        "<(z7)/CPP/7zip/Archive/Common/MultiStream.cpp",
        "<(z7)/CPP/7zip/Archive/Common/OutStreamWithCRC.cpp",
        "<(z7)/CPP/7zip/Archive/7z/7zIn.cpp", "<(z7)/CPP/7zip/Archive/7z/7zDecode.cpp",
        "<(z7)/CPP/7zip/Archive/7z/7zExtract.cpp", "<(z7)/CPP/7zip/Archive/7z/7zHandler.cpp",
        "<(z7)/CPP/7zip/Archive/7z/7zProperties.cpp", "<(z7)/CPP/7zip/Archive/7z/7zHeader.cpp",
        "<(z7)/CPP/7zip/Archive/7z/7zSpecStream.cpp",
        "<(z7)/CPP/7zip/Archive/Zip/ZipIn.cpp", "<(z7)/CPP/7zip/Archive/Zip/ZipItem.cpp",
        "<(z7)/CPP/7zip/Archive/Zip/ZipHandler.cpp",
        "<(z7)/CPP/7zip/Compress/CopyCoder.cpp", "<(z7)/CPP/7zip/Compress/LzmaDecoder.cpp",
        "<(z7)/CPP/7zip/Compress/Lzma2Decoder.cpp", "<(z7)/CPP/7zip/Compress/PpmdDecoder.cpp",
        # PpmdZip.cpp holds both NPpmdZip::CDecoder (ZIP compression method 98, a
        # legitimate decode path -- ZipHandler.cpp:1168) and NPpmdZip::CEncoder,
        # with no Z7_EXTRACT_ONLY guard between them. The encoder comes along as
        # dead code: nothing references its vtable, and C/Ppmd8Enc.c is left
        # unlinked on purpose, its two entry points supplied instead by
        # stubs/ppmd8Enc.c. That stub is what makes the arrangement portable --
        # leaving the symbols undefined works only on macOS, where -dead_strip
        # removes the encoder; on Linux it links to a null call site, and on
        # Windows it is an outright LNK2019. The trade-off is that the link no
        # longer catches reachability: the stub satisfies the symbols on every
        # platform, so nothing mechanical fails if a future change makes the
        # encoder reachable -- see the note in stubs/ppmd8Enc.c. Do not add
        # Ppmd8Enc.c to satisfy them.
        "<(z7)/CPP/7zip/Compress/PpmdZip.cpp",
        "<(z7)/CPP/7zip/Compress/BZip2Decoder.cpp", "<(z7)/CPP/7zip/Compress/BZip2Crc.cpp",
        "<(z7)/CPP/7zip/Compress/DeflateDecoder.cpp", "<(z7)/CPP/7zip/Compress/BitlDecoder.cpp",
        "<(z7)/CPP/7zip/Compress/ZDecoder.cpp", "<(z7)/CPP/7zip/Compress/ShrinkDecoder.cpp",
        "<(z7)/CPP/7zip/Compress/ImplodeDecoder.cpp", "<(z7)/CPP/7zip/Compress/LzOutWindow.cpp",
        "<(z7)/CPP/7zip/Compress/Bcj2Coder.cpp", "<(z7)/CPP/7zip/Compress/BcjCoder.cpp",
        "<(z7)/CPP/7zip/Compress/BranchMisc.cpp",
        "<(z7)/CPP/7zip/Compress/XzDecoder.cpp",
        "<(z7)/CPP/7zip/Compress/ZstdDecoder.cpp"
      ]
    },
    {
      "target_name": "guiddefs",
      "type": "static_library",
      "defines": ["Z7_ST", "Z7_NO_CRYPTO", "Z7_EXTRACT_ONLY", "k_SwapBytes_Mode_MAX=0", "INITGUID"],
      "include_dirs": ["stubs", "<(z7)/C", "<(z7)/CPP", "<(z7)/CPP/myWindows", "<(z7)/CPP/include_windows"],
      "sources": ["stubs/guidDefs.cpp"]
    },
    {
      "target_name": "binding",
      "dependencies": ["sevenzip", "guiddefs"],
      "sources": [
        "binding.cpp",
        "src/chunkQueue.cpp",
        "src/entryReader.cpp",
        "src/errors.cpp",
        "src/lister.cpp",
        "src/pump.cpp",
        "src/sevenZip.cpp",
        # XzCrc64Init.cpp is nothing but a file-scope object whose constructor calls
        # Crc64GenerateTable(). It exports no symbol, so in the "sevenzip" static
        # library the linker never had a reason to pull the member in and the CRC64
        # table stayed all zeros -- .xz streams whose check is CRC64 (xz's own
        # default) decoded correctly and then failed the integrity check. It belongs
        # on "binding" for the same reason the *Register.cpp units below do: only a
        # directly compiled translation unit is guaranteed to contribute its static
        # initializer.
        "<(z7)/CPP/Common/XzCrc64Init.cpp",
        "<(z7)/CPP/7zip/Archive/7z/7zRegister.cpp",
        "<(z7)/CPP/7zip/Archive/Zip/ZipRegister.cpp",
        "stubs/zipCrypto.cpp",
        "stubs/wzAes.cpp",
        "stubs/zipStrong.cpp",
        "stubs/myAes.cpp",
        "stubs/zipUpdate.cpp",
        "stubs/bzip2Encoder.cpp",
        "<(z7)/CPP/7zip/Archive/ZHandler.cpp",
        "<(z7)/CPP/7zip/Archive/SplitHandler.cpp",
        "<(z7)/CPP/7zip/Archive/Bz2Handler.cpp",
        # LzmaHandler.cpp registers both "lzma" and "lzma86" -- this is why
        # formats() returns a seventh name the brief's test list does not
        # enumerate; not scope creep.
        "<(z7)/CPP/7zip/Archive/LzmaHandler.cpp",
        "<(z7)/CPP/7zip/Compress/CopyRegister.cpp",
        "<(z7)/CPP/7zip/Compress/LzmaRegister.cpp",
        "<(z7)/CPP/7zip/Compress/Lzma2Register.cpp",
        "<(z7)/CPP/7zip/Compress/PpmdRegister.cpp",
        "<(z7)/CPP/7zip/Compress/BZip2Register.cpp",
        "<(z7)/CPP/7zip/Compress/DeflateRegister.cpp",
        "<(z7)/CPP/7zip/Compress/Deflate64Register.cpp",
        "<(z7)/CPP/7zip/Compress/DeltaFilter.cpp",
        "<(z7)/CPP/7zip/Compress/BcjRegister.cpp",
        "<(z7)/CPP/7zip/Compress/Bcj2Register.cpp",
        "<(z7)/CPP/7zip/Compress/BranchRegister.cpp",
        "<(z7)/CPP/7zip/Compress/ByteSwap.cpp"
      ],
      "include_dirs": [
        "<!(node --print \"require('node-addon-api').include_dir\")",
        "stubs", "<(z7)/C", "<(z7)/CPP", "<(z7)/CPP/myWindows", "<(z7)/CPP/include_windows"
      ],
      "defines": [
        "NAPI_VERSION=<(napi_build_version)",
        "NODE_ADDON_API_DISABLE_DEPRECATED",
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "Z7_ST", "Z7_NO_CRYPTO", "Z7_EXTRACT_ONLY", "k_SwapBytes_Mode_MAX=0"
      ],
      "cflags": ["-U__ARM_FEATURE_CRC32", "-U__ARM_FEATURE_CRYPTO", "-U__ARM_FEATURE_SHA2",
                 "-U__AES__", "-U__SHA__", "-U__SSSE3__", "-U__SSE4_1__", "-U__SSE4_2__",
                 "-U__AVX__", "-U__AVX2__", "-U__PCLMUL__"],
      "xcode_settings": {
        "OTHER_CFLAGS": ["-U__ARM_FEATURE_CRC32", "-U__ARM_FEATURE_CRYPTO",
                          "-U__ARM_FEATURE_SHA2", "-U__AES__", "-U__SHA__",
                          "-U__SSSE3__", "-U__SSE4_1__", "-U__SSE4_2__",
                          "-U__AVX__", "-U__AVX2__", "-U__PCLMUL__"]
      }
    }
  ]
}
