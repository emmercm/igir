#!/usr/bin/env bash
# @param {string=} $1 Script command: rec, play
set -euo pipefail

here="${PWD}"
# shellcheck disable=SC2064
trap "cd \"${here}\"" EXIT
cd "$(dirname "$0")/.."

DEMO_DIR="demo"


if [[ "${1:-}" == "play" ]]; then
  # shellcheck disable=SC1091
  . demo-magic.sh
  export TYPE_SPEED=15
  export DEMO_PROMPT="$ "
  export DEMO_CMD_COLOR="\033[1;37m"
  export DEMO_COMMENT_COLOR="\033[0;90m"
  cd "${DEMO_DIR}"
  # NOTE(cemmer): these have to be functions, `pei` won't pick up on aliases
  # shellcheck disable=SC2317
  npx() {
    shift # discard "igir@latest"
    node ../dist/index.js "$@" --dat-name-regex-exclude "/3ds|encrypted|headerless|unofficial/i" --disable-cache
  }
  # shellcheck disable=SC2317
  tree() {
    command tree -N -n "$@"
  }
  # BEGIN PLAYBACK

  # README.md, docs/cli.md
#  pei 'tree -L 2 .'
#  echo "" && sleep 2
#  pei 'npx igir@latest copy zip report --dat "No-Intro*.zip" --input ROMs/ --output ROMs-Sorted/ --dir-dat-name --only-retail'
#  echo "" && sleep 2
#  pei 'tree -L 1 ROMs-Sorted/'

  # docs/installation.md - copy extract ROMs-Sorted/
#  pei 'tree -L 2 .'
#  echo "" && sleep 2
#  pei 'npx igir@latest copy extract --dat "*.dat" --input ROMs/ --output ROMs-Sorted/ --dir-dat-name'
#  echo "" && sleep 2
#  pei 'tree -L 2 .'

  # docs/usage/basic.md - copy zip test ROMs-Sorted/
#  pei 'tree .'
#  echo "" && sleep 2
#  pei 'npx igir@latest copy zip test --dat "No-Intro*.zip" --input ROMs/ --output ROMs-Sorted/ --dir-dat-name'
#  echo "" && sleep 2
#  pei "tree ROMs-Sorted/"

  # docs/usage/basic.md - move zip test clean report ROMs-New/
#  pei 'tree .'
#  echo "" && sleep 2
#  pei 'npx igir@latest move zip test clean report --dat "No-Intro*.zip" --input ROMs-New/ --input ROMs-Sorted/ --output ROMs-Sorted/ --dir-dat-name'
#  echo "" && sleep 2
#  pei "tree ROMs-Sorted/"

  # docs/usage/basic.md - copy extract test clean /Volumes/FLASHCART/
#  pei 'tree .'
#  echo "" && sleep 2
#  pei 'npx igir@latest copy extract test clean --dat "No-Intro*.zip" --input "ROMs-Sorted/Nintendo - Game Boy (Parent-Clone)" --output /Volumes/FLASHCART/ --dir-letter --single --prefer-language EN --prefer-region USA,WORLD,EUR,JPN'
#  echo "" && sleep 2
#  pei "tree /Volumes/FLASHCART"

  # docs/usage/basic.md - move extract test --dir-mirror
#  pei 'tree ROMs/'
#  echo "" && sleep 2
#  pei 'npx igir@latest move extract test --input ROMs/ --output ROMs/ --dir-mirror'
#  echo "" && sleep 2
#  pei 'tree ROMs/'

  # docs/usage/basic.md - move extract test --fix-extension
#  pei 'tree ROMs/'
#  echo "" && sleep 2
#  pei 'npx igir@latest move extract test --input ROMs/ --output ROMs/ --dir-mirror --fix-extension always'
#  echo "" && sleep 2
#  pei 'tree ROMs/'

  # END PLAYBACK
  exit 0
fi


# Install the requirements to play commands
if [[ ! -f demo-magic.sh ]]; then
  if [[ -x "$(command -v curl)" ]]; then
    curl https://raw.githubusercontent.com/paxtonhare/demo-magic/master/demo-magic.sh --output demo-magic.sh
  elif [[ -x "$(command -v wget)" ]]; then
    wget --output-document demo-magic.sh https://raw.githubusercontent.com/paxtonhare/demo-magic/master/demo-magic.sh
  fi
fi
if [[ ! -f demo-magic.sh ]]; then
  echo "demo-magic.sh doesn't exist"
  exit 1
fi

# Install asciinema
if [[ ! -x "$(command -v asciinema)" && -x "$(command -v brew)" ]]; then
  brew install asciinema
fi
if [[ ! -x "$(command -v asciinema)" ]]; then
  echo "asciinema isn't installed"
  exit 1
fi

# Install asciinema dependencies
if [[ ! -x "$(command -v pv)" && -x "$(command -v brew)" ]]; then
  brew install pv
fi
if [[ ! -x "$(command -v pv)" ]]; then
  echo "pv isn't installed"
  exit 1
fi

# Ensure node is available
npm --version &> /dev/null || exit 1

# Make sure we're using the latest version
npm run build

# Clean any previous output
rm -rf "${DEMO_DIR}/ROMs-Sorted"
rm -rf "${DEMO_DIR}/"*.csv

clear
if [[ "${1:-}" == "rec" ]]; then
  asciinema rec --cols 115 --command "$0 play"
else
  $0 play
  echo ""
  echo "Execute '$0 rec' if you want to record this"
fi
