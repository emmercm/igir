#!/usr/bin/env bash
set -euo pipefail

here="${PWD}"
# shellcheck disable=SC2064
trap "cd \"${here}\"" EXIT

# @param {string} $1 Directory to start from
# @param {string} $2 Filename
parent_find() {
  local dir
  dir="$(realpath "$1")"
  while [[ "${dir}" != "/" ]]; do
    if [[ -e "${dir}/$2" ]]; then
      echo "${dir}"
      return 0
    else
      dir="$(dirname "${dir}")"
    fi
  done
  return 1
}

cd "$(parent_find . "package.json")"

test_igir() {
  temp="$(mktemp -d)"
  ./dist/index.js "$@" \
    --dat test/fixtures/dats/* \
    --input test/fixtures/roms/* \
    --output "${temp}"
  ls "${temp}"/* &> /dev/null
  rm -rf "${temp}"
}

test_igir copy test
test_igir copy zip test
