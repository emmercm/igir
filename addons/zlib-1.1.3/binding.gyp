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
      # Build optimizations
      "cflags": ["-O3"],
      "cflags!": ["-fno-omit-frame-pointer"],
      "cflags_cc": ["-std=c++17"],

      "conditions": [
        ["OS=='emscripten'", {
          "includes": ["../wasm.gypi"]
        }, {
          "includes": ["../native.gypi"]
        }],
        ["OS=='mac'", {
          # Modern Apple Clang defines TARGET_OS_MAC. The legacy zconf.h then
          # expects Byte from classic Mac headers; supply only that missing type.
          "defines+": ["Byte=unsigned char"]
        }]
      ],

      "xcode_settings": {
        "GCC_OPTIMIZATION_LEVEL": "3"
      },

      "msvs_settings": {
        "VCCLCompilerTool": {
          "Optimization": "2",
          "FavorSizeOrSpeed": "2",
          "EnableIntrinsicFunctions": "true",
          "AdditionalOptions": [
            "/Zc:wchar_t",
            "/Gm-"
          ]
        },
        "VCLinkerTool": {
          "AdditionalOptions": ["/NOLOGO"]
        }
      }
    }
  ]
}
