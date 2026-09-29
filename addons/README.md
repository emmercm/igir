# Native Addons

Node-API (C++) bindings for native libraries that don't have a suitable JavaScript implementation. TypeScript-only libraries live in [`packages/`](../packages) instead.

## Layout

Every subdirectory of `addons/` is treated as an addon by `postinstall.mjs` and the GitHub Actions workflows, so each one follows the same layout:

- `index.ts` — the TypeScript API. It loads the first binary that exists, in order:
  1. `build/Release/binding.node`, a local `node-gyp` build
  2. `addon-<name>/prebuilds/<platform>-<arch>/node.node`, a committed prebuild
  3. `addon-<name>/build/Release/binding.node`, a from-source build by `postinstall.mjs`
- `binding.cpp` and `binding.gyp` — the C++ bindings and their `node-gyp` build configuration
- `addon-<name>/prebuilds/` — prebuilds that are built and signed by CI; don't commit these by hand
- `deps/` — vendored Git submodules, which are excluded from linting, type-checking, and tests
- `test/` — tests, which should only use the `index.ts` API

## C++ linting

C++ code must pass `clang-format` and `clang-tidy`, configured by [`.clang-format`](.clang-format) and [`.clang-tidy`](.clang-tidy) in this directory. The tool versions are pinned in [`requirements.txt`](requirements.txt).

## Adding an addon

Vendored source files aren't published unless `scripts/build.ts` copies them, so a new addon's `deps/` files must be added to its globs.
