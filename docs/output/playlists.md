# Writing Multi-Disc Playlists

Most DAT groups that catalog optical media-based consoles (e.g. PS1, Dreamcast, GameCube) consider different discs of a multi-disc game to be separate "games," with no relation between them other than having a similar name. This is because ROM managers may not process games unless all of its ROM files are present, but there may be bonus discs that you don't care about for storage reasons.

Many emulators and frontends support `.m3u` playlist files that group multiple discs together:

- [Batocera](https://wiki.batocera.org/cd_image_formats#multi-disc_games)
- [EmulationStation ES-DE](https://gitlab.com/es-de/emulationstation-de/-/blob/master/USERGUIDE.md#multiple-game-files-installation)
- [libretro (RetroArch)](https://docs.libretro.com/guides/disc-swapping/#using-m3u-playlists)
- [Recalbox](https://wiki.recalbox.com/en/tutorials/games/generalities/multidisc-management-with-m3u)
- [RetroPie](https://retropie.org.uk/docs/Playstation-1/#m3u-playlists-for-cue-bins-or-chds)

!!! note

    Different frontends have different instructions on how to show or hide individual discs when using playlists. See your frontend's documentation for any settings you may need to change.

Grouping multiple discs of the same game together is beneficial for a few reasons:

- Emulators and frontends typically provide an easy way to swap between discs in a playlist
- Save files typically mirror the input ROM's filename, so when using playlists, the save filename is typically named after the playlist and therefore shared among all discs

## `playlist` command

Igir can create `.m3u` playlists for your multi-disc games with the `playlist` command like this:

- For already sorted ROMs that don't need to be copied or moved:

  === ":fontawesome-brands-windows: Windows"

      ```batch
      igir playlist ^
        --dat "Redump*.zip" ^
        --input ROMs\
      ```

  === ":fontawesome-brands-apple: macOS"

      ```shell
      igir playlist \
        --dat "Redump*.zip" \
        --input ROMs/
      ```

  === ":simple-linux: Linux"

      ```shell
      igir playlist \
        --dat "Redump*.zip" \
        --input ROMs/
      ```

- When writing ROMs to an output directory:

  === ":fontawesome-brands-windows: Windows"

      ```batch
      igir copy extract playlist ^
        --dat "Redump*.zip" ^
        --input ROMs\ ^
        --output ROMs-Sorted\
      ```

  === ":fontawesome-brands-apple: macOS"

      ```shell
      igir copy extract playlist \
        --dat "Redump*.zip" \
        --input ROMs/ \
        --output ROMs-Sorted/
      ```

  === ":simple-linux: Linux"

      ```shell
      igir copy extract playlist \
        --dat "Redump*.zip" \
        --input ROMs/ \
        --output ROMs-Sorted/
      ```

!!! note

    The `igir playlist` command uses the same logic to group discs together as the [`--merge-discs` option](../roms/sets.md#merging-multi-disc-games), which means it shares the same suggestions and limitations.

    The `--merge-discs` option isn't required for the `igir playlist` command, but it may be helpful for file grouping.

!!! note

    Most frontends require discs to be extracted before they can be included in `.m3u` playlists. See the [`igir extract` command](../commands.md#extract) for information on how to do this.

## Example scenarios

### Already sorted ROMs

Let's say you already have a well-sorted ROM collection that looks like this:

```text
ROMs/
└── Sony - PlayStation
    ├── Final Fantasy IX (USA) (Disc 1)
    │   ├── Final Fantasy IX (USA) (Disc 1).bin
    │   └── Final Fantasy IX (USA) (Disc 1).cue
    ├── Final Fantasy IX (USA) (Disc 2)
    │   ├── Final Fantasy IX (USA) (Disc 2).bin
    │   └── Final Fantasy IX (USA) (Disc 2).cue
    ├── Final Fantasy IX (USA) (Disc 3)
    │   ├── Final Fantasy IX (USA) (Disc 3).bin
    │   └── Final Fantasy IX (USA) (Disc 3).cue
    ├── Final Fantasy IX (USA) (Disc 4)
    │   ├── Final Fantasy IX (USA) (Disc 4).bin
    │   └── Final Fantasy IX (USA) (Disc 4).cue
    ├── Legend of Dragoon, The (USA) (Disc 1)
    │   ├── Legend of Dragoon, The (USA) (Disc 1).bin
    │   └── Legend of Dragoon, The (USA) (Disc 1).cue
    ├── Legend of Dragoon, The (USA) (Disc 2)
    │   ├── Legend of Dragoon, The (USA) (Disc 2).bin
    │   └── Legend of Dragoon, The (USA) (Disc 2).cue
    ├── Legend of Dragoon, The (USA) (Disc 3)
    │   ├── Legend of Dragoon, The (USA) (Disc 3).bin
    │   └── Legend of Dragoon, The (USA) (Disc 3).cue
    ├── Legend of Dragoon, The (USA) (Disc 4)
    │   ├── Legend of Dragoon, The (USA) (Disc 4).bin
    │   └── Legend of Dragoon, The (USA) (Disc 4).cue
    └── Vagrant Story (USA)
        ├── Vagrant Story (USA).bin
        └── Vagrant Story (USA).cue
```

Igir can automatically generate `.m3u` playlist files for these games without modifying them:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir playlist ^
      --dat "Redump*.zip" ^
      --input ROMs\
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir playlist \
      --dat "Redump*.zip" \
      --input ROMs/
    ```

=== ":simple-linux: Linux"

    ```shell
    igir playlist \
      --dat "Redump*.zip" \
      --input ROMs/
    ```

The resulting files would look like this:

```text
ROMs/
└── Sony - PlayStation
    ├── Final Fantasy IX (USA) (Disc 1)
    │   ├── Final Fantasy IX (USA) (Disc 1).bin
    │   └── Final Fantasy IX (USA) (Disc 1).cue
    ├── Final Fantasy IX (USA) (Disc 2)
    │   ├── Final Fantasy IX (USA) (Disc 2).bin
    │   └── Final Fantasy IX (USA) (Disc 2).cue
    ├── Final Fantasy IX (USA) (Disc 3)
    │   ├── Final Fantasy IX (USA) (Disc 3).bin
    │   └── Final Fantasy IX (USA) (Disc 3).cue
    ├── Final Fantasy IX (USA) (Disc 4)
    │   ├── Final Fantasy IX (USA) (Disc 4).bin
    │   └── Final Fantasy IX (USA) (Disc 4).cue
    ├── Final Fantasy IX (USA).m3u
    ├── Legend of Dragoon, The (USA) (Disc 1)
    │   ├── Legend of Dragoon, The (USA) (Disc 1).bin
    │   └── Legend of Dragoon, The (USA) (Disc 1).cue
    ├── Legend of Dragoon, The (USA) (Disc 2)
    │   ├── Legend of Dragoon, The (USA) (Disc 2).bin
    │   └── Legend of Dragoon, The (USA) (Disc 2).cue
    ├── Legend of Dragoon, The (USA) (Disc 3)
    │   ├── Legend of Dragoon, The (USA) (Disc 3).bin
    │   └── Legend of Dragoon, The (USA) (Disc 3).cue
    ├── Legend of Dragoon, The (USA) (Disc 4)
    │   ├── Legend of Dragoon, The (USA) (Disc 4).bin
    │   └── Legend of Dragoon, The (USA) (Disc 4).cue
    ├── Legend of Dragoon, The (USA).m3u
    └── Vagrant Story (USA)
        ├── Vagrant Story (USA).bin
        └── Vagrant Story (USA).cue
```

The two created playlists will have the contents:

=== "Final Fantasy IX (USA).m3u"

    ```text
    Final Fantasy IX (USA) (Disc 1)/Final Fantasy IX (USA) (Disc 1).cue
    Final Fantasy IX (USA) (Disc 2)/Final Fantasy IX (USA) (Disc 2).cue
    Final Fantasy IX (USA) (Disc 3)/Final Fantasy IX (USA) (Disc 3).cue
    Final Fantasy IX (USA) (Disc 4)/Final Fantasy IX (USA) (Disc 4).cue
    ```

=== "Legend of Dragoon, The (USA).m3u"

    ```text
    Legend of Dragoon, The (USA) (Disc 1)/Legend of Dragoon, The (USA) (Disc 1).cue
    Legend of Dragoon, The (USA) (Disc 2)/Legend of Dragoon, The (USA) (Disc 2).cue
    Legend of Dragoon, The (USA) (Disc 3)/Legend of Dragoon, The (USA) (Disc 3).cue
    Legend of Dragoon, The (USA) (Disc 4)/Legend of Dragoon, The (USA) (Disc 4).cue
    ```

!!! note

    A `.m3u` playlist file was not created for `Vagrant Story (USA)` because it is not a multi-disc game.

### When writing & sorting ROMs

Let's say you haven't sorted your ROM collection yet and want to do that, while writing playlist files at the same time. Your input files might look like this:

```text
ROMs/
├── Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 1 of 2)[!]
│   ├── Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 1 of 2)[!].gdi
│   ├── track01.bin
│   ├── track02.raw
│   └── track03.bin
├── Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 2 of 2)[!]
│   ├── Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 2 of 2)[!].gdi
│   ├── track01.bin
│   ├── track02.raw
│   └── track03.bin
├── Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!]
│   ├── Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!].gdi
│   ├── track01.bin
│   ├── track02.raw
│   └── track03.bin
├── Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!]
│   ├── Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!].gdi
│   ├── track01.bin
│   ├── track02.raw
│   └── track03.bin
└── Typing of the Dead, The v1.004 (2000)(Sega)(US)[!][req. keyboard]
    ├── Typing of the Dead, The v1.004 (2000)(Sega)(US)[!][req. keyboard].gdi
    ├── track01.bin
    ├── track02.raw
    ├── track03.bin
    ├── track04.raw
    └── track05.bin
```

Let's say you also want to use the [`--merge-discs` option](../roms/sets.md#merging-multi-disc-games) to group multiple discs together into one folder:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir move extract playlist ^
      --dat "TOSEC*.zip" ^
      --input ROMs\ ^
      --output ROMs-Sorted\ ^
      --dir-dat-name ^
      --merge-discs
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir move extract playlist \
      --dat "TOSEC*.zip" \
      --input ROMs/ \
      --output ROMs-Sorted/ \
      --dir-dat-name \
      --merge-discs
    ```

=== ":simple-linux: Linux"

    ```shell
    igir move extract playlist \
      --dat "TOSEC*.zip" \
      --input ROMs/ \
      --output ROMs-Sorted/ \
      --dir-dat-name \
      --merge-discs
    ```

The resulting files would look like this:

```text
ROMs-Sorted/
└── Sega Dreamcast - Games - US
    ├── Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)[!]
    │   ├── Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 1 of 2)[!]
    │   │   ├── Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 1 of 2)[!].gdi
    │   │   ├── track01.bin
    │   │   ├── track02.raw
    │   │   └── track03.bin
    │   ├── Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 2 of 2)[!]
    │   │   ├── Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 2 of 2)[!].gdi
    │   │   ├── track01.bin
    │   │   ├── track02.raw
    │   │   └── track03.bin
    │   └── Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)[!].m3u
    ├── Skies of Arcadia v1.002 (2000)(Sega)(US)[!]
    │   ├── Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!]
    │   │   ├── Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!].gdi
    │   │   ├── track01.bin
    │   │   ├── track02.raw
    │   │   └── track03.bin
    │   ├── Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!]
    │   │   ├── Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!].gdi
    │   │   ├── track01.bin
    │   │   ├── track02.raw
    │   │   └── track03.bin
    │   └── Skies of Arcadia v1.002 (2000)(Sega)(US)[!].m3u
    └── Typing of the Dead, The v1.004 (2000)(Sega)(US)[!][req. keyboard]
        ├── Typing of the Dead, The v1.004 (2000)(Sega)(US)[!][req. keyboard].gdi
        ├── track01.bin
        ├── track02.raw
        ├── track03.bin
        ├── track04.raw
        └── track05.bin
```

The two created playlists will have the contents:

=== "Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)[!].m3u"

    ```text
    Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 1 of 2)[!]/Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 1 of 2)[!].gdi
    Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 2 of 2)[!]/Resident Evil - Code Veronica v1.000 (2000)(Capcom)(US)(Disc 2 of 2)[!].gdi
    ```

=== "Skies of Arcadia v1.002 (2000)(Sega)(US)[!].m3u"

    ```text
    Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!]/Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!].gdi
    Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!]/Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!].gdi
    ```

!!! note

    A `.m3u` playlist file was not created for `Typing of the Dead, The v1.004 (2000)(Sega)(US)[!][req. keyboard]` because it is not a multi-disc game.

## ROM extensions

By default, Igir will include only certain file extensions in playlist files. See the `igir --help` message for the default list.

You can override the default extension list with the `--playlist-extensions <exts>` like so:

```text
igir playlist --input ROMs --playlist-extensions ".cue,.gdi"
```
