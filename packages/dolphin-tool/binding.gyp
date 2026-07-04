# Dolphin native addon build definition.
#
# Required Dolphin Externals submodules (initialize before building):
#   git -C deps/dolphin submodule update --init --depth 1 -- Externals/zstd
#   git -C deps/dolphin submodule update --init --depth 1 -- Externals/zlib-ng
#   git -C deps/dolphin submodule update --init --depth 1 -- Externals/bzip2
#   git -C deps/dolphin submodule update --init --depth 1 -- Externals/mbedtls
#   git -C deps/dolphin submodule update --init --depth 1 -- Externals/fmt
# (Externals/liblzma is committed directly in the Dolphin tree, not a submodule.)
#
# Global no-SIMD constraint: every bundled compression / crypto library is built
# with its portable scalar backend only (see per-target defines below).
{
  "variables": {
    "dolphin": "deps/dolphin"
  },
  "target_defaults": {
    "conditions": [
      ["OS=='win'", {
        "defines": ["NOMINMAX", "UNICODE", "_UNICODE", "WIN32_LEAN_AND_MEAN"]
      }],

      # Build optimizations
      ["OS=='linux'", {
        "cflags": [
          "-ffunction-sections", "-fdata-sections",
          "-fvisibility=hidden", "-fvisibility-inlines-hidden",
          "-fno-semantic-interposition",
          "-flto"
        ],
        "ldflags": ["-Wl,--gc-sections", "-flto"]
      }]
    ],

    "cflags_cc!": [
      # Override Node.js' common.gypi
      "-std=gnu++17",
      # Dolphin uses C++ exceptions and RTTI
      "-fno-exceptions", "-fno-rtti"
    ],
    "cflags_cc": [
      # Dolphin (tag 2606) requires C++23 (CMAKE_CXX_STANDARD 23; e.g.
      # StringUtil.h uses std::to_underlying). This is the one deliberate
      # departure from chdman's C++20 target_defaults.
      "-std=c++23",
      # Dolphin uses C++ exceptions and RTTI
      "-fexceptions", "-frtti"
    ],
    "xcode_settings": {
      "CLANG_CXX_LANGUAGE_STANDARD": "c++23",
      "OTHER_CPLUSPLUSFLAGS": [
        "-std=c++23",
        # Dolphin uses C++ exceptions and RTTI
        "-fexceptions", "-frtti"
      ],
      # Build optimizations
      "LLVM_LTO": "YES",
      "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
      "GCC_INLINES_ARE_PRIVATE_EXTERN": "YES",
      "GCC_GENERATE_DEBUGGING_SYMBOLS": "NO",
      "DEAD_CODE_STRIPPING": "YES",
      "OTHER_CFLAGS": ["-ffunction-sections", "-fdata-sections"]
    },
    "msvs_settings": {
      "VCCLCompilerTool": {
        "RuntimeLibrary": "0",
        "EnableFunctionLevelLinking": "true",
        "AdditionalOptions": [
          "/std:c++latest",
          # Dolphin uses C++ exceptions and RTTI
          "/EHsc"
        ]
      },
      "VCLinkerTool": {
        # Build optimizations
        "OptimizeReferences": "2",
        "AdditionalOptions": [
          "/Brepro",
          "/deterministic",
          "/DEBUG:NONE"
        ]
      }
    }
  },

  "targets": [
    {
      "target_name": "zstd",
      "type": "static_library",
      # Portability / minimal SIMD: ZSTD_DISABLE_ASM drops the x86-64 .S assembly
      # (also omitted from sources); DYNAMIC_BMI2=0 disables runtime BMI2 dispatch.
      "defines": ["ZSTD_DISABLE_ASM", "DYNAMIC_BMI2=0"],
      "include_dirs": ["<(dolphin)/Externals/zstd/zstd/lib"],
      "sources": [
        "<(dolphin)/Externals/zstd/zstd/lib/common/debug.c",
        "<(dolphin)/Externals/zstd/zstd/lib/common/entropy_common.c",
        "<(dolphin)/Externals/zstd/zstd/lib/common/error_private.c",
        "<(dolphin)/Externals/zstd/zstd/lib/common/fse_decompress.c",
        "<(dolphin)/Externals/zstd/zstd/lib/common/pool.c",
        "<(dolphin)/Externals/zstd/zstd/lib/common/threading.c",
        "<(dolphin)/Externals/zstd/zstd/lib/common/xxhash.c",
        "<(dolphin)/Externals/zstd/zstd/lib/common/zstd_common.c",
        "<(dolphin)/Externals/zstd/zstd/lib/compress/fse_compress.c",
        "<(dolphin)/Externals/zstd/zstd/lib/compress/hist.c",
        "<(dolphin)/Externals/zstd/zstd/lib/compress/huf_compress.c",
        "<(dolphin)/Externals/zstd/zstd/lib/compress/zstd_compress.c",
        "<(dolphin)/Externals/zstd/zstd/lib/compress/zstd_compress_literals.c",
        "<(dolphin)/Externals/zstd/zstd/lib/compress/zstd_compress_sequences.c",
        "<(dolphin)/Externals/zstd/zstd/lib/compress/zstd_compress_superblock.c",
        "<(dolphin)/Externals/zstd/zstd/lib/compress/zstd_double_fast.c",
        "<(dolphin)/Externals/zstd/zstd/lib/compress/zstd_fast.c",
        "<(dolphin)/Externals/zstd/zstd/lib/compress/zstd_lazy.c",
        "<(dolphin)/Externals/zstd/zstd/lib/compress/zstd_ldm.c",
        "<(dolphin)/Externals/zstd/zstd/lib/compress/zstdmt_compress.c",
        "<(dolphin)/Externals/zstd/zstd/lib/compress/zstd_opt.c",
        "<(dolphin)/Externals/zstd/zstd/lib/decompress/huf_decompress.c",
        "<(dolphin)/Externals/zstd/zstd/lib/decompress/zstd_ddict.c",
        "<(dolphin)/Externals/zstd/zstd/lib/decompress/zstd_decompress_block.c",
        "<(dolphin)/Externals/zstd/zstd/lib/decompress/zstd_decompress.c"
      ]
    },

    {
      "target_name": "bzip2",
      "type": "static_library",
      "include_dirs": ["<(dolphin)/Externals/bzip2/bzip2"],
      "sources": [
        "<(dolphin)/Externals/bzip2/bzip2/blocksort.c",
        "<(dolphin)/Externals/bzip2/bzip2/bzlib.c",
        "<(dolphin)/Externals/bzip2/bzip2/compress.c",
        "<(dolphin)/Externals/bzip2/bzip2/crctable.c",
        "<(dolphin)/Externals/bzip2/bzip2/decompress.c",
        "<(dolphin)/Externals/bzip2/bzip2/huffman.c",
        "<(dolphin)/Externals/bzip2/bzip2/randtable.c"
      ]
    },

    {
      "target_name": "lzma",
      "type": "static_library",
      # HAVE_CONFIG_H pulls in Externals/liblzma/config.h, which enables only the
      # DELTA + LZMA1 + LZMA2 coders and scalar checks (no BCJ SIMD filters).
      "defines": ["HAVE_CONFIG_H"],
      "include_dirs": [
        "<(dolphin)/Externals/liblzma",
        "<(dolphin)/Externals/liblzma/api",
        "<(dolphin)/Externals/liblzma/common",
        "<(dolphin)/Externals/liblzma/check",
        "<(dolphin)/Externals/liblzma/lz",
        "<(dolphin)/Externals/liblzma/lzma",
        "<(dolphin)/Externals/liblzma/rangecoder",
        "<(dolphin)/Externals/liblzma/delta",
        "<(dolphin)/Externals/liblzma/simple",
        "<(dolphin)/Externals/liblzma/tuklib"
      ],
      "sources": [
        "<(dolphin)/Externals/liblzma/common/common.c",
        "<(dolphin)/Externals/liblzma/common/filter_common.c",
        "<(dolphin)/Externals/liblzma/common/filter_decoder.c",
        "<(dolphin)/Externals/liblzma/common/filter_encoder.c",
        "<(dolphin)/Externals/liblzma/check/check.c",
        "<(dolphin)/Externals/liblzma/check/crc32_fast.c",
        "<(dolphin)/Externals/liblzma/check/crc32_table.c",
        "<(dolphin)/Externals/liblzma/lz/lz_decoder.c",
        "<(dolphin)/Externals/liblzma/lz/lz_encoder.c",
        "<(dolphin)/Externals/liblzma/lz/lz_encoder_mf.c",
        "<(dolphin)/Externals/liblzma/lzma/lzma_decoder.c",
        "<(dolphin)/Externals/liblzma/lzma/lzma_encoder.c",
        "<(dolphin)/Externals/liblzma/lzma/lzma_encoder_optimum_fast.c",
        "<(dolphin)/Externals/liblzma/lzma/lzma_encoder_optimum_normal.c",
        "<(dolphin)/Externals/liblzma/lzma/lzma_encoder_presets.c",
        "<(dolphin)/Externals/liblzma/lzma/lzma2_decoder.c",
        "<(dolphin)/Externals/liblzma/lzma/lzma2_encoder.c",
        "<(dolphin)/Externals/liblzma/lzma/fastpos_table.c",
        "<(dolphin)/Externals/liblzma/rangecoder/price_table.c",
        "<(dolphin)/Externals/liblzma/delta/delta_common.c",
        "<(dolphin)/Externals/liblzma/delta/delta_decoder.c",
        "<(dolphin)/Externals/liblzma/delta/delta_encoder.c"
      ]
    },

    {
      "target_name": "zlibng",
      "type": "static_library",
      # ZLIB_COMPAT: expose the classic zlib.h API (what CompressedBlob.cpp uses).
      # No arch feature macros are defined, so functable.c dispatches to the
      # portable scalar C implementations only (global no-SIMD constraint).
      "defines": ["ZLIB_COMPAT"],
      # Node ships its own zlib headers (-I .../deps/zlib) ahead of our include
      # dirs, so a plain "#include \"zconf.h\"" from zlib-ng's zbuild.h would
      # resolve to Node's vanilla zconf.h (missing Z_EXPORT/PREFIX). -iquote is
      # searched before any -I path for quoted includes, forcing zlib-ng's own
      # generated headers (in Externals/zlib-ng) to win.
      "include_dirs": [
        "<(dolphin)/Externals/zlib-ng",
        "<(dolphin)/Externals/zlib-ng/zlib-ng"
      ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "OTHER_CFLAGS+": [
              "-iquote../<(dolphin)/Externals/zlib-ng",
              "-iquote../<(dolphin)/Externals/zlib-ng/zlib-ng"
            ]
          }
        }],
        ["OS!='mac' and OS!='win'", {
          "cflags": [
            "-iquote../<(dolphin)/Externals/zlib-ng",
            "-iquote../<(dolphin)/Externals/zlib-ng/zlib-ng"
          ]
        }],
        ["OS=='win'", {
          # MSVC has no -iquote/-I distinction, so the fix above doesn't apply.
          # Explicitly listing these paths under msvs_settings (rather than only
          # relying on the target's "include_dirs" above) makes gyp's msvs
          # generator place them ahead of Node's own bundled zconf.h include
          # path in the generated AdditionalIncludeDirectories, which is what
          # actually controls quoted-include resolution order for cl.exe.
          # Unverified on real Windows CI as of this writing.
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalIncludeDirectories": [
                "<(dolphin)/Externals/zlib-ng",
                "<(dolphin)/Externals/zlib-ng/zlib-ng"
              ]
            }
          }
        }]
      ],
      "sources": [
        "<(dolphin)/Externals/zlib-ng/zlib-ng/adler32.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/adler32_fold.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/chunkset.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/compare256.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/compress.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/cpu_features.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/crc32_braid.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/crc32_braid_comb.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/crc32_fold.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/deflate.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/deflate_fast.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/deflate_huff.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/deflate_medium.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/deflate_quick.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/deflate_rle.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/deflate_slow.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/deflate_stored.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/functable.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/infback.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/inffast.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/inflate.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/inftrees.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/insert_string.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/insert_string_roll.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/slide_hash.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/trees.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/uncompr.c",
        "<(dolphin)/Externals/zlib-ng/zlib-ng/zutil.c"
      ]
    },

    {
      "target_name": "mbedtls",
      "type": "static_library",
      # Custom config selects software AES-CBC + SHA-1 only; MBEDTLS_AESNI_C and
      # MBEDTLS_PADLOCK_C are intentionally left undefined (global no-SIMD).
      # Bare filename (found via the "stubs" include_dir below) rather than an
      # absolute <(module_root_dir) path, since an absolute path here would
      # need to survive being embedded in a compiler /D define even when the
      # checkout path contains spaces.
      "defines": ["MBEDTLS_CONFIG_FILE=\"mbedtls_config.h\""],
      "include_dirs": ["<(dolphin)/Externals/mbedtls/include", "stubs"],
      "sources": [
        "<(dolphin)/Externals/mbedtls/library/aes.c",
        "<(dolphin)/Externals/mbedtls/library/sha1.c",
        "<(dolphin)/Externals/mbedtls/library/platform.c",
        "<(dolphin)/Externals/mbedtls/library/platform_util.c",
        "<(dolphin)/Externals/mbedtls/library/error.c"
      ]
    },

    {
      "target_name": "dolphin-tool",
      "sources": [
        "binding.cpp",
        # Stubs for subsystems referenced but never reached when opening
        # RVZ/GCZ/WIA blobs (see each file's header comment).
        "stubs/directoryBlob.cpp",
        # Real (individually-ported) VolumeWii statics needed for Wii partition
        # hashing/decryption/encryption; see the file's header comment for why
        # these are ported rather than the whole upstream VolumeWii.cpp being linked.
        "stubs/volumeWii.cpp",
        "stubs/logging.cpp",
        # Dolphin DiscIO blob readers
        "<(dolphin)/Source/Core/DiscIO/Blob.cpp",
        "<(dolphin)/Source/Core/DiscIO/CISOBlob.cpp",
        "<(dolphin)/Source/Core/DiscIO/CompressedBlob.cpp",
        "<(dolphin)/Source/Core/DiscIO/FileBlob.cpp",
        "<(dolphin)/Source/Core/DiscIO/NFSBlob.cpp",
        "<(dolphin)/Source/Core/DiscIO/SplitFileBlob.cpp",
        "<(dolphin)/Source/Core/DiscIO/TGCBlob.cpp",
        "<(dolphin)/Source/Core/DiscIO/WbfsBlob.cpp",
        "<(dolphin)/Source/Core/DiscIO/WIABlob.cpp",
        "<(dolphin)/Source/Core/DiscIO/WIACompression.cpp",
        "<(dolphin)/Source/Core/DiscIO/WiiEncryptionCache.cpp",
        "<(dolphin)/Source/Core/DiscIO/LaggedFibonacciGenerator.cpp",
        # Dolphin Common support
        "<(dolphin)/Source/Core/Common/Crypto/AES.cpp",
        "<(dolphin)/Source/Core/Common/Crypto/SHA1.cpp",
        "<(dolphin)/Source/Core/Common/CommonFuncs.cpp",
        "<(dolphin)/Source/Core/Common/DirectIOFile.cpp",
        "<(dolphin)/Source/Core/Common/GenericCPUDetect.cpp",
        "<(dolphin)/Source/Core/Common/Hash.cpp",
        "<(dolphin)/Source/Core/Common/MsgHandler.cpp",
        "<(dolphin)/Source/Core/Common/StringUtil.cpp"
      ],
      "dependencies": ["zstd", "bzip2", "lzma", "zlibng", "mbedtls"],
      # FMT_HEADER_ONLY avoids a separate fmt compilation unit; only fmt::format
      # in error/log helper strings is used.
      "defines": ["FMT_HEADER_ONLY"],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")",
        "<(dolphin)/Source/Core",
        "<(dolphin)/Externals/fmt/fmt/include",
        "<(dolphin)/Externals/zstd/zstd/lib",
        "<(dolphin)/Externals/bzip2/bzip2",
        "<(dolphin)/Externals/liblzma/api",
        "<(dolphin)/Externals/zlib-ng",
        "<(dolphin)/Externals/mbedtls/include"
      ],
      "conditions": [
        ["OS=='linux'", {
          "ldflags": ["-static-libstdc++", "-static-libgcc"]
        }]
      ]
    }
  ]
}
