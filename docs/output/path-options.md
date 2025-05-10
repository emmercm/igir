# Output Path Options

Igir offer many options to control how ROMs are sorted in the specified output directory.

All `--dir-*` options append subdirectories to whatever is specified in the `--output <path>` option. Many `--dir-*` options have an [output path token](./tokens.md) equivalent, which also controls how ROMs are sorted.

Multiple options can be combined, and they will be appended to the output directory in the following order:

## Mirror the input subdirectory

```text
--dir-mirror
```

This option mirrors the subdirectory structure of where ROMs were found in one of the input directories.

For example, if this is the input directory structure:

```text
ROMs-Input/
└── gb
    ├── mario
    │   ├── mario land 2.gb
    │   └── mario land.gb
    └── pokemon
        ├── pokemon blue.gb
        ├── pokemon red.gb
        └── pokemon yellow.gb
```

when combined with a [DAT](../dats/introduction.md), the ROMs will be written with a standardized name, but the output subdirectory structure will match the input:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy ^
      --dat "No-Intro*.zip" ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-mirror
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy \
      --dat "No-Intro*.zip" \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-mirror
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy \
      --dat "No-Intro*.zip" \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-mirror
    ```

```text
ROMs-Output/
└── gb
    ├── mario
    │   ├── Super Mario Land (World) (Rev 1).gb
    │   └── Super Mario Land 2 - 6 Golden Coins (USA, Europe) (Rev 2).gb
    └── pokemon
        ├── Pokemon - Blue Version (USA, Europe) (SGB Enhanced).gb
        ├── Pokemon - Red Version (USA, Europe) (SGB Enhanced).gb
        └── Pokemon - Yellow Version - Special Pikachu Edition (USA, Europe) (CGB+SGB Enhanced).gb
```

!!! tip

    This option is best used to preserve some sort of manual sorting, otherwise you will probably want to combine some of the below options instead.

## Mirror the DAT subdirectory

```text
--dir-dat-mirror
```

This option mirrors the subdirectory structure of where DATs were found in one of the DAT directories.

For example, if this is the DAT directory structure:

```text
DATs/
├── No-Intro Love Pack (PC) (2025-05-09)
│   └── No-Intro
│      ├── Sega - Game Gear (Parent-Clone) (20241203-185356).dat
│      ├── Sega - Master System - Mark III (Parent-Clone) (20241225-050512).dat
│      ├── Sega - Mega Drive - Genesis (Parent-Clone) (20250210-102212).dat
│      └── ...
└── Redump (2025-05-09)
    ├── Sony - PlayStation - Datfile (10853) (2025-05-09 17-16-34).dat
    ├── Sony - PlayStation 2 - Datfile (11623) (2025-05-09 15-01-56).dat
    ├── Sony - PlayStation - Datfile (10853) (2025-05-09 17-16-34).dat
    └── ...
```

ROMs that are matched to one of those DATs will use the DAT's relative dirname in the output directory.

For example, given a command such as:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy ^
      --dat "DATs\" ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-mirror
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy \
      --dat "DATs/" \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-mirror
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy \
      --dat "DATs/" \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-mirror
    ```

you would get a result similar to:

```text
ROMs-Output/
├── No-Intro Love Pack (PC) (2025-05-09)
│   └── No-Intro
│       ├── Alex Kidd in Miracle World (USA, Europe, Brazil) (En) (Rev 1).sms
│       ├── Earthworm Jim 2 (USA).md
│       ├── Psycho Fox (USA, Europe, Brazil) (En) (Beta).sms
│       ├── Shinobi II - The Silent Fury (World).gg
│       ├── Rocket Knight Adventures (USA).md
│       └── Sonic Drift 2 (World).gg
└── Redump (2025-05-09)
    ├── Devil May Cry (USA).iso
    ├── Spyro - Year of the Dragon (USA)
    │   ├── Spyro - Year of the Dragon (USA).bin
    │   └── Spyro - Year of the Dragon (USA).cue
    ├── Tony Hawk's Pro Skater 2 (USA)
    │   ├── Tony Hawk's Pro Skater 2 (USA).bin
    │   └── Tony Hawk's Pro Skater 2 (USA).cue
    └── SSX on Tour (USA).iso
```

!!! tip

    You probably want to combine this option with the [`--dir-dat-name`](#append-dat-name) or [`--dir-dat-description`](#append-dat-description) options to avoid mixing ROMs from different consoles into the same subdirectory.

## Append DAT name

```text
--dir-dat-name
```

This option appends the matching [DAT](../dats/introduction.md)'s name (not its filename) to each file, causing ROMs to be grouped by their console.

For example, here are some ROMs from multiple consoles combined in one input directory:

```text
ROMs-Input/
├── Pokemon - Blue Version (USA, Europe) (SGB Enhanced).gb
├── Pokemon - Crystal Version (USA, Europe) (Rev 1).gbc
├── Pokemon - Emerald Version (USA, Europe).gba
├── Pokemon - Gold Version (USA, Europe) (SGB Enhanced) (GB Compatible).gbc
├── Pokemon - Red Version (USA, Europe) (SGB Enhanced).gb
├── Pokemon - Ruby Version (USA, Europe) (Rev 2).gba
├── Pokemon - Sapphire Version (USA, Europe) (Rev 2).gba
├── Pokemon - Silver Version (USA, Europe) (SGB Enhanced) (GB Compatible).gbc
└── Pokemon - Yellow Version - Special Pikachu Edition (USA, Europe) (CGB+SGB Enhanced).gb
```

The ROMs will be grouped by their DAT name in the output directory:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy ^
      --dat "No-Intro*.zip" ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-dat-name
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy \
      --dat "No-Intro*.zip" \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-dat-name
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy \
      --dat "No-Intro*.zip" \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-dat-name
    ```

```text
ROMs-Output/
├── Game Boy
│   ├── Pokemon - Blue Version (USA, Europe) (SGB Enhanced).gb
│   ├── Pokemon - Red Version (USA, Europe) (SGB Enhanced).gb
│   └── Pokemon - Yellow Version - Special Pikachu Edition (USA, Europe) (CGB+SGB Enhanced).gb
├── Game Boy Advance
│   ├── Pokemon - Emerald Version (USA, Europe).gba
│   ├── Pokemon - Ruby Version (USA, Europe) (Rev 2).gba
│   └── Pokemon - Sapphire Version (USA, Europe) (Rev 2).gba
└── Game Boy Color
    ├── Pokemon - Crystal Version (USA, Europe) (Rev 1).gbc
    ├── Pokemon - Gold Version (USA, Europe) (SGB Enhanced) (GB Compatible).gbc
    └── Pokemon - Silver Version (USA, Europe) (SGB Enhanced) (GB Compatible).gbc
```

!!! tip

    You will probably want to use this option or `--dir-dat-description` any time you're processing multiple DAT files.

## Append DAT description

```text
--dir-dat-description
```

Similar to `--dir-dat-name`, this option will append the matching [DAT](../dats/introduction.md)'s description to each file.

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy ^
      --dat "No-Intro*.zip" ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-dat-description
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy \
      --dat "No-Intro*.zip" \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-dat-description
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy \
      --dat "No-Intro*.zip" \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-dat-description
    ```

!!! note

    Most DAT groups fill out the "description" field with the DAT's "name" plus verbose information such as game count or DAT generation date. Most of the time you will want to prefer using `--dir-dat-name` instead of this option.

## Append game letter(s)

```text
--dir-letter
```

This option appends one or more letters as a subdirectory. This option is further controlled by the other `--dir-letter-*` options below.

For devices such as flash carts that are slow to scroll, it can be helpful to limit the number of files in one subdirectory. One way to do that is to group games by their first letter.

For example, here are some ROMs that have don't all share the same first letter:

```text
ROMs-Input/
├── Kirby's Dream Land (USA, Europe).gb
├── Kirby's Dream Land 2 (USA, Europe) (SGB Enhanced).gb
├── Pokemon - Blue Version (USA, Europe) (SGB Enhanced).gb
├── Pokemon - Red Version (USA, Europe) (SGB Enhanced).gb
├── Pokemon - Yellow Version - Special Pikachu Edition (USA, Europe) (CGB+SGB Enhanced).gb
├── Super Mario Land (World) (Rev 1).gb
└── Super Mario Land 2 - 6 Golden Coins (USA, Europe) (Rev 2).gb
```

The ROMs will be grouped together by their first letter in the output directory:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-letter
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-letter
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-letter
    ```

```text
ROMs-Output/
├── K
│   ├── Kirby's Dream Land (USA, Europe).gb
│   └── Kirby's Dream Land 2 (USA, Europe) (SGB Enhanced).gb
├── P
│   ├── Pokemon - Blue Version (USA, Europe) (SGB Enhanced).gb
│   ├── Pokemon - Red Version (USA, Europe) (SGB Enhanced).gb
│   └── Pokemon - Yellow Version - Special Pikachu Edition (USA, Europe) (CGB+SGB Enhanced).gb
└── S
    ├── Super Mario Land (World) (Rev 1).gb
    └── Super Mario Land 2 - 6 Golden Coins (USA, Europe) (Rev 2).gb
```

!!! tip

    You will probably want to use `--dir-dat-name` or `--dir-dat-description` any time you're processing multiple DAT files, otherwise ROMs from different consoles will be mixed into the same letter subdirectories.

### Change the number of letters

```text
--dir-letter-count <count>
```

This option controls the number of leading letters to use for the `--dir-letter` option, with a default of one letter.

For example, if we increase the number of letters used for subdirectory names from the above example, then the output would be:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-letter ^
      --dir-letter-count 3
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-letter \
      --dir-letter-count 3
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-letter \
      --dir-letter-count 3
    ```

```text
ROMs-Output/
├── KIR
│   ├── Kirby's Dream Land (USA, Europe)
│   └── Kirby's Dream Land 2 (USA, Europe) (SGB Enhanced)
├── POK
│   ├── Pokemon - Blue Version (USA, Europe) (SGB Enhanced).gb
│   ├── Pokemon - Red Version (USA, Europe) (SGB Enhanced).gb
│   └── Pokemon - Yellow Version - Special Pikachu Edition (USA, Europe) (CGB+SGB Enhanced).gb
└── SUP
    ├── Super Mario Land (World) (Rev 1).gb
    └── Super Mario Land 2 - 6 Golden Coins (USA, Europe) (Rev 2).gb
```

!!! tip

    This option is best used when combined with `--dir-letter-group` (below), otherwise you may find the subdirectory structure harder to navigate than leaving this option as the default of one letter.

### Limit the number of games in a subdirectory

```text
--dir-letter-limit <limit>
```

This option limits the number of games that can exist in a letter subdirectory, splitting into multiple subdirectories if necessary.

This helps when navigating on devices that are slow to scroll, such as flash carts. Additionally, some devices may have a limit on the number of files they will display in a folder, so you may be required to split them.

For example, here are some ROMs that all start with the same first letter:

```text
ROMs-Input/
├── Shaq Fu (USA) (SGB Enhanced).gb
├── Space Invaders (USA) (SGB Enhanced).gb
├── Star Wars (USA, Europe) (Rev 1).gb
├── Star Wars - The Empire Strikes Back (USA, Europe).gb
├── Street Fighter II (USA, Europe) (Rev 1) (SGB Enhanced).gb
├── Super Mario Land (World) (Rev 1).gb
└── Super Mario Land 2 - 6 Golden Coins (USA, Europe) (Rev 2).gb
```

If we limit the number of files per letter folder, then the output would be:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-letter ^
      --dir-letter-limit 5
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-letter \
      --dir-letter-limit 5
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-letter \
      --dir-letter-limit 5
    ```

```text
ROMs-Output/
├── S1
│   ├── Shaq Fu (USA) (SGB Enhanced).gb
│   ├── Space Invaders (USA) (SGB Enhanced).gb
│   ├── Star Wars (USA, Europe) (Rev 1).gb
│   ├── Star Wars - The Empire Strikes Back (USA, Europe).gb
│   └── Street Fighter II (USA, Europe) (Rev 1) (SGB Enhanced).gb
└── S2
    ├── Super Mario Land (World) (Rev 1).gb
    └── Super Mario Land 2 - 6 Golden Coins (USA, Europe) (Rev 2).gb
```

### Group multiple letters together

```text
--dir-letter-group
```

This option will combine multiple letter subdirectories, creating letter ranges. This requires the `--dir-letter-limit <limit>` option, as that will help determine what the letter ranges should be.

For example, here are some ROMs that all start with different letters:

```text
ROMs-Input/
├── Alleyway (World).gb
├── Battletoads (USA, Europe).gb
├── Centipede (USA) (Majesco).gb
├── Donkey Kong (World) (Rev 1) (SGB Enhanced).gb
├── Earthworm Jim (USA).gb
├── Final Fantasy Adventure (USA).gb
├── Game Boy Wars Turbo (Japan) (SGB Enhanced).gb
├── Harvest Moon GB (USA) (SGB Enhanced).gb
├── James Bond 007 (USA, Europe) (SGB Enhanced).gb
├── Kirby's Dream Land (USA, Europe).gb
├── Legend of Zelda, The - Link's Awakening (USA, Europe) (Rev 2).gb
├── Mario's Picross (USA, Europe) (SGB Enhanced).gb
└── Pocket Bomberman (Europe) (SGB Enhanced).gb
```

We can group the games into letter ranges, with a max of 10 games in each subdirectory like this:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    igir copy ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-letter ^
      --dir-letter-limit 10 ^
      --dir-letter-group
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir copy \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-letter \
      --dir-letter-limit 10 \
      --dir-letter-group
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-letter \
      --dir-letter-limit 10 \
      --dir-letter-group
    ```

```text
ROMs-Output/
├── A-K
│   ├── Alleyway (World).gb
│   ├── Battletoads (USA, Europe).gb
│   ├── Centipede (USA) (Majesco).gb
│   ├── Donkey Kong (World) (Rev 1) (SGB Enhanced).gb
│   ├── Earthworm Jim (USA).gb
│   ├── Final Fantasy Adventure (USA).gb
│   ├── Game Boy Wars Turbo (Japan) (SGB Enhanced).gb
│   ├── Harvest Moon GB (USA) (SGB Enhanced).gb
│   ├── James Bond 007 (USA, Europe) (SGB Enhanced).gb
│   ├── Kirby's Dream Land (USA, Europe).gb
└── L-P
    ├── Legend of Zelda, The - Link's Awakening (USA, Europe) (Rev 2).gb
    ├── Mario's Picross (USA, Europe) (SGB Enhanced).gb
    └── Pocket Bomberman (Europe) (SGB Enhanced).gb
```

You can also combine this option with `--dir-letter-count <count>` for ranges with more letters.

!!! tip

    This option is helpful with smaller ROM collections because `--dir-letter` may leave some letter subdirectories with few ROMs in them.

!!! note

    This is how the [Hardware Target Game Database](https://github.com/frederic-mahe/Hardware-Target-Game-Database) organizes most of their SMDBs, grouping ROMs into subdirectories of ~200 ROMs each.

    You can achieve a result similar to the Hardware Target Game Database DATs with the following options:

    === ":fontawesome-brands-windows: Windows"

        ```batch
        igir [commands..] ^
          [options] ^
          --output "{datName}\{region}" ^
          --dir-letter ^
          --dir-letter-group ^
          --dir-letter-limit 200
        ```

    === ":fontawesome-brands-apple: macOS"

        ```shell
        igir [commands..] \
          [options] \
          --output "{datName}/{region}" \
          --dir-letter \
          --dir-letter-group \
          --dir-letter-limit 200
        ```

    === ":simple-linux: Linux"

        ```shell
        igir [commands..] \
          [options] \
          --output "{datName}/{region}" \
          --dir-letter \
          --dir-letter-group \
          --dir-letter-limit 200
        ```

## Append the game name

```text
--dir-game-subdir <mode>
```

By default, games with multiple ROMs are grouped together into their own output subdirectory. This is because emulators typically expect these files to be next to each other, but also because different games may have duplicate filenames (e.g. Sega Dreamcast GDIs all have a `track01.bin`).

```text
ROMS-Output/
└── TOSEC
    ├── Sega Dreamcast - Games - US
    │   ├── Sonic Adventure 2 v1.008 (2001)(Sega)(US)(M5)[!][3S]
    │   │   ├── Sonic Adventure 2 v1.008 (2001)(Sega)(US)(M5)[!][3S].gdi
    │   │   ├── track01.bin
    │   │   ├── track02.raw
    │   │   └── track03.bin
    │   └── Sonic Adventure v1.005 (1999)(Sega)(US)(M5)[!][26S]
    │       ├── Sonic Adventure v1.005 (1999)(Sega)(US)(M5)[!][26S].gdi
    │       ├── track01.bin
    │       ├── track02.raw
    │       └── track03.bin
    └── Sega Mega-CD & Sega CD - CD - Games - [ISO]
        └── Sonic CD (1993)(Sega)(NTSC)(US)[!][SEGA4407RE152 R7D]
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 01 of 35)[!][SEGA4407RE152 R7D].iso
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 02 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 03 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 04 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 05 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 06 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 07 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 08 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 09 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 10 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 11 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 12 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 13 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 14 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 15 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 16 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 17 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 18 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 19 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 20 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 21 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 22 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 23 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 24 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 25 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 26 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 27 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 28 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 29 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 30 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 31 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 32 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 33 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 34 of 35)[!][SEGA4407RE152 R7D].wav
            ├── Sonic CD (1993)(Sega)(NTSC)(US)(Track 35 of 35)[!][SEGA4407RE152 R7D].wav
            └── Sonic CD (1993)(Sega)(NTSC)(US)[!][SEGA4407RE152 R7D].cue
```

You can change this behavior with the `--dir-game-subdir <mode>` option:

| Mode                               | Outcome                                                                                                          |
|------------------------------------|------------------------------------------------------------------------------------------------------------------|
| `--dir-game-subdir never`          | Games with multiple ROMs are never grouped into their own subdirectory, which may cause conflicting output files |
| `--dir-game-subdir auto` (default) | Games with multiple ROMs are grouped into their own subdirectory, games with a single ROM are not                |
| `--dir-game-subdir always`         | Every game is grouped into its on subdirectory, no matter the number of ROMs it has                              |
