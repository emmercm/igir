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
      "cflags+": ["-fvisibility=hidden"],
      "cflags_cc": ["-std=c++17"],

      // Do NOT link the system-installed zlib
      "libraries": [],
      "link_settings": {
        "libraries": []
      },
      "ldflags": [
        "-Wl,--exclude-libs,ALL"
      ],

      "xcode_settings": {
        "GCC_SYMBOLS_PRIVATE_EXTERN": "YES"
      }
    }
  ]
}
