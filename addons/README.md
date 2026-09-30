# Native Addons

Node-API (C++) bindings for native libraries that don't have a suitable JavaScript implementation. TypeScript-only libraries live in [`packages/`](../packages) instead.

## Layout

Every subdirectory of `addons/` with a `binding.gyp` is treated as an addon by the build scripts and the GitHub Actions workflows, so each one follows the same layout:

- `index.ts` — the TypeScript API. It loads the first binary that exists, in order:
  1. `build/Release/<target>.node`, a local `node-gyp` build
  2. `addon-<name>/prebuilds/<platform>-<arch>/node.node`, a committed prebuild
  3. `addon-<name>/wasm/<target>.cjs`, a committed WebAssembly build, which runs on any platform but slower than a native build
- `binding.cpp` and `binding.gyp` — the C++ bindings and their `node-gyp` build configuration
- `addon-<name>/prebuilds/` and `addon-<name>/wasm/` — builds that are built and signed by CI; don't commit these by hand
- `deps/` — vendored Git submodules, which are excluded from linting, type-checking, and tests
- `test/` — tests, which should only use the `index.ts` API

The npm package only ships the prebuilds and WebAssembly builds, never the C++ sources, so installing it never compiles anything.

## Building

Build an addon for the current platform with `node-gyp`, which `index.ts` loads before any prebuild:

```shell
cd addons/<name>
../../node_modules/.bin/node-gyp rebuild
```

## WebAssembly

The WebAssembly builds use [Emscripten](https://emscripten.org/) and [emnapi](https://github.com/toyobayashi/emnapi)'s Node-API implementation. Every `binding.gyp` includes the shared [`common.gypi`](common.gypi) settings, which add [`wasm.gypi`](wasm.gypi)'s under `OS=="emscripten"`, an OS that `node-gyp` only sets when it's run with emnapi.

Every `index.ts` loads its development build, then its prebuild, then its WebAssembly build, and the `IGIR_ADDONS` environment variable narrows that down:

- `IGIR_ADDONS=native` throws when neither native build loads, rather than falling back to the WebAssembly build
- `IGIR_ADDONS=wasm` skips straight to the WebAssembly build

Tests run twice, once in Vitest's `native` project and again in its `wasm` project, which set `IGIR_ADDONS` to their names. Run just one of them with `npm run test:unit -- --project=native` or `--project=wasm`.

## C++ linting

C++ code must pass `clang-format` and `clang-tidy`, configured by [`.clang-format`](.clang-format) and [`.clang-tidy`](.clang-tidy) in this directory. The tool versions are pinned in [`requirements.txt`](requirements.txt).

## Adding an addon

- Include `../common.gypi` from the top of the new `binding.gyp`
- Follow the other addons' `index.ts` loaders, including their `IGIR_ADDONS` checks
