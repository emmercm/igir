# RetroNAS

[RetroNAS](https://github.com/retronas/retronas) is a network-attached storage (NAS) solution for retro consoles & computers. It stores a single copy of your ROMs, shares them over many old & new network protocols, and symlinks them into the folder structures that other frontends & hardware expect.

## ROMs

RetroNAS uses its own [generic ROM folder structure](https://github.com/retronas/retronas/blob/3748bb37c8df4b56f54ff2b19ff8a042c2b855c6/ansible/retronas_systems.yml) of manufacturer & system folders (e.g. `nintendo/gameboy`), so Igir has a replaceable `{retronas}` token to sort ROMs into the right place. See the [replaceable tokens page](../../output/tokens.md) for more information.

RetroNAS keeps its ROMs in the `roms` folder of its top-level directory, which is `/data/retronas` by default. Because RetroNAS creates the links for other frontends & hardware itself, you should sort your ROMs into this generic folder structure rather than into any frontend's folder structure.

=== ":fontawesome-brands-windows: Windows"

    Replace the `E:\` drive letter with wherever your RetroNAS share is mapped:

    ```batch
    igir copy zip test clean ^
      --dat "No-Intro*.zip" ^
      --input "ROMs" ^
      --output "E:\roms\{retronas}"
    ```

=== ":fontawesome-brands-apple: macOS"

    Replace the `/Volumes/retronas` path with wherever your RetroNAS share is mounted:

    ```shell
    igir copy zip test clean \
      --dat "No-Intro*.zip" \
      --input "ROMs" \
      --output "/Volumes/retronas/roms/{retronas}"
    ```

=== ":simple-linux: Linux"

    Replace the `/data/retronas` path with wherever your RetroNAS share is mounted, if you aren't running Igir on the RetroNAS machine itself:

    ```shell
    igir copy zip test clean \
      --dat "No-Intro*.zip" \
      --input "ROMs" \
      --output "/data/retronas/roms/{retronas}"
    ```
