# Installation

Igir is supported on :fontawesome-brands-windows: Windows, :fontawesome-brands-apple: macOS, :fontawesome-brands-linux: Linux, and every other operating system that [Node.js](https://nodejs.org) supports.

There are a few different installation options offered for Igir with varying levels of technical complexity. Every option will require some baseline understanding of command-line interfaces (CLIs).

## Via downloaded executable

[![GitHub: release](https://img.shields.io/github/v/release/emmercm/igir?label=emmercm/igir&color=%236e5494&logo=github&logoColor=white)](https://github.com/emmercm/igir/releases/latest)
[![Bun](https://img.shields.io/badge/dynamic/regex?url=https%3A%2F%2Fraw.githubusercontent.com%2Femmercm%2Figir%2Frefs%2Fheads%2Fmain%2F.bun-version&search=(.%2B)&replace=v%241&logo=bun&logoColor=white&label=Bun&color=FBF0DF)](https://bun.com/)

The most straightforward way to run Igir is by downloading the latest version from the [GitHub releases](https://github.com/emmercm/igir/releases) page.

Igir does not currently provide an auto-update functionality, but many of the following installation options do.

## Via npm

[![npm: version](https://img.shields.io/npm/v/igir?color=%23cc3534&label=igir&logo=npm&logoColor=white)](https://www.npmjs.com/package/igir)
[![Node.js](https://img.shields.io/node/v/igir?label=Node.js&logo=node.js&logoColor=white&color=339933)](https://nodejs.org/en/download/)

The best way to ensure that you are always running the most up-to-date version of Igir is to run it via [`npx`](https://docs.npmjs.com/cli/v9/commands/npx) (which comes installed with [Node.js](https://nodejs.org/en/download/)):

```shell
npx igir@latest [commands..] [options]
```

for example:

```shell
npx igir@latest copy extract --dat *.dat --input ROMs --output ROMs-Sorted --dir-dat-name
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

!!! tip

    Igir also supports [Bun](https://bun.com/), which typically executes JavaScript faster and with less memory usage. You can run the latest version of Igir like this:

    ```shell
    bunx igir@latest [commands..] [options]
    ```

    Bun is used to compile the executable releases (above).

!!! note

    If you want to help beta test Igir, you can run the most bleeding-edge version (sometimes called a "nightly") with the command:

    ```shell
    npx --yes "https://pkg.pr.new/igir@main" [commands..] [options]
    ```

## Via Homebrew (macOS)

[![Homebrew](https://img.shields.io/badge/dynamic/regex?url=https%3A%2F%2Fraw.githubusercontent.com%2Femmercm%2Fhomebrew-igir%2Frefs%2Fheads%2Fmain%2FFormula%2Figir.rb&search=url%20%22.%2B%3F(%5B0-9.%5D%2B).tgz%22&replace=v%241&logo=homebrew&logoColor=white&label=emmercm/igir/igir&color=be862d)](https://github.com/emmercm/homebrew-igir)
[![Node.js](https://img.shields.io/badge/dynamic/regex?url=https%3A%2F%2Fraw.githubusercontent.com%2FHomebrew%2Fhomebrew-core%2Frefs%2Fheads%2Fmain%2FFormula%2Fn%2Fnode.rb&search=url%20%22.%2B%3F(%5B0-9.%5D%2B)%5C.%5Ba-z.%5D%2B%22&replace=v%241&logo=node.js&logoColor=white&label=Node.js%20(Current)&color=339933)](https://nodejs.org/en/download/)

[Homebrew](https://brew.sh/) is a third-party package manager for macOS. You can install Igir with this command:

```shell
brew install emmercm/igir/igir
```

and then run Igir as if it were any other executable:

```shell
igir copy extract --dat *.dat --input ROMs --output ROMs-Sorted --dir-dat-name
```

Igir can then be updated with _either_ of these commands

```shell
# Update every Homebrew package
brew update

# Update only igir
brew upgrade igir
```

## Via Docker

[![npm: version](https://img.shields.io/npm/v/igir?color=%23cc3534&label=igir&logo=npm&logoColor=white)](https://www.npmjs.com/package/igir)
[![Node.js](https://img.shields.io/badge/dynamic/regex?url=https%3A%2F%2Fresolve-node.vercel.app%2Flts&search=.%2B&logo=node.js&logoColor=white&label=Node.js%20(LTS)&color=339933)](https://nodejs.org/en/download/)

[Docker](https://www.docker.com/) may be useful or required for dedicated servers such as network-attached storage (NAS) devices. There is no officially published Docker image for Igir, but it is easy to use the official Node.js image:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    docker run --interactive --tty --rm ^
      --volume "%cd%:\pwd" ^
      --workdir "/pwd" ^
      node:lts-alpine ^
      npx --yes igir@latest copy zip --dat "*.dat" --input ROMs --output ROMs-Sorted --dir-dat-name
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    docker run --interactive --tty --rm \
      --volume "$PWD:/pwd" \
      --workdir "/pwd" \
      node:lts-alpine \
      npx --yes igir@latest copy zip --dat "*.dat" --input ROMs --output ROMs-Sorted --dir-dat-name
    ```

=== ":simple-linux: Linux"

    ```shell
    docker run --interactive --tty --rm \
      --volume "$PWD:/pwd" \
      --workdir "/pwd" \
      node:lts-alpine \
      npx --yes igir@latest copy zip --dat "*.dat" --input ROMs --output ROMs-Sorted --dir-dat-name
    ```

!!! warning

    Make sure to quote all of your [glob patterns](input/file-scanning.md#glob-patterns)! You want Igir to resolve the patterns against the container's local filesystem, rather than your host OS resolving them.
