#!/usr/bin/env bash
# @param {number=} $1 Terminal width to generate the README at
set -euo pipefail

here="$(pwd)"
# shellcheck disable=SC2064
trap "cd \"${here}\"" EXIT
cd "$(dirname "$0")/.."


cols="$(tput cols)"
stty cols "${1:-2147483647}" || true

README="README.md"
(awk 'BEGIN {msg=ARGV[1]; delete ARGV[1]; p=1} /^```help/ {print; print msg; p=0} /^```$/ {p=1} p' \
  "$(./node_modules/.bin/ts-node ./index.ts --help)" \
  "${README}" > "${README}.temp" || exit 1) && mv -f "${README}.temp" "${README}"

stty cols "${cols}" || true
