{
  "variables": {"z7": "deps/7-Zip-zstd"},

  "target_defaults": {
    "defines": ["DYNAMIC_BMI2=0"],
    "cflags_cc!": [
      # Override Node.js' common.gypi
      "-std=gnu++17",
      # 7zip uses C++ exceptions and RTTI
      "-fno-exceptions", "-fno-rtti"
    ],
    "cflags_cc": [
      "-std=c++20",
      # 7zip uses C++ exceptions and RTTI
      "-fexceptions", "-frtti",
      # Stubs
      "-include", "handlerOut.h"
    ],

    # Build optimizations
    "cflags": [
      "-ffunction-sections", "-fdata-sections",
      "-fvisibility=hidden",
      "-fno-semantic-interposition"
    ],
    "cflags!": ["-fno-omit-frame-pointer"],
    "cflags_cc+": ["-fvisibility-inlines-hidden"],
    "ldflags": ["-Wl,--gc-sections", "-Wl,--exclude-libs,ALL"],

    "xcode_settings": {
      "CLANG_CXX_LANGUAGE_STANDARD": "c++20",
      "OTHER_CPLUSPLUSFLAGS": [
        "-std=c++20",
        # 7zip uses C++ exceptions and RTTI
        "-fexceptions", "-frtti",
        # Stubs
        "-include", "handlerOut.h"
      ],
      # Build optimizations
      "LLVM_LTO": "YES",
      "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
      "GCC_INLINES_ARE_PRIVATE_EXTERN": "YES",
      "GCC_GENERATE_DEBUGGING_SYMBOLS": "NO",
      "DEAD_CODE_STRIPPING": "YES",
      "OTHER_CFLAGS": ["-ffunction-sections", "-fdata-sections"],
      "GCC_OPTIMIZATION_LEVEL": "3"
    },

    "msvs_settings": {
      "VCCLCompilerTool": {
        "ExceptionHandling": 1,
        "RuntimeTypeInfo": "true",
        "EnableFunctionLevelLinking": "true",
        "WholeProgramOptimization": "true",
        "AdditionalOptions": ["/std:c++20", "/EHsc", "/FIhandlerOut.h"]
      },
      "VCLibrarianTool": {
        "AdditionalOptions": ["/LTCG"]
      },
      "VCLinkerTool": {
        # Build optimizations
        "OptimizeReferences": 2,
        "EnableCOMDATFolding": 2,
        "LinkTimeCodeGeneration": "1",
        "AdditionalOptions": ["/Brepro", "/DEBUG:NONE"],
        "AdditionalOptions/": [["exclude", "lldltojobs"]]
      }
    },

    # Pin instruction sets for various architectures
    "conditions": [
      ["OS=='win'", {
        "defines": ["NOMINMAX"]
      }],
      ["OS=='linux'", {
        "cflags": ["-flto=auto"],
        "ldflags": ["-flto=auto"]
      }],
      ["OS=='mac'", {
        "cflags": ["-flto"],
        "ldflags": ["-flto"]
      }],
      ["target_arch=='x64' or target_arch=='ia32'", {
        "defines": ["XXH_VECTOR=1"], # SSE2, never auto-select AVX variants
        "cflags": ["-mno-sse3", "-mno-ssse3", "-mno-sse4.1", "-mno-sse4.2",
                   "-mno-avx", "-mno-avx2", "-mno-avx512f"],
        "xcode_settings": {
          "OTHER_CFLAGS": ["-mno-sse3", "-mno-ssse3", "-mno-sse4.1", "-mno-sse4.2",
                           "-mno-avx", "-mno-avx2", "-mno-avx512f"],
          "OTHER_CPLUSPLUSFLAGS": ["-mno-sse3", "-mno-ssse3", "-mno-sse4.1", "-mno-sse4.2",
                                  "-mno-avx", "-mno-avx2", "-mno-avx512f"]
        }
      }],
      ["target_arch=='x64'", {
        "cflags": ["-march=x86-64"],
        "xcode_settings": {
          "OTHER_CFLAGS": ["-march=x86-64"],
          "OTHER_CPLUSPLUSFLAGS": ["-march=x86-64"]
        }
      }],
      ["target_arch=='ia32'", {
        "cflags": ["-march=i686", "-msse2", "-mfpmath=sse"],
        "xcode_settings": {
          "OTHER_CFLAGS": ["-march=i686", "-msse2", "-mfpmath=sse"],
          "OTHER_CPLUSPLUSFLAGS": ["-march=i686", "-msse2", "-mfpmath=sse"]
        }
      }],
      ["target_arch=='arm64'", {
        "defines": ["XXH_VECTOR=4"], # Baseline NEON, never SVE
        "cflags": ["-mcpu=generic", "-march=armv8-a"],
        "xcode_settings": {
          "OTHER_CFLAGS": ["-mcpu=generic", "-march=armv8-a"],
          "OTHER_CPLUSPLUSFLAGS": ["-mcpu=generic", "-march=armv8-a"]
        }
      }],
      ["target_arch=='arm'", {
        "defines": ["XXH_VECTOR=0"],
        "cflags": ["-march=armv7-a+fp"],
        "xcode_settings": {
          "OTHER_CFLAGS": ["-march=armv7-a+fp"],
          "OTHER_CPLUSPLUSFLAGS": ["-march=armv7-a+fp"]
        }
      }]
    ]
  },

  "targets": [
    {
      "target_name": "sevenzip",
      "type": "static_library",
      # Avoid optimizer-sensitive behavior observed in the legacy LZ5/Lizard
      # frame decoders in Windows builds produced from Node 26 headers. Keep
      # ordinary /Ox optimization, but compile the vendored archive library as
      # normal native objects. The addon bridge below remains eligible for /GL
      # and /LTCG.
      "msvs_settings": {
        "VCCLCompilerTool": {
          "WholeProgramOptimization": "false"
        },
        "VCLibrarianTool": {
          "AdditionalOptions!": ["/LTCG"]
        }
      },
      "conditions": [
        ["OS=='win'", {
          "sources": ["<(z7)/C/zstdmt/zstd-mt_threading.c"]
        }],
        # ARM Apple Clang uses the reverse-bits instruction, not the table.
        ["OS=='mac' and target_arch=='arm64'", {
          "sources!": ["<(z7)/CPP/7zip/Compress/BitlDecoder.cpp"]
        }]
      ],
      "defines": ["Z7_ST", "Z7_NO_CRYPTO", "Z7_EXTRACT_ONLY", "k_SwapBytes_Mode_MAX=0",
                  "Z7_ZIP_LZFSE_DISABLE", "ZSTD_DISABLE_ASM"],
      "include_dirs": [
        "stubs",
        "<(z7)/C",
        "<(z7)/C/brotli",
        "<(z7)/C/lz4",
        "<(z7)/C/lz5",
        "<(z7)/C/lizard",
        "<(z7)/CPP",
        "<(z7)/CPP/myWindows",
        "<(z7)/CPP/include_windows"
      ],
      "cflags": ["-U__ARM_FEATURE_CRC32", "-U__ARM_FEATURE_CRYPTO", "-U__ARM_FEATURE_SHA2",
                 "-U__AES__", "-U__SHA__", "-U__SSSE3__", "-U__SSE4_1__", "-U__SSE4_2__",
                 "-U__AVX__", "-U__AVX2__", "-U__PCLMUL__"],
      "xcode_settings": {"OTHER_CFLAGS": ["-U__ARM_FEATURE_CRC32", "-U__ARM_FEATURE_CRYPTO",
                                          "-U__ARM_FEATURE_SHA2", "-U__AES__", "-U__SHA__",
                                          "-U__SSSE3__", "-U__SSE4_1__", "-U__SSE4_2__",
                                          "-U__AVX__", "-U__AVX2__", "-U__PCLMUL__"]},
      "sources": [
        "<(z7)/C/7zCrcOpt.c",
        "<(z7)/C/Alloc.c",
        "<(z7)/C/brotli/br_bit_reader.c",
        "<(z7)/C/brotli/br_constants.c",
        "<(z7)/C/brotli/br_context.c",
        "<(z7)/C/brotli/br_decode.c",
        "<(z7)/C/brotli/br_dictionary.c",
        "<(z7)/C/brotli/br_huffman.c",
        "<(z7)/C/brotli/br_platform.c",
        "<(z7)/C/brotli/br_prefix.c",
        "<(z7)/C/brotli/br_shared_dictionary.c",
        "<(z7)/C/brotli/br_state.c",
        "<(z7)/C/brotli/br_static_init_dec.c",
        "<(z7)/C/brotli/br_transform.c",
        "<(z7)/C/lizard/liz_entropy_common.c",
        "<(z7)/C/lizard/liz_fse_compress.c",
        "<(z7)/C/lizard/liz_fse_decompress.c",
        "<(z7)/C/lizard/liz_huf_compress.c",
        "<(z7)/C/lizard/liz_huf_decompress.c",
        "<(z7)/C/lizard/lizard_compress.c",
        "<(z7)/C/lizard/lizard_decompress.c",
        "<(z7)/C/lizard/lizard_frame.c",
        "<(z7)/C/lz4/lz4.c",
        "<(z7)/C/lz4/lz4frame.c",
        "<(z7)/C/lz4/lz4hc.c",
        "<(z7)/C/lz5/lz5.c",
        "<(z7)/C/lz5/lz5frame.c",
        "<(z7)/C/lz5/lz5hc.c",
        "<(z7)/C/zstdmt/brotli-mt_common.c",
        "<(z7)/C/zstdmt/brotli-mt_decompress.c",
        "<(z7)/C/zstdmt/lz4-mt_common.c",
        "<(z7)/C/zstdmt/lz4-mt_decompress.c",
        "<(z7)/C/zstdmt/lz5-mt_common.c",
        "<(z7)/C/zstdmt/lz5-mt_decompress.c",
        "<(z7)/C/zstdmt/lizard-mt_common.c",
        "<(z7)/C/zstdmt/lizard-mt_decompress.c",
        "<(z7)/C/Bcj2.c",
        "<(z7)/C/Bra.c",
        "<(z7)/C/Bra86.c",
        "<(z7)/C/CpuArch.c",
        "<(z7)/C/Delta.c",
        "<(z7)/C/hashes/xxhash.c",
        "<(z7)/C/Lzma2Dec.c",
        "<(z7)/C/Lzma2DecMt.c",
        "<(z7)/C/LzmaDec.c",
        "<(z7)/C/Ppmd7.c",
        "<(z7)/C/Ppmd7Dec.c",
        "<(z7)/C/Ppmd8.c",
        "<(z7)/C/Ppmd8Dec.c",
        "<(z7)/C/Sort.c",
        "<(z7)/C/Threads.c",
        "<(z7)/C/Xxh64.c",
        "<(z7)/C/Xz.c",
        "<(z7)/C/XzCrc64.c",
        "<(z7)/C/XzCrc64Opt.c",
        "<(z7)/C/XzDec.c",
        "<(z7)/C/zstd/debug.c",
        "<(z7)/C/zstd/entropy_common.c",
        "<(z7)/C/zstd/error_private.c",
        "<(z7)/C/zstd/fse_decompress.c",
        "<(z7)/C/zstd/huf_decompress.c",
        "<(z7)/C/zstd/hist.c",
        "<(z7)/C/zstd/zstd_common.c",
        "<(z7)/C/zstd/zstd_ddict.c",
        "<(z7)/C/zstd/zstd_decompress.c",
        "<(z7)/C/zstd/zstd_decompress_block.c",
        "<(z7)/CPP/7zip/Archive/7z/7zDecode.cpp",
        "<(z7)/CPP/7zip/Archive/7z/7zExtract.cpp",
        "<(z7)/CPP/7zip/Archive/7z/7zHandler.cpp",
        "<(z7)/CPP/7zip/Archive/7z/7zHeader.cpp",
        "<(z7)/CPP/7zip/Archive/7z/7zIn.cpp",
        "<(z7)/CPP/7zip/Archive/7z/7zProperties.cpp",
        "<(z7)/CPP/7zip/Archive/Common/CoderMixer2.cpp",
        "<(z7)/CPP/7zip/Archive/Common/DummyOutStream.cpp",
        "<(z7)/CPP/7zip/Archive/Common/FindSignature.cpp",
        "<(z7)/CPP/7zip/Archive/Common/ItemNameUtils.cpp",
        "<(z7)/CPP/7zip/Archive/Common/MultiStream.cpp",
        "<(z7)/CPP/7zip/Archive/Common/OutStreamWithCRC.cpp",
        "<(z7)/CPP/7zip/Archive/Zip/ZipHandler.cpp",
        "<(z7)/CPP/7zip/Archive/Zip/ZipIn.cpp",
        "<(z7)/CPP/7zip/Archive/Zip/ZipItem.cpp",
        "<(z7)/CPP/7zip/Common/CWrappers.cpp",
        "<(z7)/CPP/7zip/Common/CreateCoder.cpp",
        "<(z7)/CPP/7zip/Common/FileStreams.cpp",
        "<(z7)/CPP/7zip/Common/FilterCoder.cpp",
        "<(z7)/CPP/7zip/Common/InBuffer.cpp",
        "<(z7)/CPP/7zip/Common/LimitedStreams.cpp",
        "<(z7)/CPP/7zip/Common/MethodProps.cpp",
        "<(z7)/CPP/7zip/Common/OutBuffer.cpp",
        "<(z7)/CPP/7zip/Common/ProgressUtils.cpp",
        "<(z7)/CPP/7zip/Common/PropId.cpp",
        "<(z7)/CPP/7zip/Common/StreamObjects.cpp",
        "<(z7)/CPP/7zip/Common/StreamUtils.cpp",
        "<(z7)/CPP/7zip/Compress/BZip2Crc.cpp",
        "<(z7)/CPP/7zip/Compress/BZip2Decoder.cpp",
        "<(z7)/CPP/7zip/Compress/BrotliDecoder.cpp",
        "<(z7)/CPP/7zip/Compress/Lz4Decoder.cpp",
        "stubs/Lz5Decoder.cpp",
        "stubs/LizardDecoder.cpp",
        "<(z7)/CPP/7zip/Compress/Bcj2Coder.cpp",
        "<(z7)/CPP/7zip/Compress/BcjCoder.cpp",
        "<(z7)/CPP/7zip/Compress/BitlDecoder.cpp",
        "<(z7)/CPP/7zip/Compress/BranchMisc.cpp",
        "<(z7)/CPP/7zip/Compress/CopyCoder.cpp",
        "<(z7)/CPP/7zip/Compress/DeflateDecoder.cpp",
        "<(z7)/CPP/7zip/Compress/ImplodeDecoder.cpp",
        "<(z7)/CPP/7zip/Compress/LzOutWindow.cpp",
        "<(z7)/CPP/7zip/Compress/Lzma2Decoder.cpp",
        "<(z7)/CPP/7zip/Compress/LzmaDecoder.cpp",
        "<(z7)/CPP/7zip/Compress/PpmdDecoder.cpp",
        "<(z7)/CPP/7zip/Compress/PpmdZip.cpp",
        "<(z7)/CPP/7zip/Compress/ShrinkDecoder.cpp",
        "<(z7)/CPP/7zip/Compress/XzDecoder.cpp",
        "<(z7)/CPP/7zip/Compress/ZDecoder.cpp",
        "<(z7)/CPP/7zip/Compress/ZstdDecoder.cpp",
        "<(z7)/CPP/Common/IntToString.cpp",
        "<(z7)/CPP/Common/MyString.cpp",
        "<(z7)/CPP/Common/MyWindows.cpp",
        "<(z7)/CPP/Common/StringConvert.cpp",
        "<(z7)/CPP/Common/StringToInt.cpp",
        "<(z7)/CPP/Common/UTFConvert.cpp",
        "<(z7)/CPP/Common/Wildcard.cpp",
        "<(z7)/CPP/Windows/FileDir.cpp",
        "<(z7)/CPP/Windows/FileFind.cpp",
        "<(z7)/CPP/Windows/FileIO.cpp",
        "<(z7)/CPP/Windows/FileName.cpp",
        "<(z7)/CPP/Windows/PropVariant.cpp",
        "<(z7)/CPP/Windows/PropVariantUtils.cpp",
        "<(z7)/CPP/Windows/System.cpp",
        "<(z7)/CPP/Windows/TimeUtils.cpp",
        "stubs/archiveExports.cpp",
        "stubs/crc32.c",
        "stubs/ppmd8Enc.c",
        "stubs/sha256Scalar.c",
        "stubs/swapBytesScalar.c"
      ]
    },
    {
      "target_name": "guiddefs",
      "type": "static_library",
      # INITGUID makes every forced-included 7-Zip interface header emit IID
      # storage. Keep node-gyp's module-only delay-load hook out of this helper
      # library so it cannot emit a duplicate copy of every IID.
      "win_delay_load_hook": "false",
      "defines": ["Z7_ST", "Z7_NO_CRYPTO", "Z7_EXTRACT_ONLY", "k_SwapBytes_Mode_MAX=0", "INITGUID"],
      "include_dirs": [
        "stubs",
        "<(z7)/C",
        "<(z7)/CPP",
        "<(z7)/CPP/myWindows",
        "<(z7)/CPP/include_windows"
      ],
      "sources": ["stubs/guidDefs.cpp"]
    },
    {
      "target_name": "binding",
      "dependencies": ["sevenzip", "guiddefs"],
      "sources": [
        "<(z7)/CPP/7zip/Archive/7z/7zRegister.cpp",
        "<(z7)/CPP/7zip/Archive/Bz2Handler.cpp",
        "<(z7)/CPP/7zip/Archive/LzmaHandler.cpp",
        "<(z7)/CPP/7zip/Archive/SplitHandler.cpp",
        "<(z7)/CPP/7zip/Archive/ZHandler.cpp",
        "<(z7)/CPP/7zip/Archive/Zip/ZipRegister.cpp",
        "<(z7)/CPP/7zip/Compress/BZip2Register.cpp",
        "stubs/BrotliRegister.cpp",
        "stubs/Lz4Register.cpp",
        "stubs/Lz5Register.cpp",
        "stubs/LizardRegister.cpp",
        "<(z7)/CPP/7zip/Compress/Bcj2Register.cpp",
        "<(z7)/CPP/7zip/Compress/BcjRegister.cpp",
        "<(z7)/CPP/7zip/Compress/BranchRegister.cpp",
        "<(z7)/CPP/7zip/Compress/ByteSwap.cpp",
        "<(z7)/CPP/7zip/Compress/CopyRegister.cpp",
        "<(z7)/CPP/7zip/Compress/Deflate64Register.cpp",
        "<(z7)/CPP/7zip/Compress/DeflateRegister.cpp",
        "<(z7)/CPP/7zip/Compress/DeltaFilter.cpp",
        "<(z7)/CPP/7zip/Compress/Lzma2Register.cpp",
        "<(z7)/CPP/7zip/Compress/LzmaRegister.cpp",
        "<(z7)/CPP/7zip/Compress/PpmdRegister.cpp",
        "<(z7)/CPP/7zip/Compress/ZstdRegister.cpp",
        "<(z7)/CPP/Common/XzCrc64Init.cpp",
        "binding.cpp",
        "src/addon.cpp",
        "src/chunkQueue.cpp",
        "src/codecError.cpp",
        "src/entryReader.cpp",
        "src/errors.cpp",
        "src/jobRegistry.cpp",
        "src/lister.cpp",
        "src/pump.cpp",
        "src/sevenZip.cpp",
        "src/asyncSignal.cpp",
        "stubs/bzip2Encoder.cpp",
        "stubs/myAes.cpp",
        "stubs/wzAes.cpp",
        "stubs/zipCrypto.cpp",
        "stubs/zipStrong.cpp",
        "stubs/zipUpdate.cpp"
      ],
      "include_dirs": [
        "<!(node --print \"require('node-addon-api').include_dir\")",
        "stubs",
        "<(z7)/C",
        "<(z7)/CPP",
        "<(z7)/CPP/myWindows",
        "<(z7)/CPP/include_windows"
      ],
      "defines": [
        "NAPI_VERSION=<(napi_build_version)",
        "NODE_ADDON_API_DISABLE_DEPRECATED",
        "NAPI_CPP_EXCEPTIONS",
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
