{
  "variables": {
    "openssl_fips": ""
  },
  "target_defaults": {
    # Node's common.gypi defines _HAS_EXCEPTIONS=0 on Windows, which puts MSVC's STL in a
    # no-exceptions mode at odds with /EHsc: std::exception keeps a borrowed message pointer
    # instead of a copy, so a std::runtime_error built from a temporary string reports freed
    # memory. Removing the define restores MSVC's default of 1.
    "defines!": ["_HAS_EXCEPTIONS=0"],
    # Build optimizations
    "cflags": [
      "-ffunction-sections", "-fdata-sections",
      "-fno-semantic-interposition"
    ],
    "cflags!": ["-fno-omit-frame-pointer"],
    "cflags_cc": ["-fvisibility-inlines-hidden"],
    "ldflags": ["-Wl,--gc-sections", "-Wl,--exclude-libs,ALL"],
    "conditions": [
      ["OS=='linux'", {
        "cflags": ["-flto=auto"],
        "ldflags": ["-flto=auto"]
      }]
    ],
    "xcode_settings": {
      "LLVM_LTO": "YES",
      "GCC_INLINES_ARE_PRIVATE_EXTERN": "YES",
      "DEAD_CODE_STRIPPING": "YES",
      "OTHER_CFLAGS": ["-ffunction-sections", "-fdata-sections"]
    },
    "msvs_settings": {
      "VCCLCompilerTool": {
        "EnableFunctionLevelLinking": "true",
        "WholeProgramOptimization": "true"
      },
      "VCLibrarianTool": {
        "AdditionalOptions": ["/LTCG"]
      },
      "VCLinkerTool": {
        "EnableCOMDATFolding": "2",
        "LinkTimeCodeGeneration": "1"
      }
    }
  },
  "targets": [
    {
      "target_name": "binding",
      "sources": ["binding.cpp"],
      "dependencies": ["zstd"],
      "include_dirs": ["<!(node -p \"require('node-addon-api').include_dir\")"],
      "defines": [
        "NAPI_VERSION=<(napi_build_version)",
        "NODE_ADDON_API_DISABLE_DEPRECATED",
        "NAPI_CPP_EXCEPTIONS",
        # A compress worker can finish while its worker thread's environment is
        # being torn down, when JS can no longer run. Without this, node-addon-api aborts the
        # process instead of dropping the result nobody can receive.
        "NODE_API_SWALLOW_UNTHROWABLE_EXCEPTIONS"
      ],
      "cflags": ["-fvisibility=hidden"],
      # The binding uses C++ exceptions, overriding Node.js' common.gypi
      "cflags_cc!": ["-fno-exceptions"],
      "cflags_cc": ["-fvisibility=hidden", "-fexceptions"],
      "ldflags": [
        "-Wl,-z,noexecstack", "-Wl,-z,relro", "-Wl,-z,now",
        "-Wl,--as-needed", "-Wl,--no-copy-dt-needed-entries"
      ],

      "xcode_settings": {
        # The binding uses C++ exceptions
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
        "GCC_GENERATE_DEBUGGING_SYMBOLS": "NO",
        "DEAD_CODE_STRIPPING": "YES"
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          # The binding uses C++ exceptions
          "ExceptionHandling": 1
        },
        "VCLinkerTool": {
          "AdditionalOptions": [
            "/Brepro",
            "/NOLOGO",
            "/OPT:REF",
            "/DEBUG:NONE"
          ],
          # Node.js v26.3.0 Windows started adding "/opt:lldltojobs=<lto_jobs>" which MSVC throws LNK1117 on
          "AdditionalOptions/": [
            ["exclude", "lldltojobs"]
          ]
        }
      }
    },

    {
      "target_name": "zstd",
      "type": "static_library",
      "sources": [
        "deps/zstd/lib/common/debug.c",
        "deps/zstd/lib/common/entropy_common.c",
        "deps/zstd/lib/common/error_private.c",
        "deps/zstd/lib/common/fse_decompress.c",
        "deps/zstd/lib/common/pool.c",
        "deps/zstd/lib/common/threading.c",
        "deps/zstd/lib/common/xxhash.c",
        "deps/zstd/lib/common/zstd_common.c",
        "deps/zstd/lib/compress/fse_compress.c",
        "deps/zstd/lib/compress/hist.c",
        "deps/zstd/lib/compress/huf_compress.c",
        "deps/zstd/lib/compress/zstd_compress.c",
        "deps/zstd/lib/compress/zstd_compress_literals.c",
        "deps/zstd/lib/compress/zstd_compress_sequences.c",
        "deps/zstd/lib/compress/zstd_compress_superblock.c",
        "deps/zstd/lib/compress/zstd_double_fast.c",
        "deps/zstd/lib/compress/zstd_fast.c",
        "deps/zstd/lib/compress/zstd_lazy.c",
        "deps/zstd/lib/compress/zstd_ldm.c",
        "deps/zstd/lib/compress/zstd_opt.c",
        "deps/zstd/lib/compress/zstdmt_compress.c"
      ],
      "direct_dependent_settings": {
        "include_dirs": ["deps/zstd/lib"],
        "ldflags": ["-Wl,--trace"]
      },
      "defines": [
        "ZSTD_STATIC_LINKING_ONLY=",
        "ZSTD_MULTITHREAD",
        "ZSTD_NO_TRACE",
        "ZSTDLIB_VISIBLE=",
        "ZSTD_LEGACY_SUPPORT=0",
        "ZSTD_LIB_DECOMPRESSION=0",
        "ZSTD_LIB_DICTBUILDER=0",
        "ZSTD_LIB_DEPRECATED=0",
        "ZSTD_LIB_MINIFY=1",
        "ZSTD_NO_UNUSED_FUNCTIONS=1",
        "ZSTD_NOBENCH=1"
      ],
      "cflags": ["-fvisibility=hidden"],
      "cflags_cc": ["-fvisibility=hidden"],
      "ldflags": ["-Wl,--trace"],

      "xcode_settings": {
        "GCC_SYMBOLS_PRIVATE_EXTERN": "YES"
      }
    }
  ]
}
