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

=== ":fontawesome-brands-windows: Windows"

=== ":fontawesome-brands-apple: macOS"

=== ":simple-linux: Linux"

```shell
npx igir@latest [commands..] [options]
```

for example:

=== ":fontawesome-brands-windows: Windows"

=== ":fontawesome-brands-apple: macOS"

=== ":simple-linux: Linux"

```shell
npx igir@latest copy extract --dat *.dat --input ROMs --output ROMs-Sorted --dir-dat-name
```

<script src="https://asciinema.org/a/ocqHh6Rb5ZUOhswX8PQ4sw57d.js" id="asciicast-ocqHh6Rb5ZUOhswX8PQ4sw57d" async="true"></script>

!!! tip

    You can alias the Igir `npx` command in your macOS or Linux [dotfiles](https://missing.csail.mit.edu/2019/dotfiles/) like this:

    === ":fontawesome-brands-apple: macOS"

    === ":simple-linux: Linux"

    ```bash
    alias igir="npx igir@latest"
    ```

!!! tip

    Igir also supports [Bun](https://bun.com/), which typically executes JavaScript faster and with less memory usage. You can run the latest version of Igir like this:

    === ":fontawesome-brands-windows: Windows"

    === ":fontawesome-brands-apple: macOS"

    === ":simple-linux: Linux"

    ```shell
    bunx igir@latest [commands..] [options]
    ```

    Bun is used to compile the executable releases (above).

!!! note

    If you want to help beta test Igir, you can run the most bleeding-edge version (sometimes called a "nightly") with the command:

    === ":fontawesome-brands-windows: Windows"

    === ":fontawesome-brands-apple: macOS"

    === ":simple-linux: Linux"

    ```shell
    npx --yes "https://pkg.pr.new/igir@main" [commands..] [options]
    ```

## Via Homebrew (macOS, Linux)

[![Homebrew](https://img.shields.io/badge/dynamic/regex?url=https%3A%2F%2Fraw.githubusercontent.com%2Femmercm%2Fhomebrew-igir%2Frefs%2Fheads%2Fmain%2FFormula%2Figir.rb&search=url%20%22.%2B%3F(%5B0-9.%5D%2B).tgz%22&replace=v%241&logo=homebrew&logoColor=white&label=emmercm/igir/igir&color=be862d)](https://github.com/emmercm/homebrew-igir)
[![Node.js](https://img.shields.io/badge/dynamic/regex?url=https%3A%2F%2Fraw.githubusercontent.com%2FHomebrew%2Fhomebrew-core%2Frefs%2Fheads%2Fmain%2FFormula%2Fn%2Fnode.rb&search=url%20%22.%2B%3F(%5B0-9.%5D%2B)%5C.%5Ba-z.%5D%2B%22&replace=v%241&logo=node.js&logoColor=white&label=Node.js%20(Current)&color=339933)](https://nodejs.org/en/download/)

[Homebrew](https://brew.sh/) is a third-party package manager for macOS. You can install Igir with this command:

=== ":fontawesome-brands-apple: macOS"

=== ":simple-linux: Linux"

```shell
brew trust emmercm/igir
brew install emmercm/igir/igir
```

and then run Igir as if it were any other executable:

=== ":fontawesome-brands-apple: macOS"

=== ":simple-linux: Linux"

```shell
igir copy extract \
  --dat *.dat \
  --input ROMs \
  --output ROMs-Sorted \
  --dir-dat-name
```

Igir can then be updated with _either_ of these commands

=== ":fontawesome-brands-apple: macOS"

=== ":simple-linux: Linux"

```shell
# Update every Homebrew package
brew update

# Update only igir
brew upgrade igir
```

## Via Scoop (Windows)

[![Scoop](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Femmercm%2Figir%2Frefs%2Fheads%2Fmain%2Fbucket%2Figir.json&query=version&prefix=v&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjMzMi44NiAyNTMuNjMgMjE2Mi43IDIzMjEuMiIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCB0cmFuc2Zvcm09Im1hdHJpeCguMTU0MzMgMCAwIC0uMTU0MzMgMCAyODI5LjMpIiBkPSJtMTM5MzYgMTUyOTJjNzUuOSAyMzguOSAxNTUgNDg0IDMxMy4zIDY3OC40IDE1OC4yIDE5NC40IDQxNiAzMjkuMSA2NTkuNSAyNjkuNiAxNjguNi00MS4xIDMxNi4zLTE4OSAzMjIuNC0zNjIuNSAzLjEtODguOC0yOC44LTE3NC41LTYwLjUtMjU3LjQtMzc1LjItOTc5LjYtMTczNS40LTM4NzAtMjAxOS4xLTQzMzkuMS05NC0xNTUuNC03NjgtMTMzMC40LTgxOC03MDIuMS04LjUgMTA3LjYgMjUuMSAyMTMuNiA1OC4zIDMxNi4zIDE2MCA0OTUuOCAzMTkuOSA5OTEuMyA0ODEuMyAxNDg2LjUgMzIxLjcgOTg2LjQgNzUxLjcgMTkzMC40IDEwNjIuOCAyOTEwLjMiIGZpbGw9IiM3Yzc5ODQiLz48cGF0aCB0cmFuc2Zvcm09Im1hdHJpeCguMTU0MzMgMCAwIC0uMTU0MzMgMCAyODI5LjMpIiBkPSJtMTM5MzYgMTUyOTJjNzUuOSAyMzguOSAxNTUgNDg0IDMxMy4zIDY3OC40IDE1OC4yIDE5NC40IDQxNiAzMjkuMSA2NTkuNSAyNjkuNiAxNjguNi00MS4xIDMxNi4zLTE4OSAzMjIuNC0zNjIuNSAzLjEtODguOC0yOC44LTE3NC41LTYwLjUtMjU3LjQtMzc1LjItOTc5LjYtMTczNS40LTM4NzAtMjAxOS4xLTQzMzkuMS05NC0xNTUuNC03NjgtMTMzMC40LTgxOC03MDIuMS04LjUgMTA3LjYgMjUuMSAyMTMuNiA1OC4zIDMxNi4zIDE2MCA0OTUuOCAzMTkuOSA5OTEuMyA0ODEuMyAxNDg2LjUgMzIxLjcgOTg2LjQgNzUxLjcgMTkzMC40IDEwNjIuOCAyOTEwLjMiIGZpbGw9IiM3Yzc5ODQiLz48cGF0aCB0cmFuc2Zvcm09Im1hdHJpeCguMTU4MDMgMCAwIC0uMTU4MDMgMCAyODI5LjMpIiBkPSJtNTE5OC43IDE2MTY1Yy0zMi42IDY4LTk1LjY2IDEzMS40LTE3MC45NyAxMzMuNS00My4zNiAxLjItODIuNTktMjIuNi0xMjEuNDctNDEuOC00MTcuMjMtMjA2LjMtODQxLjI5LTM2OC4zLTEyNDEuNi01OTIuNi0zMi4xNC0xOC02Ny4wNC0zOS4zLTc3LjgxLTc0LjYtOC43Ni0yOC42LTAuOTktNjAgMTAuNDQtODcuOCA4OTkuNDUtMjE4Ni44IDIwMTcuMi00OTk4LjUgMjU5MC42LTY0MTQuOWwxNTYzLjggNTc2LjkyYy01NDguOTMgMTkwMC0yMzE3LjEgNjAwOS41LTI1NTMgNjUwMS4zIiBmaWxsPSIjOWM2YjY2Ii8%2BPHBhdGggdHJhbnNmb3JtPSJtYXRyaXgoLjE1ODAzIDAgMCAtLjE1ODAzIDAgMjgyOS4zKSIgZD0ibTUxOTguNyAxNjE2NWMtMzIuNiA2OC05NS42NiAxMzEuNC0xNzAuOTcgMTMzLjUtNDMuMzYgMS4yLTgyLjU5LTIyLjYtMTIxLjQ3LTQxLjgtNDE3LjIzLTIwNi4zLTg0MS4yOS0zNjguMy0xMjQxLjYtNTkyLjYtMzIuMTQtMTgtNjcuMDQtMzkuMy03Ny44MS03NC42LTguNzYtMjguNi0wLjk5LTYwIDEwLjQ0LTg3LjggODk5LjQ1LTIxODYuOCAyMDE3LjItNDk5OC41IDI1OTAuNi02NDE0LjlsMTU2My44IDU3Ni45MmMtNTQ4LjkzIDE5MDAtMjMxNy4xIDYwMDkuNS0yNTUzIDY1MDEuMyIgZmlsbD0iIzljNmI2NiIvPjxwYXRoIHRyYW5zZm9ybT0ibWF0cml4KC4xMzc0IDAgMCAtLjEzNzQgMCAyODI5LjMpIiBkPSJtMzk2MiAxNjE5NGMtNjEuMTMgNjEuNC0xNTMuNjQgMTA2LjQtMjM2LjI0IDgwLjEtNDcuNTEtMTUuMS04MS4wOC01NS44LTExNi4wMS05MS40LTM3NC45LTM4Mi4xLTc3My45NS03MTguNy0xMTIzLjctMTExNC0yOC4xMi0zMS43LTU3LjkxLTY4LjEtNTYuMjUtMTEwLjUgMS4zMy0zNC40IDIxLjctNjUuNiA0NC41OC05MS40IDE4MDUuNC0yMDMzLjYgNDA4NC42LTQ2NjMuMiA1MjQ0LTU5ODMuOWwxNDc5LjQgMTIxOS4xYy0xMzE2IDE4NTUuMS00NzkzLjMgNTY0Ny4zLTUyMzUuOCA2MDkyIiBmaWxsPSIjOWM2YjY2Ii8%2BPHBhdGggdHJhbnNmb3JtPSJtYXRyaXgoLjE0ODA3IDAgMCAtLjE0ODA3IDAgMjgyOS4zKSIgZD0ibTc4NjQuOSAxNTI1OGMtOTU0LjQ1LTg2MS42LTEzMjMuNy0yMTcxLjktOTAxLjE0LTMzOTMuMyAxMjIuNjEtMzU0LjQgMzEzLjI0LTY4OS43IDU4My40NS05NDkuOCAzNjkuMjgtMzU1LjMgODY2LjEtNTUxLjUgMTM2Ny41LTY1Ny43IDgwNi42NC0xNzEgMTg2MC44LTE1MCAyNjI0IDE2Mi40IDc2My4xIDMxMi40IDEyMjAuOSA2NDQuMiAxNTY1LjIgMTM5My41IDM0NC40IDc0OS4zIDM2MS43IDE5MzcuMi0xNS4yIDI2NzAuNi0zMTcuOCA2MTguNi04OTEuNCAxMDg3LjgtMTUzOS44IDEzMzkuMS0xMjMxIDQ3Ny4zLTI1ODYgMzc3LjItMzYxNi45LTUwNS43LTIyLjY5LTE5LjUtNDUuMS0zOS4yLTY3LjE3LTU5LjEiIGZpbGw9IiNmNjgzYjEiLz48cGF0aCB0cmFuc2Zvcm09Im1hdHJpeCguMTMzMzMgMCAwIC0uMTMzMzMgMCAyODI5LjMpIiBkPSJtMTM2NDAgMzAwOC43Yy02MjYuNiAxMjYuOS0xMjk5LjkgMTI5LjMtMTkzNiAxNTMuMi04ODIuNCAzMy4xLTE4MDYuNyA2Ni43LTI2NzguMi0xMDIuMi0yMTMuODQtNDEuNS02OTEuMDUtMTY3LTcxMS4wMy00NDctMjMuNjgtMzMyLjUgNTcyLjM3LTQxNy4zIDgwMi4xOC00NjAgNjU4LjM3LTEyMiAxMzMxLjgtMTk0LjEgMTk5OS44LTIyNS42IDg3My4xLTQxLjQgMTc1Ni0xNC44IDI2MjEuNSAxMTEuNyAyMTYgMzEuNSA2NzYuNiAxNDMuMyA3NjIuNCAzNzcuNiAxNTguMSA0MzIuMi01NzkuMiA1MzMuNi04NTYuNyA1OTEuNHoiIGZpbGw9IiMzYTM3NDEiLz48cGF0aCB0cmFuc2Zvcm09Im1hdHJpeCguMTUzMDggMCAwIC0uMTUzMDggMCAyODI5LjMpIiBkPSJtMzExNi44IDkwNzguNGM2NjcuMDMtMTYxOS40IDEzMDEuOS0yODY1LjMgMTk4MC44LTM5NDEuNyA4ODIuNDMtMTM5OS41IDE4ODkuNS0yMTQ3LjggMjkwNy41LTI1NDAuNCAxNTk0LjEtNjE0LjY1IDM5MTkuNC01OTcuMDYgNTQ5NCAxMTU4LjMgMzkzIDQzNy45MyA3NTUuMSA5OTAuNTcgMTEwNy4yIDE2MDMuNCA1OTcuNyAxMDQwLjQgMTE0NC4zIDIyNjUuMSAxNjkzLjcgMzcyMC40eiIgZmlsbD0iIzZjNjg3NiIvPjxwYXRoIHRyYW5zZm9ybT0ibWF0cml4KC4xMzMzMyAwIDAgLS4xMzMzMyAwIDI4MjkuMykiIGQ9Im0zNTc4LjUgMTA0MjNjNzY1Ljc5LTE4NTkuMyAxNDk0LjctMzI4OS43IDIyNzQuMS00NTI1LjYgMjg0LjE5LTQ1MC44IDU3NS4xNC04MzcuNCA4NzAuMy0xMTcxIDYxMC44Ni0zMzMuMiAxMjM0LjUtNDY2LjIgMTc2NS4yLTI1NS4xIDYxMS45NCAyNDMuMyA5OTcuODEgOTQ4LjMgMTIzNi40IDE4NjIuOSAyODMuMjggMTA4NS40IDQxNS43OCAyNTExLjIgNDAyLjQ4IDQwODguOHoiIGZpbGw9IiM3Yzc5ODQiLz48cGF0aCB0cmFuc2Zvcm09Im1hdHJpeCguMTUzMDggMCAwIC0uMTUzMDggMCAyODI5LjMpIiBkPSJtMTQ0NzggOTA3OC40Yy03MS42LTI1NS44OS0xNDQuOC01MDQuODItMjIwLjEtNzQ2LjUxLTQzNi4xLTEzOTkuMy05NTYtMjYxNi0xNTY3LjgtMzQ5Ni45LTU5NC4yLTg1NS40OC0xMjc0LjYtMTM2Ni4yLTE5NzQuMS0xNjIwLjEtNzY4LjkxLTI3OS4xNS0xNTcxLjUtMjc4LjM2LTIzNTEtMTgzLjE2LTY0OC4wNiA3OS4wOC0xMzMzIDIyNC4wMS0yMDEwLjUgNTgwLjMzIDUyNS45LTQ3Mi4yNCAxMDgzLjEtNzk3LjEyIDE2NTAuMS0xMDE1LjcgMTU5NC4xLTYxNC42NSAzOTE5LjQtNTk3LjA2IDU0OTQuMiAxMTU4LjMgMzkyLjkgNDM3LjkzIDc1NSA5OTAuNTcgMTEwNy4xIDE2MDMuNCA1OTcuNyAxMDQwLjQgMTE0NC4zIDIyNjUuMSAxNjkzLjcgMzcyMC40eiIgZmlsbD0iIzQzM2Y0YyIvPjxwYXRoIHRyYW5zZm9ybT0ibWF0cml4KC4xMzMzMyAwIDAgLS4xMzMzMyAwIDI4MjkuMykiIGQ9Im03MDg0LjUgNTI3My43YzEzMi42Mi0xNDcuMiAyNzUuMTgtMjkzLjQgNDQ2LjgyLTM1OC41IDI5LjY2LTExLjMgNjIuODUtMTkuNyA4OS44OS00IDY1LjgyIDM4LjIgMzAuNiAxNTcuOC0xMS41IDIzMy4xLTg4MC42MyAxNTc1LjUtMTQwNy40IDMzMTQtMTg0My44IDUwOTUuNi0yNSAxMDItNTIuMjggMjA4LjctMTE1LjUyIDI4Ni4yLTEwNC4zMiAxMjcuNy0yNzEuMTggMTM2LjQtNDE2LjY2IDEyMS4xLTEyMy4zNi0xMi45LTI0NS41LTM2LjUtMzY1LjA3LTcwLjUtNDYuNDctMTMuMi05NC4wMi0yOC44LTEzMC4yNy02NC40LTY4LjktNjcuNS03OS41Ni0xODcuMy03OC42My0yOTUuNCA0Ljc3LTUzNi40IDI0Ni45MS0xMTM5IDQzNS4zNy0xNjI5LjggMjg2LjUxLTc0NS45IDY4Ni45LTE1MjUuMyAxMTEyLjUtMjE3My42IDI2Ni4zNS00MDUuNyA1NTkuNjUtNzg3LjcgODc2Ljg3LTExMzkuOCIgZmlsbD0iI2Q2ZDRkYiIvPjxwYXRoIHRyYW5zZm9ybT0ibWF0cml4KC4xNTMxIDAgMCAtLjE1MzEgMCAyODI5LjMpIiBkPSJtMTYzMDAgOTA5Ni42YzAtNTUxLjc4LTI5NTEuOS05OTkuMDYtNjU5My4zLTk5OS4wNi0zNjQxLjQgMC02NTkzLjMgNDQ3LjI4LTY1OTMuMyA5OTkuMDYgMCA1NTEuNzkgMjk1MS45IDk5OS4wNSA2NTkzLjMgOTk5LjA1IDM2NDEuNCAwIDY1OTMuMy00NDcuMjYgNjU5My4zLTk5OS4wNSIgZmlsbD0iIzdjNzk4NCIvPjxwYXRoIHRyYW5zZm9ybT0ibWF0cml4KC4xMzMzMyAwIDAgLS4xMzMzMyAwIDI4MjkuMykiIGQ9Im0xMTU3MyA5NjE5LjhjLTE0MS41LTAuOS0yODMuOC0xLjQtNDI3LjEtMS40LTg3LjggMC0xNzUuNiAwLTI2MyAwLjUtMjQyMi41IDEwLjItNDUzNC45IDE2Mi4yLTU3NDUuOSAzODcuMy0yMDkuNCAzOC45LTM5Mi4wMSA4MC01NDQuNTUgMTIzbC03Ljg0IDIuM2MtMzcuOTEgMjAzLjgtNTYuODYgNDA4LjEtNTcuNzggNjExLjEtNi40OSA5OTYuNSA0MjEuNTcgMTk1OS4zIDExOTQuOSAyNjU3LjMgMjQuNDUgMjIuMiA0OS40NSA0My45IDc0LjgzIDY1LjYgMTE0Ni44IDk4Mi4yIDI2NTQuMSAxMDkzLjYgNDAyMy43IDU2Mi42IDYxOC40NS0yMzkuOSAxMTc1LjQtNjU3LjMgMTU0NC44LTEyMDUuNSA2MS41LTkxLjEgMTE3LjktMTg2LjMgMTY4LjMtMjg0LjMgMTgyLjUtMzU1IDI4MS45LTgwNS4yIDMwNC42LTEyNjkuNyAyOC4xLTU4MS41LTYzLjgtMTE4NC43LTI2NC45LTE2NDguOCIgZmlsbD0iI2ViZWRhNyIvPjxwYXRoIHRyYW5zZm9ybT0ibWF0cml4KC4xNDc1IDAgMCAtLjE0NzUgMCAyODI5LjMpIiBkPSJtMTYyNDUgOTY0NC4xYy0xMy40LTE0Ny4wNi0zNS4xLTI5MS42LTY1LjItNDMwLjctMTEuNy00LjI1LTI0LjItOC43Ny0zNi43LTEyLjkzLTY0LjQtMjIuMjMtMTM3LjktNDMuNDgtMjE5LTY0LjgxLTk1Mi4xLTI0Ny4zMS0zMDI0LjQtNDIzLjItNTQ2My42LTQ0MC4zOC0xMjcuOS0wLjgxLTI1Ni41LTEuMjctMzg2LTEuMjctNzkuNCAwLTE1OC43NiAwLTIzNy43NiAwLjQ2bC0yLjUzIDcuNWMtMTcwLjQ4IDQ5Mi42Mi0yMTIuNiA5OTkuMzUtMTM5LjU3IDE0ODUuNyA3NC44NSA1MDIuNiAyNzIuNDQgOTgyLjcgNTc3Ljg2IDE0MDIuNiAxMzQuNSAxODUuNSAyOTAuOCAzNTkuMyA0NjYuMiA1MTguMSAyMi4zIDIwIDQ0LjggMzkuNyA2Ny4zIDU5LjMgMTAzNC45IDg4Ni4yIDIzOTQuOSA5ODYuNCAzNjMwLjggNTA3LjYgNjUwLjktMjUyLjMgMTIyNi42LTcyMy4yIDE1NDUuNS0xMzQ0IDIzNS4xLTQ1OCAzMTcuNC0xMDkyLjIgMjYyLjctMTY4Ny4yIiBmaWxsPSIjODk3MWIzIi8%2BPC9zdmc%2B&label=emmercm%2Figir&color=7c7984)](https://github.com/emmercm/igir/tree/main/bucket)
[![Bun](https://img.shields.io/badge/dynamic/regex?url=https%3A%2F%2Fraw.githubusercontent.com%2Femmercm%2Figir%2Frefs%2Fheads%2Fmain%2F.bun-version&search=(.%2B)&replace=v%241&logo=bun&logoColor=white&label=Bun&color=FBF0DF)](https://bun.com/)

[Scoop](https://scoop.sh/) is a third-party command-line installer for Windows. You can install Igir with this command:

=== ":fontawesome-brands-windows: Windows"

```shell
scoop bucket add igir https://github.com/emmercm/igir
scoop install igir
```

and then run Igir as if it were any other executable:

=== ":fontawesome-brands-windows: Windows"

```batch
igir copy extract ^
  --dat *.dat ^
  --input ROMs ^
  --output ROMs-Sorted ^
  --dir-dat-name
```

Igir can then be updated with _either_ of these commands:

=== ":fontawesome-brands-windows: Windows"

```shell
# Update every Scoop app
scoop update *

# Update only igir
scoop update igir
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
