# Dolphin native addon build definition.
#
# Global no-SIMD constraint: every bundled compression / crypto library is built
# with its portable scalar backend only (see per-target defines below).
#
# Static linking: every bundled dependency below (zstd, bzip2, lzma, zlibng, mbedtls)
# is a "static_library" target, so gyp always links it directly into dolphin-tool's
# .node rather than as a separate shared object. fmt is header-only (FMT_HEADER_ONLY),
# so nothing to link there either. The remaining runtime is handled per-OS: Linux gets
# -static-libstdc++/-static-libgcc and Windows gets /MT (see target_defaults and the
# dolphin-tool target below); macOS's toolchain offers no static libc++ equivalent.
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
      # Override Node.js' common.gypi, which injects -std=gnu++17 (<=24) or
      # -std=gnu++20 (26). Strip both so the appended -std=c++23 is the only
      # standard flag; a surviving gnu++NN is ordered after ours and would win,
      # silently downgrading the build and breaking Dolphin's C++23 usage
      # (e.g. std::to_underlying in StringUtil.h).
      "-std=gnu++17",
      "-std=gnu++20",
      # Dolphin uses C++ exceptions and RTTI
      "-fno-exceptions", "-fno-rtti"
    ],
    "cflags_cc": [
      # Dolphin (tag 2606) requires C++23 (CMAKE_CXX_STANDARD 23; e.g.
      # StringUtil.h uses std::to_underlying).
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
          # The C++ standard is set per-target (see the dolphin-tool target
          # below); the bundled C libraries don't take a C++ standard flag.
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
        # Defines ZSTD_splitBlock, referenced by zstd_compress.c. A Windows DLL
        # must resolve it; Linux/macOS tolerate it as undefined.
        "<(dolphin)/Externals/zstd/zstd/lib/compress/zstd_preSplit.c",
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
      # LZMA_API_STATIC stops lzma.h from marking the API __declspec(dllimport)
      # on Windows (see lzma.h), which would otherwise make consumers reference
      # __imp_lzma_* import stubs that don't exist when linking liblzma statically.
      "defines": ["HAVE_CONFIG_H", "LZMA_API_STATIC"],
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
      # node-gyp compiles win_delay_load_hook.cc (defining __pfnDliNotifyHook2)
      # into every target. It's normally inert inside this .lib, but the
      # /WHOLEARCHIVE:zlibng.lib below force-includes it, colliding with the copy
      # in the final .node (LNK2005 -> LNK1169). The hook is only meaningful in
      # the loadable module, so disable it here. Must be a direct target key: gyp
      # gates the source on a target_conditions var derived from direct keys, so
      # a "variables" entry would be ignored.
      "win_delay_load_hook": "false",
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
          # MSVC has no -iquote, so list these in AdditionalIncludeDirectories,
          # which gyp places ahead of Node's bundled zconf.h/zlib.h so zlib-ng's
          # headers win quoted-include resolution. The leading "../" is required:
          # gyp emits msvs_settings paths verbatim (unlike "include_dirs", which
          # it rewrites to resolve from build/), so without it MSBuild resolves
          # them relative to build/dolphin-tool.vcxproj, they don't exist, and
          # cl.exe falls back to Node's zconf.h -- breaking ZLIB_COMPAT's
          # z_size_t redefinition.
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalIncludeDirectories": [
                "../<(dolphin)/Externals/zlib-ng",
                "../<(dolphin)/Externals/zlib-ng/zlib-ng"
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
      # MBEDTLS_PADLOCK_C are left undefined (global no-SIMD). Bare filename
      # (found via the "stubs" include_dir below) avoids embedding an absolute
      # path in a /D define, which would break when the checkout path has spaces.
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
        "stubs/logging.cpp",
        # Inert definitions for symbols referenced only by the blob readers'
        # write/conversion paths (never reached when reading), one file per
        # upstream translation unit; needed because a Windows DLL must resolve
        # every referenced symbol.
        "stubs/fileUtil.cpp",
        "stubs/discUtils.cpp",
        "stubs/volume.cpp",
        "stubs/formats.cpp",
        # Dolphin DiscIO blob readers
        "<(dolphin)/Source/Core/DiscIO/Blob.cpp",
        "<(dolphin)/Source/Core/DiscIO/CISOBlob.cpp",
        # Compiled through a shim that forces the vendored zlib-ng <zlib.h> (see
        # zlib-ng-compat/CompressedBlob.cpp) instead of Node's bundled copy.
        "zlib-ng-compat/CompressedBlob.cpp",
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
        # Compiled through a shim that forces the vendored zlib-ng <zlib.h> (see
        # zlib-ng-compat/Hash.cpp) instead of Node's bundled copy.
        "zlib-ng-compat/Hash.cpp",
        "<(dolphin)/Source/Core/Common/MsgHandler.cpp",
        "<(dolphin)/Source/Core/Common/StringUtil.cpp"
      ],
      "dependencies": ["zstd", "bzip2", "lzma", "zlibng", "mbedtls"],
      # FMT_HEADER_ONLY avoids a separate fmt compilation unit; only fmt::format
      # in error/log helper strings is used.
      # LZMA_API_STATIC: WIACompression.cpp includes lzma.h; without it the API is
      # __declspec(dllimport) on Windows and references nonexistent __imp_lzma_*
      # import stubs (see the lzma target above).
      "defines": ["FMT_HEADER_ONLY", "LZMA_API_STATIC"],
      # MSVC settings for Dolphin's C++ and the header-only fmt. Scoped here
      # because only this target is C++; the bundled C libraries don't take them.
      #
      # Dolphin targets C++23, but MSVC has no stable /std:c++23, so request
      # /std:c++23preview (enables _HAS_CXX23, needed for StringUtil.h's
      # std::to_underlying). node-gyp's common.gypi appends /std:c++20 after
      # AdditionalOptions and would win, so LanguageStandard is forced to
      # "Default" (emits no /std of its own).
      #   /utf-8            satisfies fmt/base.h's Unicode /utf-8 static_assert.
      #   /Zc:preprocessor  conforming preprocessor for __VA_OPT__ (fmt, ChunkFile/SHA1).
      #   /Zc:__cplusplus   report the real __cplusplus for C++23 feature detection.
      "msvs_settings": {
        "VCCLCompilerTool": {
          "LanguageStandard": "Default",
          "AdditionalOptions": [
            "/std:c++23preview",
            "/utf-8",
            "/Zc:preprocessor",
            "/Zc:__cplusplus"
          ]
        }
      },
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
        # zlib-ng is a static_library dependency, but its inflate/adler32 symbols
        # collide with the zlib that Node exports from the host executable. The
        # linker leaves the calls to resolve against the host (dynamic lookup on
        # macOS, node.exe import on Windows) instead of pulling them from
        # zlibng.a/.lib, so a Bun-compiled Windows binary faults (0xC06D007F) and
        # even macOS/Linux silently use the host's zlib rather than the vendored
        # copy. Force the whole zlib-ng archive into the link so its definitions win.
        ["OS=='mac'", {
          "xcode_settings": {
            "OTHER_LDFLAGS": ["-Wl,-force_load,<(PRODUCT_DIR)/zlibng.a"]
          }
        }],
        # Static linking
        ["OS=='linux'", {
          "ldflags": [
            "-static-libstdc++", "-static-libgcc",
            "-Wl,--whole-archive", "<(PRODUCT_DIR)/zlibng.a", "-Wl,--no-whole-archive"
          ]
        }],
        ["OS=='win'", {
          "msvs_settings": {
            "VCLinkerTool": {
              "AdditionalOptions": ["/WHOLEARCHIVE:zlibng.lib"]
            }
          }
        }]
      ]
    }
  ]
}
