#!/usr/bin/env bash
# @param {string=} $1 Script command: rec, play
set -euo pipefail

here="$(pwd)"
# shellcheck disable=SC2064
trap "cd \"${here}\"" EXIT
cd "$(dirname "$0")/.."

DEMO_DIR="demo"


if [[ "${1:-}" == "play" ]]; then
  . demo-magic.sh
  TYPE_SPEED=15
  DEMO_PROMPT="$ "
  DEMO_CMD_COLOR="\033[1;37m"
  DEMO_COMMENT_COLOR="\033[0;90m"
  cd "${DEMO_DIR}"
  npx() {
    shift # discard "igir@latest"
    node ../build/index.js "$@"
  }
  # BEGIN PLAYBACK

  # ts-node ./index.ts copy zip report clean -d demo/dats/ -i GB/ -i NES/ -o demo/roms/ -D
  pei "ls -gn"
  echo "" && sleep 1
  pei "ls -gn dats/"
  echo "" && sleep 1
  pei "npx igir@latest copy zip report --dat dats/ --input roms/ --output roms-sorted/ --dir-dat-name --only-retail"
  echo "" && sleep 1
  pei "ls -gn roms-sorted/"

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

# Ensure node is available (same as .husky/pre-commit)
if [[ ! -x "$(command -v node)" ]]; then
  if [[ ! -x "$(command -v nvm)" && -f ~/.nvm/nvm.sh ]]; then
    . ~/.nvm/nvm.sh
  fi
  if [[ ! -x "$(command -v nvm)" ]]; then
    nvm use || exit 1
  fi
fi
npm --version &> /dev/null || exit 1

# Make sure we're using the latest version
npm run build

# Clean any previous output
if [[ -d "${DEMO_DIR}/roms-sorted" ]]; then
  rm -rf "${DEMO_DIR}/roms-sorted"
fi

clear
if [[ "${1:-}" == "rec" ]]; then
  asciinema rec --command "$0 play"
else
  $0 play
  echo ""
  echo "Execute '$0 rec' if you want to record this"
fi
