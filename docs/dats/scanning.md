# DAT Scanning

[DATs](introduction.md) are provided to Igir with the `--dat <path|glob|url>` option. The option behaves like all other [file scanning](../input/file-scanning.md) options in that:

- You can provide a path to a file or a directory.
- You can provide a [glob pattern](../input/file-scanning.md#glob-patterns).
- Files can be archived (in a [supported format](../input/reading-archives.md)) or unarchived.

!!! tip

    Igir will work the best with every [available command](../commands.md) if you provide it DATs. Without DATs, Igir has to make educated guesses about folder structures and naming patterns.

### Supported DAT formats

There have been many DAT-like formats developed over the years. Igir supports the following:

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

## DAT URLs

The `--dat <path|glob|url>` option is unique in that it can download files from URLs, which can be helpful with files that keep a consistent URL but update on a regular basis. For example:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy ^
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/DOOM.dat" ^
      --input ROMs ^
      --output ROMs-Sorted
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/DOOM.dat" \
      --input ROMs \
      --output ROMs-Sorted
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy \
      --dat "https://raw.githubusercontent.com/libretro/libretro-database/master/dat/DOOM.dat" \
      --input ROMs \
      --output ROMs-Sorted
    ```

!!! note

    Because of the way [DAT-o-MATIC](https://datomatic.no-intro.org/index.php) prepares & serves downloads, you can't use this method for official No-Intro DATs.

## Scanning exclusions

You can ignore certain DAT files from being scanned with the option:

```text
--dat-exclude <path|glob>
```

This can help you exclude DATs that you don't want to process to cut down on processing time or to make your resulting collection smaller.
