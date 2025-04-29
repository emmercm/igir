{
  "variables": {
    "openssl_fips": ""
  },
  "targets": [
    {
      "target_name": "zstd",
      "sources": [
        "binding.cpp",
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
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")",
        "deps/zstd/lib"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "ZSTD_MULTITHREAD",
        "ZSTD_LIB_DECOMPRESSION=0",
        "ZSTD_LEGACY_SUPPORT=0",
        "ZSTD_NO_UNUSED_FUNCTIONS=1",
        "ZSTD_NOBENCH=1"
      ],
      "cflags": ["-O3", "-fvisibility=hidden"],
      "cflags_cc": ["-fvisibility=hidden"],
      "ldflags": ["-Wl,--exclude-libs,ALL"],

      "conditions": [
        ["OS=='win'", {
          "sources!": [
            "deps/zstd/lib/decompress/huf_decompress_amd64.S"
          ]
        }]
      ],

      "xcode_settings": {
        "GCC_OPTIMIZATION_LEVEL": "3",
        "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
        "GCC_GENERATE_DEBUGGING_SYMBOLS": "NO",
        "DEAD_CODE_STRIPPING": "YES"
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "Optimization": "2",
          "FavorSizeOrSpeed": "2",
          "EnableIntrinsicFunctions": "true",
          "EnableFunctionLevelLinking": "true",
          "WholeProgramOptimization": "true",
          "AdditionalOptions": []
        },
        "VCLinkerTool": {}
      }
    }
  ]
}
