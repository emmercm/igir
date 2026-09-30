# Settings shared by every addon's native build, included from each binding.gyp's
# `OS!="emscripten"` condition. See wasm.gypi for the WebAssembly build's.
{
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
  "cflags_cc": ["-fvisibility-inlines-hidden"],
  "ldflags": ["-Wl,--gc-sections", "-Wl,--exclude-libs,ALL"],
  "conditions": [
    ["OS=='linux'", {
      "cflags": ["-flto=auto"],
      "ldflags": ["-flto=auto"]
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
      "WholeProgramOptimization": "true"
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
