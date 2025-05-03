{
  "variables": {
    "openssl_fips": ""
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
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "cflags": ["-fvisibility=hidden", "-O2"],
      "cflags_cc": ["-fvisibility=hidden", "-O2"],
      "ldflags": [
        "-flto",
        "-Wl,-z,noexecstack", "-Wl,-z,relro", "-Wl,-z,now",
        "-Wl,--as-needed", "-Wl,--no-copy-dt-needed-entries"
      ],

      "xcode_settings": {
        "GCC_OPTIMIZATION_LEVEL": "2",
        "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
        "GCC_GENERATE_DEBUGGING_SYMBOLS": "NO",
        "DEAD_CODE_STRIPPING": "YES"
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "EnableFunctionLevelLinking": "true",
          "WholeProgramOptimization": "true",
          "AdditionalOptions": [
            "/D__DATE__=0",
            "/D__TIME__=0",
            "/D__TIMESTAMP__=0"
          ]
        },
        "VCLinkerTool": {
          "LinkTimeCodeGeneration": "true",
          "AdditionalOptions": [
            "/Brepro",
            "/NOLOGO",
            "/OPT:REF",
            "/DEBUG:NONE"
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
        "deps/zstd/lib/compress/zstdmt_compress.c",
        "deps/zstd/lib/decompress/huf_decompress.c",
        "deps/zstd/lib/decompress/huf_decompress_amd64.S",
        "deps/zstd/lib/decompress/zstd_ddict.c",
        "deps/zstd/lib/decompress/zstd_decompress.c",
        "deps/zstd/lib/decompress/zstd_decompress_block.c"
      ],
      "direct_dependent_settings": {
        "include_dirs": ["deps/zstd/lib"],
        "ldflags": ["-Wl,--trace"]
      },
      "defines": [
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
      "cflags": ["-fvisibility=hidden", "-O2"],
      "cflags_cc": ["-fvisibility=hidden", "-O2"],
      "ldflags": ["-Wl,--trace"],

      "xcode_settings": {
        "GCC_SYMBOLS_PRIVATE_EXTERN": "YES"
      },

      "conditions": [
        ["OS=='win'", {
          "sources!": ["deps/zstd/lib/decompress/huf_decompress_amd64.S"]
        }],
        ["target_arch=='arm' or target_arch=='arm64'", {
          "sources!": ["deps/zstd/lib/decompress/huf_decompress_amd64.S"]
        }]
      ]
    }
  ]
}
