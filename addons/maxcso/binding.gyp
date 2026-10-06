{
  "includes": ["../common.gypi"],
  "variables": {
    "maxcso": "deps/maxcso"
  },
  "target_defaults": {
    "conditions": [
      ["OS=='win'", {
        "defines": ["NOMINMAX", "UNICODE", "_UNICODE", "WIN32_LEAN_AND_MEAN", "_CRT_SECURE_NO_WARNINGS"]
      }],

      ["OS=='linux'", {
        # 64-bit file offsets on 32-bit targets (linux/arm/v7)
        "defines": ["_FILE_OFFSET_BITS=64"]
      }],
      # Baseline x86-64 only (SSE2), so a toolchain's newer default -march can't leak in
      ["OS=='mac' and target_arch=='x64'", {
        "xcode_settings": {
          "OTHER_CFLAGS": ["-march=x86-64"],
          "OTHER_CPLUSPLUSFLAGS": ["-march=x86-64"]
        }
      }],
      ["OS=='linux' and target_arch=='x64'", {
        "cflags": ["-march=x86-64", "-mtune=generic"]
      }]
    ],

    "cflags_cc!": [
      # Override Node.js' common.gypi
      "-std=gnu++17",
      "-std=gnu++20",
      # The binding uses C++ exceptions
      "-fno-exceptions", "-fno-rtti"
    ],
    "cflags_cc": [
      "-std=c++23",
      # The binding uses C++ exceptions
      "-fexceptions", "-frtti"
    ],
    "xcode_settings": {
      "CLANG_CXX_LANGUAGE_STANDARD": "c++23",
      "OTHER_CPLUSPLUSFLAGS": [
        "-std=c++23",
        # The binding uses C++ exceptions
        "-fexceptions", "-frtti"
      ]
    }
  },

  "targets": [
    {
      "target_name": "lz4",
      "type": "static_library",
      # Keep lz4's symbols out of the addon's export table
      "defines": ["LZ4LIB_VISIBILITY="],
      "sources": ["<(maxcso)/lz4/lib/lz4.c"]
    },

    {
      "target_name": "libdeflate",
      "type": "static_library",
      # libdeflate 1.7's only x86 runtime dispatch on the decompress path is a BMI2 variant,
      # guarded by `!defined(__BMI2__)` in lib/x86/decompress_impl.h. Defining it removes that
      # variant and its dispatcher without patching the submodule. lib/x86/cpu_features.c and
      # libdeflate's SIMD checksums are never compiled.
      "defines": ["__BMI2__"],
      "include_dirs": ["<(maxcso)/libdeflate"],
      "sources": [
        "<(maxcso)/libdeflate/lib/deflate_decompress.c",
        "<(maxcso)/libdeflate/lib/utils.c"
      ]
    },

    {
      "target_name": "zlib_adler",
      "type": "static_library",
      # Scalar Adler-32 for DAX frame trailers
      "sources": ["<(maxcso)/zlib/adler32.c"]
    },

    {
      "target_name": "maxcso",
      "sources": [
        "binding.cpp",
        "src/container.cpp"
      ],
      "dependencies": ["lz4", "libdeflate", "zlib_adler"],
      "defines": [
        "NAPI_CPP_EXCEPTIONS",
        # A read or info worker can finish while its worker thread's environment is being torn
        # down, when JS can no longer run. Without this, node-addon-api aborts the process
        # instead of dropping the result nobody can receive.
        "NODE_API_SWALLOW_UNTHROWABLE_EXCEPTIONS",
        "LZ4LIB_VISIBILITY="
      ],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "LanguageStandard": "Default",
          "AdditionalOptions!": ["-std:c++20", "/std:c++20"],
          "AdditionalOptions": [
            "/std:c++23preview",
            "/utf-8",
            "/Zc:preprocessor",
            "/Zc:__cplusplus"
          ]
        }
      },
      "conditions": [
        # Static linking
        ["OS=='linux'", {
          "ldflags": ["-static-libstdc++", "-static-libgcc"]
        }]
      ]
    }
  ]
}
