#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC2064
trap "cd \"${PWD}\"" EXIT

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
  echo "--------------------------------------------------"
  temp="$(mktemp -d)"
  ./dist/index.js "$@" \
    --dat test/fixtures/dats/* \
    --input test/fixtures/roms/* \
    --input-exclude test/fixtures/roms/discs/* \
    --output "${temp}" \
    -vvv
  ls -al "${temp}"/*
  rm -rf "${temp}"
}

test_igir copy test
test_igir copy extract test
test_igir copy zip test
