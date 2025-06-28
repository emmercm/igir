# Installation

Igir is supported on :fontawesome-brands-windows: Windows, :fontawesome-brands-apple: macOS, :fontawesome-brands-linux: Linux, and every other operating system that [Node.js](https://nodejs.org) supports.

There are a few different installation options offered for Igir with varying levels of technical complexity. Every option will require some baseline understanding of command-line interfaces (CLIs).

## Via Node.js

[![npm: version](https://img.shields.io/npm/v/igir?color=%23cc3534&label=version&logo=npm&logoColor=white)](https://www.npmjs.com/package/igir)
[![Node.js](https://img.shields.io/node/v/igir?label=Node.js&logo=node.js&logoColor=white)](https://nodejs.org/en/download/)

The best way to ensure that you are always running the most up-to-date version of Igir is to run it via [`npx`](https://docs.npmjs.com/cli/v9/commands/npx) which comes installed with [Node.js](https://nodejs.org/en/download/):

```shell
npx igir@latest [commands..] [options]
```

for example:

```shell
npx igir@latest copy extract --dat *.dat --input ROMs/ --output ROMs-Sorted/ --dir-dat-name
```

<script src="https://asciinema.org/a/ocqHh6Rb5ZUOhswX8PQ4sw57d.js" id="asciicast-ocqHh6Rb5ZUOhswX8PQ4sw57d" async="true"></script>

!!! tip

    You can alias the Igir `npx` command in your macOS or Linux [dotfiles](https://missing.csail.mit.edu/2019/dotfiles/) like this:

    === ":fontawesome-brands-apple: macOS"

        ```bash
        alias igir="npx igir@latest"
        ```

    === ":simple-linux: Linux"

        ```bash
        alias igir="npx igir@latest"
        ```

!!! note

    If you want to help beta test Igir, you can run the most bleeding-edge version with the command:

    ```shell
    npm exec --yes -- "github:emmercm/igir#main" [commands..] [options]
    ```

## Via Homebrew (macOS)

[Homebrew](https://brew.sh/) is a third-party package manager for macOS. You can install Igir with these simple commands:

```shell
brew tap emmercm/igir
brew install igir
```

and then run Igir as if it were any other executable:

```shell
igir copy extract --dat *.dat --input ROMs/ --output ROMs-Sorted/ --dir-dat-name
```

Igir can then be updated with _either_ of these commands

```shell
# Update every Homebrew package
brew update

# Update only igir
brew upgrade igir
```

## Via downloaded executable

[![GitHub: release](https://img.shields.io/github/v/release/emmercm/igir?color=%236e5494&logo=github&logoColor=white)](https://github.com/emmercm/igir/releases/latest)
[![Node.js](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.npmjs.org%2Figir%2Flatest&query=volta.node&logo=node.js&logoColor=white&label=Node.js&color=66cc33)]((https://nodejs.org/en/download/))

If you don't want to download Node.js, you can download executables for various OSes from the [GitHub releases](https://github.com/emmercm/igir/releases) page.
