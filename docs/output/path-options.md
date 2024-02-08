# Output Path Options

`igir` offer many options to control how ROMs are sorted in the specified output directory.

All `--dir-*` options append subdirectories to whatever is specified in the `--output <path>` option. Many `--dir-*` options have an [output path token](./tokens.md) equivalent, which also controls how ROMs are sorted.

Multiple options can be combined, and they will be appended to the output directory in the following order:

## Mirror the input subdirectory

```text
--dir-mirror
```

This option mirrors the subdirectory structure of where ROMs were found in the input directory.

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

When combined with a [DAT](../dats/introduction.md), the ROMs will be written with a standardized name, but the output subdirectory structure will match the input:

=== ":simple-windowsxp: Windows"

    ```batch
    igir copy ^
      --dat "No-Intro*.zip" ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-mirror
    ```

=== ":simple-apple: macOS"

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

=== ":simple-windowsxp: Windows"

    ```batch
    igir copy ^
      --dat "No-Intro*.zip" ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-dat-name
    ```

=== ":simple-apple: macOS"

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

=== ":simple-windowsxp: Windows"

    ```batch
    igir copy ^
      --dat "No-Intro*.zip" ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-dat-description
    ```

=== ":simple-apple: macOS"

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

=== ":simple-windowsxp: Windows"

    ```batch
    igir copy ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-letter
    ```

=== ":simple-apple: macOS"

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

=== ":simple-windowsxp: Windows"

    ```batch
    igir copy ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-letter ^
      --dir-letter-count 3
    ```

=== ":simple-apple: macOS"

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

=== ":simple-windowsxp: Windows"

    ```batch
    igir copy ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-letter ^
      --dir-letter-limit 5
    ```

=== ":simple-apple: macOS"

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

=== ":simple-windowsxp: Windows"

    ```batch
    igir copy ^
      --input "ROMs-Input" ^
      --output "ROMs-Output" ^
      --dir-letter ^
      --dir-letter-limit 5 ^
      --dir-letter-group
    ```

=== ":simple-apple: macOS"

    ```shell
    igir copy \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-letter \
      --dir-letter-limit 5 \
      --dir-letter-group
    ```

=== ":simple-linux: Linux"

    ```shell
    igir copy \
      --input "ROMs-Input/" \
      --output "ROMs-Output/" \
      --dir-letter \
      --dir-letter-limit 5 \
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

## Append the game name

```text
--dir-game-subdir <mode>
```
