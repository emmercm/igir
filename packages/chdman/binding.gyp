# binding.gyp - builds the chdman Node addon and compiles its MAME/3rdparty
# dependencies into it as static libraries. Three cross-cutting goals drive the
# define/flag choices below:
#   * Maximum portability: target each architecture's baseline ISA only and
#     disable hand-written SIMD, so the binary runs on any supported CPU.
#   * Fully static: every 3rdparty library is compiled in (no external runtime
#     dependencies); only OS-provided system libraries remain.
#   * Fast execution (secondarily, small size): on top of node-gyp's default
#     per-file optimization (-O3 on gcc/clang/xcode; /Ox /Ot on MSVC, the last
#     already with /GL + /LTCG whole-program optimization), enable cross-module
#     LTO on gcc/clang/xcode and let the linker internalize and strip everything
#     but the N-API entry point. Applied to every configuration, matching the
#     other addons in packages/. No SIMD instruction sets are enabled: -O3's
#     baseline-ISA auto-vectorization is kept, but there is no -march/-mavx/-msse
#     and no hand-written SIMD.
{
  "variables": {
    "mame": "deps/mame"
  },
  "target_defaults": {
    "conditions": [
      # MAME's corefile.cpp #errors unless CRLF is defined (selects line-ending
      # translation: CR/LF on Windows, LF elsewhere).
      ["OS=='win'", { "defines": ["CRLF=3"] }],
      ["OS!='win'", { "defines": ["CRLF=2"] }],

      # Linux gcc/clang speed + size tuning (all configurations). Hidden
      # visibility internalizes every symbol except the N-API entry point
      # (binding.cpp's NODE_API_MODULE marks it visibility("default")), and
      # -ffunction-sections/-fdata-sections paired with --gc-sections lets the
      # linker drop everything unreferenced: smaller .node, and more for LTO to
      # inline/strip. A loadable module is never interposed, so
      # -fno-semantic-interposition lets the compiler inline across the
      # would-be shared-object boundary. The mac/MSVC equivalents live in
      # xcode_settings/msvs_settings below.
      ["OS=='linux'", {
        "cflags": [
          "-ffunction-sections", "-fdata-sections",
          "-fvisibility=hidden", "-fvisibility-inlines-hidden",
          "-fno-semantic-interposition"
        ],
        "ldflags": ["-Wl,--gc-sections"],
        "conditions": [
          # gcc: cross-module LTO. -flto=auto partitions the whole-program step
          # across all cores (same generated code as monolithic LTO, much
          # faster build). gyp builds the static libs with plain `ar`, which
          # records no LTO plugin, so -ffat-lto-objects keeps real machine code
          # in each archive member -- the final link resolves symbols normally
          # and the LTO plugin still optimizes via the embedded bytecode.
          ["clang==0", {
            "cflags": ["-flto=auto", "-ffat-lto-objects"],
            "ldflags": ["-flto=auto"]
          }],
          # clang on Linux: ThinLTO -- near-monolithic runtime speed, parallel
          # and incremental, so it needs no fat objects.
          ["clang==1", {
            "cflags": ["-flto=thin"],
            "ldflags": ["-flto=thin"]
          }]
        ]
      }]
    ],
    # gcc/clang toolchain flags. The same needs are expressed per-toolchain in
    # xcode_settings (macOS) and msvs_settings (Windows) below.
    "cflags_cc": [
      # MAME requires the C++17 language standard.
      "-std=c++17",
      # MAME uses C++ exceptions (chd_file throws std::error_condition) and RTTI,
      # but node-gyp builds addons with -fno-exceptions/-fno-rtti. Re-enable
      # both; appended last, these override node-gyp's flags.
      "-fexceptions", "-frtti"
    ],
    "xcode_settings": {
      # C++17 language standard.
      "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
      # Exceptions + RTTI, appended last to override node-gyp's -fno-* flags.
      "OTHER_CPLUSPLUSFLAGS": ["-fexceptions", "-frtti"],
      # macOS clang speed + size tuning (all configurations), mirroring the
      # Linux flags above. Monolithic LTO across every static lib and the
      # binding; hidden visibility keeps only the N-API entry point exported so
      # LTO and dead-code stripping can internalize/drop the rest.
      "LLVM_LTO": "YES",
      "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
      "GCC_INLINES_ARE_PRIVATE_EXTERN": "YES",
      "DEAD_CODE_STRIPPING": "YES",
      "OTHER_CFLAGS": ["-ffunction-sections", "-fdata-sections"]
    },
    "msvs_settings": {
      "VCCLCompilerTool": {
        # Static linking: /MT uses the static CRT, so the addon has no MSVC
        # runtime-DLL dependency.
        "RuntimeLibrary": "0",
        # C++17 language standard (/std:c++17) and C++ exceptions (/EHsc).
        "AdditionalOptions": ["/std:c++17", "/EHsc"]
      }
    }
    # Windows: MSVC already performs /GL whole-program optimization, /LTCG, and
    # /Ot speed-favoring optimization (node-gyp's addon.gypi + common.gypi), so
    # there is nothing further to add for the optimization goal here.
  },

  "targets": [
    {
      "target_name": "zlib",
      "type": "static_library",
      "include_dirs": ["<(mame)/3rdparty/zlib"],
      "sources": [
        "<(mame)/3rdparty/zlib/adler32.c",
        "<(mame)/3rdparty/zlib/compress.c",
        "<(mame)/3rdparty/zlib/crc32.c",
        "<(mame)/3rdparty/zlib/deflate.c",
        "<(mame)/3rdparty/zlib/inffast.c",
        "<(mame)/3rdparty/zlib/inflate.c",
        "<(mame)/3rdparty/zlib/infback.c",
        "<(mame)/3rdparty/zlib/inftrees.c",
        "<(mame)/3rdparty/zlib/trees.c",
        "<(mame)/3rdparty/zlib/uncompr.c",
        "<(mame)/3rdparty/zlib/zutil.c"
      ]
    },

    {
      "target_name": "zstd",
      "type": "static_library",
      # Portability / minimal SIMD: ZSTD_DISABLE_ASM drops the x86-64 .S assembly
      # (also omitted from sources); DYNAMIC_BMI2=0 disables runtime BMI2
      # dispatch. Only baseline scalar code remains, runnable on any CPU.
      "defines": ["ZSTD_DISABLE_ASM", "DYNAMIC_BMI2=0"],
      "include_dirs": ["<(mame)/3rdparty/zstd/lib"],
      "sources": [
        "<(mame)/3rdparty/zstd/lib/common/debug.c",
        "<(mame)/3rdparty/zstd/lib/common/entropy_common.c",
        "<(mame)/3rdparty/zstd/lib/common/error_private.c",
        "<(mame)/3rdparty/zstd/lib/common/fse_decompress.c",
        "<(mame)/3rdparty/zstd/lib/common/pool.c",
        "<(mame)/3rdparty/zstd/lib/common/threading.c",
        "<(mame)/3rdparty/zstd/lib/common/xxhash.c",
        "<(mame)/3rdparty/zstd/lib/common/zstd_common.c",
        "<(mame)/3rdparty/zstd/lib/compress/fse_compress.c",
        "<(mame)/3rdparty/zstd/lib/compress/hist.c",
        "<(mame)/3rdparty/zstd/lib/compress/huf_compress.c",
        "<(mame)/3rdparty/zstd/lib/compress/zstd_compress.c",
        "<(mame)/3rdparty/zstd/lib/compress/zstd_compress_literals.c",
        "<(mame)/3rdparty/zstd/lib/compress/zstd_compress_sequences.c",
        "<(mame)/3rdparty/zstd/lib/compress/zstd_compress_superblock.c",
        "<(mame)/3rdparty/zstd/lib/compress/zstd_double_fast.c",
        "<(mame)/3rdparty/zstd/lib/compress/zstd_fast.c",
        "<(mame)/3rdparty/zstd/lib/compress/zstd_lazy.c",
        "<(mame)/3rdparty/zstd/lib/compress/zstd_ldm.c",
        "<(mame)/3rdparty/zstd/lib/compress/zstdmt_compress.c",
        "<(mame)/3rdparty/zstd/lib/compress/zstd_opt.c",
        "<(mame)/3rdparty/zstd/lib/decompress/huf_decompress.c",
        "<(mame)/3rdparty/zstd/lib/decompress/zstd_ddict.c",
        "<(mame)/3rdparty/zstd/lib/decompress/zstd_decompress_block.c",
        "<(mame)/3rdparty/zstd/lib/decompress/zstd_decompress.c"
      ]
    },

    {
      "target_name": "flac",
      "type": "static_library",
      "defines": [
        # Pull MAME's bundled libFLAC config.h (PACKAGE_VERSION + CPU detection).
        "HAVE_CONFIG_H",
        # Portability / minimal SIMD: disable all hand-written FLAC SIMD (paired
        # with omitting the *_intrin_*.c sources below) -> pure scalar build.
        "FLAC__NO_ASM",
        # No Ogg container support: we bundle no libogg.
        "FLAC__HAS_OGG=0",
        # Use 64-bit bitreader words.
        "ENABLE_64_BIT_WORDS=1",
        # FLAC normally probes for these at configure time; since we don't run
        # its configure, they must always be provided for the library to build.
        "HAVE_LROUND=1", "HAVE_INTTYPES_H", "HAVE_STDBOOL_H", "HAVE_STDINT_H",
        "HAVE_STDIO_H", "HAVE_STDLIB_H", "HAVE_STRING_H",
        # Endianness: every supported architecture is little-endian.
        "CPU_IS_BIG_ENDIAN=0", "CPU_IS_LITTLE_ENDIAN=1", "WORDS_BIGENDIAN=0"
      ],
      "include_dirs": [
        "<(mame)/3rdparty/flac/src/libFLAC/include",
        "<(mame)/3rdparty/flac/include"
      ],
      "conditions": [
        ["OS=='mac'", { "defines": ["FLAC__SYS_DARWIN"] }],
        ["OS=='linux'", { "defines": ["FLAC__SYS_LINUX"] }]
      ],
      # The *_intrin_*.c SIMD files (AVX2/SSE2/SSSE3/SSE4/FMA/NEON) are
      # intentionally omitted; FLAC__NO_ASM above selects the scalar paths.
      "sources": [
        "<(mame)/3rdparty/flac/src/libFLAC/bitmath.c",
        "<(mame)/3rdparty/flac/src/libFLAC/bitreader.c",
        "<(mame)/3rdparty/flac/src/libFLAC/bitwriter.c",
        "<(mame)/3rdparty/flac/src/libFLAC/cpu.c",
        "<(mame)/3rdparty/flac/src/libFLAC/crc.c",
        "<(mame)/3rdparty/flac/src/libFLAC/fixed.c",
        "<(mame)/3rdparty/flac/src/libFLAC/float.c",
        "<(mame)/3rdparty/flac/src/libFLAC/format.c",
        "<(mame)/3rdparty/flac/src/libFLAC/lpc.c",
        "<(mame)/3rdparty/flac/src/libFLAC/md5.c",
        "<(mame)/3rdparty/flac/src/libFLAC/memory.c",
        "<(mame)/3rdparty/flac/src/libFLAC/stream_decoder.c",
        "<(mame)/3rdparty/flac/src/libFLAC/stream_encoder.c",
        "<(mame)/3rdparty/flac/src/libFLAC/stream_encoder_framing.c",
        "<(mame)/3rdparty/flac/src/libFLAC/window.c"
      ]
    },

    {
      "target_name": "lzma7z",
      "type": "static_library",
      # Z7_ST builds the single-threaded LZMA SDK, dropping the multithreaded
      # match-finder/coder sources and their threading dependencies.
      "defines": ["Z7_ST"],
      "include_dirs": ["<(mame)/3rdparty/lzma/C"],
      # Only the LZMA codec is needed (by chdcodec.cpp); the 7z-archive, PPMD,
      # AES, SHA, and *Opt SIMD sources are intentionally omitted.
      "sources": [
        "<(mame)/3rdparty/lzma/C/Alloc.c",
        "<(mame)/3rdparty/lzma/C/CpuArch.c",
        "<(mame)/3rdparty/lzma/C/LzFind.c",
        "<(mame)/3rdparty/lzma/C/LzmaDec.c",
        "<(mame)/3rdparty/lzma/C/LzmaEnc.c"
      ]
    },

    {
      "target_name": "utf8proc",
      "type": "static_library",
      # Static linking: don't decorate symbols with DLL import/export.
      "defines": ["UTF8PROC_STATIC"],
      "include_dirs": ["<(mame)/3rdparty/utf8proc"],
      "sources": ["<(mame)/3rdparty/utf8proc/utf8proc.c"]
    },

    {
      "target_name": "mame_ocore",
      "type": "static_library",
      "include_dirs": [
        "<(mame)/src/emu",
        "<(mame)/src/osd",
        "<(mame)/src/lib",
        "<(mame)/src/lib/util"
      ],
      "sources": [
        "<(mame)/src/osd/osdcore.cpp",
        "<(mame)/src/osd/strconv.cpp",
        "<(mame)/src/osd/osdsync.cpp",
        "<(mame)/src/osd/modules/osdmodule.cpp"
      ],
      "conditions": [
        ["OS=='mac'", {
          "sources": [
            "<(mame)/src/osd/modules/lib/osdlib_macosx.cpp",
            "<(mame)/src/osd/modules/file/posixdir.cpp",
            "<(mame)/src/osd/modules/file/posixfile.cpp",
            "<(mame)/src/osd/modules/file/posixptty.cpp",
            "<(mame)/src/osd/modules/file/posixsocket.cpp"
          ]
        }],
        ["OS=='linux'", {
          "sources": [
            "<(mame)/src/osd/modules/lib/osdlib_unix.cpp",
            "<(mame)/src/osd/modules/file/posixdir.cpp",
            "<(mame)/src/osd/modules/file/posixfile.cpp",
            "<(mame)/src/osd/modules/file/posixptty.cpp",
            "<(mame)/src/osd/modules/file/posixsocket.cpp"
          ]
        }],
        ["OS=='win'", {
          "include_dirs": ["<(mame)/src/osd/windows"],
          "sources": [
            "<(mame)/src/osd/modules/lib/osdlib_win32.cpp",
            "<(mame)/src/osd/modules/file/windir.cpp",
            "<(mame)/src/osd/modules/file/winfile.cpp",
            "<(mame)/src/osd/modules/file/winptty.cpp",
            "<(mame)/src/osd/modules/file/winsocket.cpp",
            "<(mame)/src/osd/windows/winutil.cpp"
          ]
        }]
      ]
    },

    {
      "target_name": "mame_utils",
      "type": "static_library",
      "include_dirs": [
        "<(mame)/src/lib/util",
        "<(mame)/src/osd",
        "<(mame)/3rdparty",
        "<(mame)/3rdparty/zlib",
        "<(mame)/3rdparty/zstd/lib",
        "<(mame)/3rdparty/flac/include",
        "<(mame)/3rdparty/utf8proc"
      ],
      # These must match the defines used to build the lzma/utf8proc/flac static
      # libs: chdcodec.cpp and unicode.cpp include those libraries' public
      # headers, so struct layouts and symbol linkage have to agree (ABI
      # consistency). FLAC__NO_DLL also keeps FLAC symbols statically linked.
      "defines": ["Z7_ST", "UTF8PROC_STATIC", "FLAC__NO_DLL"],
      "sources": [
        "<(mame)/src/lib/util/avhuff.cpp",
        "<(mame)/src/lib/util/aviio.cpp",
        "<(mame)/src/lib/util/bitmap.cpp",
        "<(mame)/src/lib/util/cdrom.cpp",
        "<(mame)/src/lib/util/chd.cpp",
        "<(mame)/src/lib/util/chdcodec.cpp",
        "<(mame)/src/lib/util/corealloc.cpp",
        "<(mame)/src/lib/util/corefile.cpp",
        "<(mame)/src/lib/util/corestr.cpp",
        "<(mame)/src/lib/util/delegate.cpp",
        "<(mame)/src/lib/util/dvdrom.cpp",
        "<(mame)/src/lib/util/dynamicclass.cpp",
        "<(mame)/src/lib/util/flac.cpp",
        "<(mame)/src/lib/util/harddisk.cpp",
        "<(mame)/src/lib/util/hashing.cpp",
        "<(mame)/src/lib/util/huffman.cpp",
        "<(mame)/src/lib/util/ioprocs.cpp",
        "<(mame)/src/lib/util/ioprocsfilter.cpp",
        "<(mame)/src/lib/util/md5.cpp",
        "<(mame)/src/lib/util/palette.cpp",
        "<(mame)/src/lib/util/path.cpp",
        "<(mame)/src/lib/util/strformat.cpp",
        "<(mame)/src/lib/util/unicode.cpp",
        "<(mame)/src/lib/util/vbiparse.cpp",
        "<(mame)/src/lib/util/vecstream.cpp"
      ]
    },

    {
      "target_name": "chdman",
      "sources": ["binding.cpp"],
      "dependencies": [
        "mame_utils", "mame_ocore",
        "zlib", "zstd", "flac", "lzma7z", "utf8proc"
      ],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")",
        "<(mame)/src/lib/util",
        "<(mame)/src/osd",
        "<(mame)/3rdparty/flac/include"
      ],
      "conditions": [
        # macOS: osdlib_macosx references these system frameworks (clipboard via
        # CoreFoundation). They ship on every Mac and are the only non-libc
        # external deps; everything else is statically linked into the .node.
        ["OS=='mac'", {
          "link_settings": {
            "libraries": ["-framework CoreFoundation", "-framework ApplicationServices"]
          }
        }],
        # Linux: statically link the C++ runtime so the .node carries no
        # libstdc++/libgcc dependency (glibc stays dynamic, as a .so requires).
        ["OS=='linux'", {
          "ldflags": ["-static-libstdc++", "-static-libgcc"]
        }]
      ]
    }
  ]
}
