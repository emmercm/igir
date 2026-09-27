{
  "variables": {
    "maxcso": "deps/maxcso",
    # `node-gyp configure -- -Dmaxcso_sanitize=true` builds with ASan and UBSan (Linux only)
    "maxcso_sanitize%": "false"
  },
  "target_defaults": {
    # Node's common.gypi defines _HAS_EXCEPTIONS=0 on Windows, which puts MSVC's STL in a
    # no-exceptions mode at odds with /EHsc: std::exception keeps a borrowed message pointer
    # instead of a copy, so a std::runtime_error built from a temporary string reports freed
    # memory. Removing the define restores MSVC's default of 1.
    "defines!": ["_HAS_EXCEPTIONS=0"],
    "conditions": [
      ["OS=='win'", {
        "defines": ["NOMINMAX", "UNICODE", "_UNICODE", "WIN32_LEAN_AND_MEAN", "_CRT_SECURE_NO_WARNINGS"]
      }],

      # Build optimizations
      ["OS=='linux'", {
        # 64-bit file offsets on 32-bit targets (linux/arm/v7)
        "defines": ["_FILE_OFFSET_BITS=64"],
        "cflags": [
          "-ffunction-sections", "-fdata-sections",
          "-fvisibility=hidden",
          "-fno-semantic-interposition",
          "-flto=auto"
        ],
        "cflags_cc": ["-fvisibility-inlines-hidden"],
        "ldflags": ["-Wl,--gc-sections", "-Wl,--exclude-libs,ALL", "-flto=auto"]
      }],
      # The sanitizers need frame pointers for their stack traces
      ["maxcso_sanitize!='true'", {
        "cflags!": ["-fno-omit-frame-pointer"]
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
      }],

      ["OS=='linux' and maxcso_sanitize=='true'", {
        "cflags": [
          "-fsanitize=address,undefined",
          "-fno-sanitize-recover=undefined",
          "-fno-omit-frame-pointer"
        ],
        "ldflags": ["-fsanitize=address,undefined"]
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
        "-fexceptions", "-frtti",
        "-ffunction-sections", "-fdata-sections"
      ],
      # Build optimizations
      "LLVM_LTO": "YES",
      "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
      "GCC_INLINES_ARE_PRIVATE_EXTERN": "YES",
      "GCC_GENERATE_DEBUGGING_SYMBOLS": "NO",
      "DEAD_CODE_STRIPPING": "YES",
      "OTHER_CFLAGS": ["-ffunction-sections", "-fdata-sections"]
    },
    "msvs_settings": {
      "VCCLCompilerTool": {
        "RuntimeLibrary": "0",
        "EnableFunctionLevelLinking": "true",
        "WholeProgramOptimization": "true",
        "AdditionalOptions": [
          # The binding uses C++ exceptions
          "/EHsc"
        ]
      },
      "VCLibrarianTool": {
        "AdditionalOptions": ["/LTCG"]
      },
      "VCLinkerTool": {
        # Build optimizations
        "OptimizeReferences": "2",
        "EnableCOMDATFolding": "2",
        "LinkTimeCodeGeneration": "1",
        "AdditionalOptions": [
          "/Brepro",
          "/DEBUG:NONE"
        ],
        # Node.js v26.3.0 Windows started adding "/opt:lldltojobs=<lto_jobs>" which MSVC throws LNK1117 on
        "AdditionalOptions/": [
          ["exclude", "lldltojobs"]
        ]
      }
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
      "sources": ["binding.cpp"],
      "dependencies": ["lz4", "libdeflate", "zlib_adler"],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
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
        # Static linking. Skipped under the sanitizers, because a static libstdc++ would shadow
        # ASan's operator new/delete interceptors.
        ["OS=='linux' and maxcso_sanitize!='true'", {
          "ldflags": ["-static-libstdc++", "-static-libgcc"]
        }]
      ]
    }
  ]
}
