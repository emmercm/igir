{
  "variables": {
    "openssl_fips": ""
  },
  "targets": [
    {
      "target_name": "zlib",
      "sources": [
        "binding.cpp",
        "deps/zlib/adler32.c",
        "deps/zlib/compress.c",
        "deps/zlib/crc32.c",
        "deps/zlib/deflate.c",
        "deps/zlib/gzio.c",
        "deps/zlib/infblock.c",
        "deps/zlib/infcodes.c",
        "deps/zlib/inffast.c",
        "deps/zlib/inflate.c",
        "deps/zlib/inftrees.c",
        "deps/zlib/infutil.c",
        "deps/zlib/trees.c",
        "deps/zlib/uncompr.c",
        "deps/zlib/zutil.c"
      ],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")",
        "deps/zlib"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "cflags": ["-O3", "-fvisibility=hidden"],
      "cflags_cc": ["-std=c++17", "-fvisibility=hidden"],
      "ldflags": ["-L./deps/zlib", "-Wl,--exclude-libs,ALL"],

      "conditions": [
        ["OS=='mac'", {
          "defines+": ["TARGET_OS_MAC=0", "Byte=unsigned char"]
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
