# Writing dir2dats

"dir2dat" refers to DATs that have been automatically created based on files in an input directory. [DATs](./introduction.md) generated this way are not typically useful as-is, they usually require some hand editing after creation.

`igir` has the ability to create these DATs with the `igir dir2dat` command. Example:

```shell
igir dir2dat --input <path> [--input <path>..]
```

## dir2dat rules

`igir` uses the following rules when creating dir2dat DAT files:

- **A DAT file will be created for every input path.**

    If multiple input paths overlap, such as:

  === ":simple-windowsxp: Windows"

      ```batch
      igir dir2dat ^
        --input "C:\ROMs" ^
        --input "C:\ROMs\NES"
      ```

  === ":simple-apple: macOS"

      ```shell
      igir dir2dat \
        --input ~/ROMs/ \
        --input ~/ROMs/NES
      ```

  === ":simple-linux: Linux"

      ```shell
      igir dir2dat \
        --input ~/ROMs/ \
        --input ~/ROMs/NES
      ```

  then ROMs can appear in multiple resulting dir2dat files.

  !!! note

      You can use the [`--dat-combine` option](./processing.md#dat-combining) to create only one DAT even when multiple input paths are provided.

- **Each input path's [basename](https://linux.die.net/man/1/basename) will be used for the DAT's name.**

    Here are some examples:

    | Input path                 | DAT name |
    |----------------------------|----------|
    | `--input "ROMs"`           | `ROMs`   |
    | `--input "ROMs/NES"`       | `NES`    |
    | `--input "ROMs/SNES/*"`    | `SNES`   |
    | `--input "ROMs/SNES/**/*"` | `SNES`   |

- **Archive files will be treated as a single game, with every archive entry being a separate ROM.**

    This is consistent with how the [`igir zip` command](../output/writing-archives.md) works, and with what [MAME expects](../usage/arcade.md).

- **The input file's [basename](https://linux.die.net/man/1/basename) (without extension) will be used for the game name.**

  !!! warning

      This will cause input files with the same basename to be grouped together!

## Combining with other options

Once DATs have been generated from input files, they are processed the same as any other DAT file. That means:

- **Parent/clone information may be [inferred](processing.md#parentclone-inference) from game names.**

    If your input files are in some kind of standard naming convention (e.g. [No-Intro](https://wiki.no-intro.org/index.php?title=Naming_Convention), [Redump](https://datomatic.no-intro.org/stuff/The%20Official%20No-Intro%20Convention%20(20071030).pdf), or [TOSEC](https://www.tosecdev.org/tosec-naming-convention)), then parent/clone information can be inferred for [1G1R preferences](../roms/filtering-preferences.md).

    Parent/clone information also allows for [merging & splitting](../usage/arcade.md) of ROM sets.

- **[ROM filter options](../roms/filtering-preferences.md) can be applied.**

  If your input files are in some kind of standard naming convention (e.g. [No-Intro](https://wiki.no-intro.org/index.php?title=Naming_Convention), [Redump](https://datomatic.no-intro.org/stuff/The%20Official%20No-Intro%20Convention%20(20071030).pdf), or [TOSEC](https://www.tosecdev.org/tosec-naming-convention)) that contains region, language, or other tags, then [ROM filter options](../roms/filtering-preferences.md) can be applied.

- **Filename extensions can be corrected.**

    See [ROM Output Options](../output/options.md#fixing-rom-extensions) for more information.

## Alternative tools

It is unlikely that any ROM tool, including `igir`, will ever meet every person's exact DAT creation needs.

[SabreTools](https://github.com/SabreTools/SabreTools) is a great tool for DAT management that offers many complex options for DAT creation, filtering, merging, and splitting.
