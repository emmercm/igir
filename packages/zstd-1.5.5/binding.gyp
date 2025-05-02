{
  "variables": {
    "openssl_fips": ""
  },
  "targets": [
    {
      "target_name": "binding",
      "sources": ["binding.cpp"],
      "dependencies": ["zstd.gyp:zstd"],
      "include_dirs": ["<!(node -p \"require('node-addon-api').include_dir\")"],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "cflags": ["-fvisibility=hidden", "-fPIC", "-O3"],
      "cflags_cc": ["-fvisibility=hidden", "-fPIC"],
      "ldflags": [
        "-Wl,--trace", "-Wl,--as-needed", "-Wl,--no-copy-dt-needed-entries"
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
            "/wd4117"
          ]
        },
        "VCLinkerTool": {}
      }
    }
  ]
}
