{
  "variables": {
    "openssl_fips": ""
  },
  "targets": [
    {
      "target_name": "zlib_1_1_3",
      "sources": [
        "deps/zlib_1_1_3.cpp",
        "deps/zlib_1_1_3/adler32.c",
        "deps/zlib_1_1_3/compress.c",
        "deps/zlib_1_1_3/crc32.c",
        "deps/zlib_1_1_3/deflate.c",
        "deps/zlib_1_1_3/gzio.c",
        "deps/zlib_1_1_3/infblock.c",
        "deps/zlib_1_1_3/infcodes.c",
        "deps/zlib_1_1_3/inffast.c",
        "deps/zlib_1_1_3/inflate.c",
        "deps/zlib_1_1_3/inftrees.c",
        "deps/zlib_1_1_3/infutil.c",
        "deps/zlib_1_1_3/trees.c",
        "deps/zlib_1_1_3/uncompr.c",
        "deps/zlib_1_1_3/zutil.c"
      ],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")",
        "deps/zlib_1_1_3"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "cflags": ["-O3", "-fvisibility=hidden"],
      "cflags_cc": ["-std=c++17", "-fvisibility=hidden"],
      "ldflags": ["-L./deps/zlib_1_1_3", "-Wl,--exclude-libs,ALL"],

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
          "AdditionalOptions": [
            "/D__DATE__=0",
            "/D__TIME__=0",
            "/D__TIMESTAMP__=0",
            "/Zc:wchar_t",
            "/EHsc",
            "/Gm-"
          ]
        },
        "VCLinkerTool": {
          "AdditionalOptions": [
            "/Brepro",
            "/NOLOGO",
            "/OPT:REF",
            "/DEBUG:NONE"
          ]
        }
      }
    }
  ]
}
