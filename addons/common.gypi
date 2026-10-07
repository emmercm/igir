# Settings shared by every addon's build, included from the top of each binding.gyp. The
# WebAssembly build also includes wasm.gypi, which overrides whatever Emscripten doesn't support.
{
  "target_defaults": {
    # Node's common.gypi defines _HAS_EXCEPTIONS=0 on Windows, which puts MSVC's STL in a
    # no-exceptions mode at odds with /EHsc: std::exception keeps a borrowed message pointer
    # instead of a copy, so a std::runtime_error built from a temporary string reports freed
    # memory. Removing the define restores MSVC's default of 1.
    "defines!": ["_HAS_EXCEPTIONS=0"],

    # Build optimizations
    # Compile out assert(), which neither Node's nor emnapi's common.gypi does for release builds
    "defines": ["NDEBUG"],
    # Override Node's common.gypi, frame pointers are only for profiling
    "cflags!": ["-fno-omit-frame-pointer"],
    "cflags": [
      "-O3",
      "-ffunction-sections", "-fdata-sections",
      "-fvisibility=hidden",
      "-fno-semantic-interposition"
    ],
    "cflags_cc": ["-fvisibility-inlines-hidden"],
    "ldflags": ["-Wl,--gc-sections", "-Wl,--exclude-libs,ALL"],
    "conditions": [
      ["OS=='linux'", {
        # Call shared libraries' functions through the GOT directly, rather than through PLT stubs
        "cflags": ["-flto=auto", "-fno-plt"],
        "ldflags": ["-flto=auto"]
      }],
      # node-gyp only sets this OS when it's run with emnapi's `--nodedir` and the
      # `make-emscripten` generator; see README.md
      ["OS=='emscripten'", {
        "includes": ["wasm.gypi"]
      }]
    ],

    "xcode_settings": {
      # Build optimizations
      "GCC_OPTIMIZATION_LEVEL": "3",
      "LLVM_LTO": "YES",
      "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
      "GCC_INLINES_ARE_PRIVATE_EXTERN": "YES",
      "GCC_GENERATE_DEBUGGING_SYMBOLS": "NO",
      "DEAD_CODE_STRIPPING": "YES",
      "OTHER_CFLAGS": ["-ffunction-sections", "-fdata-sections"],
      # Setting any OTHER_CPLUSPLUSFLAGS stops them inheriting OTHER_CFLAGS
      "OTHER_CPLUSPLUSFLAGS": ["-ffunction-sections", "-fdata-sections"]
    },

    "msvs_settings": {
      "VCCLCompilerTool": {
        # Statically link the C runtime
        "RuntimeLibrary": "0",
        # /EHsc
        "ExceptionHandling": 1,
        # Build optimizations
        "EnableFunctionLevelLinking": "true",
        "WholeProgramOptimization": "true",
        # Put global data in its own COMDATs too, so /OPT:REF can drop the unused data
        "AdditionalOptions": ["/Gw"]
      },
      "VCLibrarianTool": {
        "AdditionalOptions": ["/LTCG"]
      },
      "VCLinkerTool": {
        # Build optimizations
        "OptimizeReferences": "2",
        "EnableCOMDATFolding": "2",
        "LinkTimeCodeGeneration": "1",
        "AdditionalOptions": ["/Brepro", "/DEBUG:NONE"],
        # Node.js v26.3.0 Windows started adding "/opt:lldltojobs=<lto_jobs>" which MSVC throws LNK1117 on
        "AdditionalOptions/": [["exclude", "lldltojobs"]]
      }
    }
  }
}
