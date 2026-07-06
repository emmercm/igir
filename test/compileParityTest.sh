#!/usr/bin/env bash
#
# CI-ONLY parity check for the Bun-compiled igir executable.
#
# Runs a fixed set of igir commands twice — once via `npm start` (Node/tsx,
# using node_modules) and once via the compiled standalone binary — and fails
# if any command produces different file output between the two.
#
# WARNING: This script runs `rm -rf node_modules` (to prove the compiled binary
# is self-contained). It is intended to run in CI, not on a developer machine.
#
# Usage: bash test/compileParityTest.sh <path-to-compiled-binary>
#   e.g. bash test/compileParityTest.sh igir
#        bash test/compileParityTest.sh ./igir.exe
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <path-to-compiled-binary>" >&2
  exit 2
fi

# Resolve the binary to an absolute path. dirname of a bare name like "igir" is
# ".", so this yields "<repo-root>/igir", which lets bash execute a binary that
# lives in the current directory without needing a "./" prefix from the caller.
BIN_DIR="$(cd "$(dirname "$1")" && pwd)"
BIN="${BIN_DIR}/$(basename "$1")"
if [ ! -e "${BIN}" ]; then
  echo "ERROR: binary '${BIN}' does not exist" >&2
  exit 2
fi

# The commands under test. Each is run once via `npm start` and once via the
# compiled binary; their --output trees must be byte-identical. Paths contain no
# spaces, so word-splitting each entry into argv is safe.
COMMANDS=(
  "copy --dat test/fixtures/dats --input test/fixtures/roms/chd"
  "copy extract --dat test/fixtures/dats --input test/fixtures/roms/cso"
  "copy extract --dat test/fixtures/dats --input test/fixtures/roms/gcz"
  "copy extract --dat test/fixtures/dats --input test/fixtures/roms/rar"
  "copy extract --dat test/fixtures/dats --input test/fixtures/roms/rvz"
  "copy extract --dat test/fixtures/dats --input test/fixtures/roms/wia"
)

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

# sha256 <file> -> prints the lowercase hex digest (no filename).
# Uses sha256sum where available (Linux, Git-bash), else shasum (macOS).
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

# manifest <dir> -> prints "<sha256>  <relative/path>" for every file, sorted by
# path, so two identical trees produce identical, diff-able output.
manifest() {
  ( cd "$1" && find . -type f | LC_ALL=C sort | while IFS= read -r file; do
      printf '%s  %s\n' "$(sha256 "${file}")" "${file}"
    done )
}

# --- Phase 1: Node (npm start), with node_modules present ---
echo "===== Parity: running commands via 'npm start' ====="
for i in "${!COMMANDS[@]}"; do
  read -ra args <<< "${COMMANDS[$i]}"
  out="${WORK}/node/${i}"
  echo "----- npm start -- ${COMMANDS[$i]} -----"
  npm start -- "${args[@]}" --output "${out}"
  if [ -z "$(find "${out}" -type f 2>/dev/null)" ]; then
    echo "ERROR: Node output for '${COMMANDS[$i]}' is empty" >&2
    exit 1
  fi
done

# --- Prove the binary is self-contained ---
echo "===== Parity: removing node_modules ====="
rm -rf node_modules

# --- Phase 2: compiled binary, without node_modules ---
echo "===== Parity: running commands via '${BIN}' ====="
for i in "${!COMMANDS[@]}"; do
  read -ra args <<< "${COMMANDS[$i]}"
  out="${WORK}/bun/${i}"
  echo "----- ${BIN} ${COMMANDS[$i]} -----"
  "${BIN}" "${args[@]}" --output "${out}"
done

# --- Phase 3: compare (process substitution must be unquoted) ---
echo "===== Parity: comparing output ====="
status=0
for i in "${!COMMANDS[@]}"; do
  if ! diff <(manifest "${WORK}/node/${i}") <(manifest "${WORK}/bun/${i}"); then
    echo "ERROR: output mismatch for '${COMMANDS[$i]}' (Node vs binary)" >&2
    status=1
  fi
done

if [ "${status}" -eq 0 ]; then
  echo "===== Parity: all commands produced identical output ====="
fi
exit "${status}"
