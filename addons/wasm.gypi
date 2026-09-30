# Emscripten settings shared by every addon's wasm build, included from each binding.gyp's
# `OS=="emscripten"` condition. node-gyp only sets that OS when it's run with emnapi's
# `--nodedir` and the `make-emscripten` generator; see addons/README.md.
{
  "target_conditions": [
    # emnapi builds each addon as an Emscripten executable
    ["_type=='executable'", {
      # Emscripten names its CommonJS output from this extension, and it must be `.cjs` because
      # the package is `"type": "module"`
      "product_extension": "cjs",
      "libraries": [
        # emnapi's prebuilt Node-API implementation, rather than its sources compiled with each
        # addon's flags; requires `-Demnapi_manual_linking=1`
        "-L<(node_root_dir)/lib/wasm32-emscripten",
        "-lemnapi-mt",
        "--js-library=<(emnapi_js_library)"
      ]
    }]
  ],

  "cflags": [
    # C++ exceptions, native to wasm rather than emulated in JavaScript
    "-fwasm-exceptions",
    # WebAssembly SIMD, plus Emscripten's SSE2 intrinsics that translate to it; its NEON intrinsics
    # need no flag. Its other x86 intrinsics stay disabled.
    "-msimd128",
    "-msse2",
    # emnapi's own sources use Emscripten's deprecated version macros
    "-Wno-deprecated-pragma"
  ],
  "cflags_cc!": [
    # Override emnapi's common.gypi, each binding.gyp names its own standard
    "-std=c++17",
    # Override each binding.gyp, which would otherwise enable JavaScript-emulated exceptions
    "-fexceptions"
  ],
  "ldflags": [
    "-fwasm-exceptions",
    # Instantiate synchronously so that each index.ts can load the addon on first use, the same
    # as it loads a prebuild
    "-sWASM_ASYNC_COMPILATION=0",
    # Give worker threads and the main thread the same direct access to the host's filesystem
    "-sNODERAWFS=1",
    "-sENVIRONMENT=node",
    # Start enough threads up front for the addons' async work and for the libraries' own
    # threads; a thread started later needs the main thread's event loop, which a blocking
    # wait could deadlock
    "-sPTHREAD_POOL_SIZE=8",
    # Start loading those threads without waiting for them to finish, which would otherwise
    # delay the runtime's initialization past the synchronous instantiation
    "-sPTHREAD_POOL_DELAY_LOAD=1",
    "-sEXPORTED_RUNTIME_METHODS=['emnapiInit']",
    # package.json's minimum, as Emscripten's XXYYZZ number
    "-sMIN_NODE_VERSION=<!(node --print \"const v = require('semver').minVersion(require('<(module_root_dir)/../../package.json').engines.node); v.major * 10000 + v.minor * 100 + v.patch\")"
  ],
  "ldflags!": [
    # Override emnapi's common.gypi, which targets browsers and Node.js versions that Emscripten
    # no longer supports
    "-sMIN_CHROME_VERSION=85",
    "-sMIN_NODE_VERSION=161500",
    # Unsupported by wasm-ld
    "-Wl,--exclude-libs,ALL",
    "-Wl,-z,noexecstack", "-Wl,-z,relro", "-Wl,-z,now",
    "-Wl,--as-needed", "-Wl,--no-copy-dt-needed-entries"
  ]
}
