{
  "variables": {
    "mame": "deps/mame"
  },
  "target_defaults": {
    "conditions": [
      # NOMINMAX stops <windows.h> from defining min()/max() macros, which
      # otherwise clobber std::numeric_limits<>::max() etc. (e.g. strconv.cpp).
      ["OS=='win'", { "defines": ["CRLF=3", "NOMINMAX"] }],
      ["OS!='win'", { "defines": ["CRLF=2"] }],

      # Build optimizations. Use plain -flto: both gcc and clang accept it, while
      # -flto=auto (gcc) and -flto=thin (clang) are compiler-specific. node-gyp's
      # `clang` variable reflects how node itself was built, not the addon's CXX,
      # so it can't pick the right flavor (a clang-built node compiling with gcc
      # would pass gcc an unsupported -flto=thin, breaking from-source installs).
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

    # node-gyp compiles addons with -fno-exceptions/-fno-rtti; remove those
    # inherited flags so the -fexceptions/-frtti below are not overridden (order
    # of appended flags is not guaranteed on gcc).
    "cflags_cc!": ["-fno-exceptions", "-fno-rtti"],
    "cflags_cc": [
      "-std=c++17",
      # MAME uses C++ exceptions and RTTI
      "-fexceptions", "-frtti"
    ],
    "xcode_settings": {
      "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
      # MAME uses C++ exceptions and RTTI
      "OTHER_CPLUSPLUSFLAGS": ["-fexceptions", "-frtti"],
      # Build optimizations
      "LLVM_LTO": "YES",
      "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
      "GCC_INLINES_ARE_PRIVATE_EXTERN": "YES",
      "DEAD_CODE_STRIPPING": "YES",
      "OTHER_CFLAGS": ["-ffunction-sections", "-fdata-sections"]
    },
    "msvs_settings": {
      "VCCLCompilerTool": {
        "RuntimeLibrary": "0",
        "AdditionalOptions": [
          "/std:c++17",
          # MAME uses C++ exceptions and RTTI,
          "/EHsc"
        ]
      }
    }
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
        # Static linking: without this, FLAC_API defaults to __declspec(dllimport)
        # on Windows (MSVC), so compiling libFLAC's own sources fails with C2491
        # "definition of dllimport not allowed". Must match mame_utils below.
        "FLAC__NO_DLL",
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
            # osdlib_min.cpp replaces MAME's osdlib_macosx.cpp, whose only external
            # dependency (CoreFoundation/ApplicationServices, for clipboard) is dead
            # code here; see that file for why.
            "osdlib_min.cpp",
            "<(mame)/src/osd/modules/file/posixdir.cpp",
            "<(mame)/src/osd/modules/file/posixfile.cpp",
            "<(mame)/src/osd/modules/file/posixptty.cpp",
            "<(mame)/src/osd/modules/file/posixsocket.cpp"
          ]
        }],
        ["OS=='linux'", {
          "sources": [
            # osdlib_min.cpp replaces MAME's osdlib_unix.cpp, which #includes
            # <SDL2/SDL.h>; see that file for why.
            "osdlib_min.cpp",
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
      # These must match the defines used to build the lzma/flac static libs:
      # chdcodec.cpp includes those libraries' public headers, so struct layouts
      # and symbol linkage have to agree (ABI consistency). FLAC__NO_DLL also
      # keeps FLAC symbols statically linked. utf8proc is NOT compiled in: the
      # only caller (unicode.cpp's normalize_unicode) is never reached, so the
      # linker dead-strips it; UTF8PROC_STATIC still makes its header declare a
      # plain (non-dllimport) extern for that dead reference.
      "defines": ["Z7_ST", "UTF8PROC_STATIC", "FLAC__NO_DLL"],
      # avhuff (the AVHUFF CHD codec, referenced by chd.cpp/chdcodec.cpp) needs
      # bitmap + palette + huffman; the AVI container (aviio), laserdisc VBI
      # (vbiparse), and the dvdrom/harddisk file wrappers are not referenced by
      # the CHD read/list path, so they are omitted.
      "sources": [
        "<(mame)/src/lib/util/avhuff.cpp",
        "<(mame)/src/lib/util/bitmap.cpp",
        "<(mame)/src/lib/util/cdrom.cpp",
        "<(mame)/src/lib/util/chd.cpp",
        "<(mame)/src/lib/util/chdcodec.cpp",
        "<(mame)/src/lib/util/corealloc.cpp",
        "<(mame)/src/lib/util/corefile.cpp",
        "<(mame)/src/lib/util/corestr.cpp",
        "<(mame)/src/lib/util/delegate.cpp",
        "<(mame)/src/lib/util/dynamicclass.cpp",
        "<(mame)/src/lib/util/flac.cpp",
        "<(mame)/src/lib/util/hashing.cpp",
        "<(mame)/src/lib/util/huffman.cpp",
        "<(mame)/src/lib/util/ioprocs.cpp",
        "<(mame)/src/lib/util/ioprocsfilter.cpp",
        "<(mame)/src/lib/util/md5.cpp",
        "<(mame)/src/lib/util/palette.cpp",
        "<(mame)/src/lib/util/path.cpp",
        "<(mame)/src/lib/util/strformat.cpp",
        "<(mame)/src/lib/util/unicode.cpp",
        "<(mame)/src/lib/util/vecstream.cpp"
      ]
    },

    {
      "target_name": "chdman",
      "sources": ["binding.cpp"],
      "dependencies": [
        "mame_utils", "mame_ocore",
        "zlib", "zstd", "flac", "lzma7z"
      ],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")",
        "<(mame)/src/lib/util",
        "<(mame)/src/osd",
        "<(mame)/3rdparty/flac/include"
      ],
      "conditions": [
        # Linux: statically link the C++ runtime so the .node carries no
        # libstdc++/libgcc dependency (glibc stays dynamic, as a .so requires).
        # macOS needs no link_settings: using osdlib_min.cpp drops the only
        # external frameworks (CoreFoundation/ApplicationServices) MAME's
        # osdlib_macosx.cpp pulled in, so the .node links against libSystem only.
        ["OS=='linux'", {
          "ldflags": ["-static-libstdc++", "-static-libgcc"]
        }]
      ]
    }
  ]
}
