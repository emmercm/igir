# DAT Processing

Igir has a number of ways it can process [DATs](./introduction.md), and it processes them in the following order.

## Just tell me what to do

[DATs](./introduction.md) can get fairly complicated, and there are many release groups, each with their own focus areas and naming patterns. If all you want to do is organize your ROMs with Igir in some consistent way, follow these instructions:

1. Go to the No-Intro DAT-o-MATIC [daily download page](https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily)
2. Select the "P/C XML" radio option (as opposed to "standard DAT") and download the `.zip` to wherever you store your ROMs
3. Every time you run Igir, specify the `.zip` file you downloaded with the `--dat <path>` option:

  ```shell
  igir [commands..] --dat "No-Intro*.zip" --input <input>
  ```

## Scanning for DATs

The `--dat <path>` option supports files, archives, directories, and globs like any of the other file options. See the [file scanning page](../input/file-scanning.md) for more information.

Igir also supports URLs to DAT files and archives. This is helpful to make sure you're always using the most up-to-date version of a DAT hosted on sites such as GitHub. For example:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy ^
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/DOOM.dat" ^
      --input ROMs\ ^
      --output ROMs-Sorted\
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/DOOM.dat" \
      --input ROMs/ \
      --output ROMs-Sorted/
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/DOOM.dat" \
      --input ROMs/ \
      --output ROMs-Sorted/
    ```

!!! note

    Because of the way [DAT-o-MATIC](https://datomatic.no-intro.org/index.php) prepares & serves downloads, you can't use this method for official No-Intro DATs.

### Supported DAT formats

There have been a few DAT-like formats developed over the years. Igir supports the following:

- [Logiqx XML](https://github.com/SabreTools/SabreTools/wiki/DatFile-Formats#logiqx-xml-format) (most common) (No-Intro, Redump, TOSEC, and more)
- [MAME ListXML](https://easyemu.mameworld.info/mameguide/command_line/frontend_commands/listxml.html) (XML exported by the `mame -listxml` command)

  !!! tip

      Instead of exporting the ListXML to a file yourself, you can also specify a MAME executable for the DAT path and then Igir is smart enough to parse it:

      === ":fontawesome-brands-windows: Windows"

          Windows is fairly easy, MAME is officially compiled for Windows and downloads can be found on many mirror sites.

          ```batch
          igir [commands..] --dat "mame0258b_64bit.exe" --input <input>
          ```

      === ":fontawesome-brands-apple: macOS"

          MAME isn't officially compiled for macOS, you will have to use a third-party release such as [SDL MAME](https://sdlmame.lngn.net/).

          ```shell
          igir [commands..] --dat "mame0258-x86/mame" --input <input>
          ```

      === ":simple-linux: Linux"

          Most distros (Ubuntu, Debian, Fedora, etc.) have MAME in their package repositories, but some will require you to compile MAME yourself. If the `mame` executable is in your `$PATH`, you can specify its path like this:

          ```shell
          igir [commands..] --dat "$(which "mame")" --input <input>
          ```

- [MAME software lists](https://docs.mamedev.org/contributing/softlist.html) (XML exported by the `mame -getsoftlist` command)
- [ClrMamePro](http://www.logiqx.com/DatFAQs/CMPro.php) (libretro, DOSCenter, and more)
- [Hardware Target Game Database](https://github.com/frederic-mahe/Hardware-Target-Game-Database) SMDBs

!!! tip

    In case you come across a DAT in a format that Igir doesn't support, SabreTools supports reading [a number of obscure formats](https://github.com/SabreTools/SabreTools/wiki/DatFile-Formats) and converting them to more standard formats such as Logiqx XML.

## DAT filtering

To be able to process only the DATs you want in downloaded archives, Igir has a few filtering options.

### DAT name regex filtering

```text
--dat-name-regex <pattern|filename>, --dat-name-regex-exclude <pattern|filename>
```

These options limit which DATs are processed. The regex is applied to the DAT's name found within its file contents, not its filename.

Regex flags can be optionally provided in the form `/<pattern>/<flags>`, for example:

```text
Headerless|Encrypted
/headerless|encrypted/i
```

!!! tip

    `--dat-name-regex-exclude <pattern|filename>` is particularly helpful for excluding some No-Intro DATs versions such as "encrypted" and "headerless".

### DAT description regex filtering

```text
--dat-description-regex <pattern|filename>, --dat-description-regex-exclude <pattern|filename>
```

These options limit which DATs are processed. The regex is applied to the DAT's description found within its file contents.

## DAT combining

The `--dat-combine` option lets you combine every game from every parsed DAT into one file.

This may be desirable when creating a [dir2dat](./dir2dat.md), a [fixdat](fixdats.md), or other complicated situations.

!!! note

    Using this option with the [`igir zip` command](../output/writing-archives.md) will result in all ROMs in a DAT being archived into one file. This can work great for archiving older, cartridge-based consoles with smaller ROM sizes, but will likely not work well with larger ROMs.

    To keep files organized in a human-readable way, it is _not_ recommended to use the [`--dir-game-subdir never`](../output/path-options.md#append-the-game-name) option combined with `--dat-combine`.

## Parent/clone inference

One feature that sets Igir apart from other ROM managers is its ability to infer parent/clone information when DATs don't provide it. For example, Redump DATs don't provide parent/clone information, which makes it much more difficult to create 1G1R sets.

For example, all of these Super Smash Bros. Melee releases should be considered the same game, even if a DAT doesn't provide proper information. If the releases are all considered the same game, then the `--single` option can be used in combination with [ROM preferences](../roms/filtering-preferences.md) to make a 1G1R set. Igir is smart enough to understand that the only differences between these releases are the regions, languages, and revisions.

```text
Super Smash Bros. Melee (Europe) (En,Fr,De,Es,It)
Super Smash Bros. Melee (Korea) (En,Ja)
Super Smash Bros. Melee (USA) (En,Ja)
Super Smash Bros. Melee (USA) (En,Ja) (Rev 1)
Super Smash Bros. Melee (USA) (En,Ja) (Rev 2)
```

!!! note

    If a DAT has any parent/clone information then Igir will use that and skip inference. If you want to ignore this information, you can provide the `--dat-ignore-parent-clone` option.

!!! note

    It is unlikely that Igir will ever be perfect with inferring parent/clone information. If you find an instance where Igir made the wrong choice, please create a [GitHub issue](https://github.com/emmercm/igir/issues).

!!! tip

    [Retool](https://github.com/unexpectedpanda/retool) (no longer maintained) is a DAT manipulation tool that has a set of hand-maintained [parent/clone lists](https://github.com/unexpectedpanda/retool-clonelists-metadata) to supplement common DAT groups such as No-Intro and Redump. This helps cover situations such as release titles in different languages that would be hard to group together automatically.

    1G1R DATs made by Retool can be used seamlessly with Igir. You won't need to supply the `--single` option or any [ROM preferences](../roms/filtering-preferences.md) for Igir, as you would have already applied these preferences in Retool, but you can still supply [ROM filtering](../roms/filtering-preferences.md) options if desired.
