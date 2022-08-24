#!/usr/bin/env bash
# @param {string=} $1 Script command: rec, play
set -euo pipefail


if [[ "${1:-}" == "play" ]]; then
  . demo-magic.sh
  TYPE_SPEED=10
  DEMO_PROMPT="$ "
  DEMO_CMD_COLOR="\033[1;37m"
  DEMO_COMMENT_COLOR="\033[0;90m"
  npx() {
    shift
    npm exec -- . "$@"
  }
  alias npx="npm exec -- ."
  # BEGIN PLAYBACK

  pei "npx igir copy zip report --dat dats/ --input roms/ --output roms-sorted/ --only-retail"

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
rm -rf roms-sorted

clear
if [[ "${1:-}" == "rec" ]]; then
  asciinema rec --command "$0 play" --cols 90 --rows 18
else
  $0 play
  echo ""
  echo "Execute '$0 rec' if you want to record this"
fi
