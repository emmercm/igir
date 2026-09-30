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
      # Node's common.gypi defines _HAS_EXCEPTIONS=0 on Windows, which puts MSVC's STL in a
      # no-exceptions mode at odds with /EHsc: std::exception keeps a borrowed message pointer
      # instead of a copy, so a std::runtime_error built from a temporary string reports freed
      # memory. Removing the define restores MSVC's default of 1.
      "defines!": ["_HAS_EXCEPTIONS=0"],
      # Build optimizations
      "cflags": [
        "-O3",
        "-ffunction-sections", "-fdata-sections",
        "-fvisibility=hidden",
        "-fno-semantic-interposition"
      ],
      "cflags!": ["-fno-omit-frame-pointer"],
      "cflags_cc": ["-std=c++17", "-fvisibility=hidden", "-fvisibility-inlines-hidden"],
      "ldflags": ["-Wl,--gc-sections", "-Wl,--exclude-libs,ALL"],

      "conditions": [
        ["OS=='linux'", {
          "cflags": ["-flto=auto"],
          "ldflags": ["-flto=auto"]
        }],
        ["OS=='mac'", {
          # Modern Apple Clang defines TARGET_OS_MAC. The legacy zconf.h then
          # expects Byte from classic Mac headers; supply only that missing type.
          "defines+": ["Byte=unsigned char"]
        }],
        ["OS=='emscripten'", {
          "includes": ["../wasm.gypi"]
        }]
      ],

      "xcode_settings": {
        "GCC_OPTIMIZATION_LEVEL": "3",
        "LLVM_LTO": "YES",
        "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
        "GCC_INLINES_ARE_PRIVATE_EXTERN": "YES",
        "GCC_GENERATE_DEBUGGING_SYMBOLS": "NO",
        "DEAD_CODE_STRIPPING": "YES",
        "OTHER_CFLAGS": ["-ffunction-sections", "-fdata-sections"]
      },

      "msvs_settings": {
        "VCCLCompilerTool": {
          "Optimization": "2",
          "FavorSizeOrSpeed": "2",
          "EnableIntrinsicFunctions": "true",
          "EnableFunctionLevelLinking": "true",
          "WholeProgramOptimization": "true",
          "AdditionalOptions": [
            "/Zc:wchar_t",
            "/EHsc",
            "/Gm-"
          ]
        },
        "VCLinkerTool": {
          "EnableCOMDATFolding": "2",
          "LinkTimeCodeGeneration": "1",
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
    }
  ]
}
