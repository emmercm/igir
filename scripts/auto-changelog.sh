#!/usr/bin/env bash
# @param {number=} $1 Terminal width to generate the README at
set -euo pipefail

here="${PWD}"
# shellcheck disable=SC2064
trap "cd \"${here}\"" EXIT
cd "$(dirname "$0")/.."


./node_modules/.bin/auto-changelog --stdout --commit-limit false --unreleased --template ./scripts/auto-changelog-release.hbs
