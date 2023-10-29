#!/usr/bin/env bash
# @param {number=} $1 Terminal width to generate the README at
set -euo pipefail

here="${PWD}"
# shellcheck disable=SC2064
trap "cd \"${here}\"" EXIT
cd "$(dirname "$0")/.."


README="README.md"
HELP="\$ igir --help

$(npm start --silent -- --help "${1:-97}" | sed 's/ *$//g')"
(awk 'BEGIN {msg=ARGV[1]; delete ARGV[1]; p=1} /^```help/ {print; print msg; p=0} /^```$/ {p=1} p' \
  "${HELP}" \
  "${README}" > "${README}.temp" || exit 1) && mv -f "${README}.temp" "${README}"
