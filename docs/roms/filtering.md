# ROM Filtering

Igir offers _many_ options for filtering out unwanted games. ROM filters cut down the list of games desired for a set, and any games filtered out will not appear in [reports](../output/reporting.md).

Multiple filter options can be specified at once, and they will all be applied in a "logical and" fahsion.

!!! note

    Filters are applied against all [DATs](../dats/scanning.md) _before_ [ROM matching](matching.md) happens. If no DATs are provided, Igir will [infer DATs](../dats/dir2dat.md) from the input files.

!!! tip

    Filters and [1G1R preferences](1g1r.md) are applied before generating [fixdats](../dats/fixdats.md) and [dir2dats](../dats/dir2dat.md), allowing you to generate DATs for your exact needs!

## Game name filter

```text
--filter-regex <pattern|filename>, --filter-regex-exclude <pattern|filename>
```

Only include or exclude games based on if their DAT name (or filename if not using DATs) matches a regular expression.

Regex [flags](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#advanced_searching_with_flags) can be optionally provided in the form `/<pattern>/<flags>`.

!!! example

    Filter to only Mario or Zelda games:

    ```text
    --filter-regex "Mario|Zelda"
    ```

    ```text
    --filter-regex ""/mario|zelda/i"
    ```

A filename can be provided to a file that contains one or more lines of patterns. Multiple patterns will be combined in a logical "or" fashion. For example:

```text
# patterns.txt
^Mario
/kirby|zelda/i

# --filter-regex patterns.txt would match:
Mario's Picross (USA, Europe) (SGB Enhanced)
Kirby's Dream Land (USA, Europe)
Legend of Zelda, The - Link's Awakening (USA, Europe) (Rev 2)

# --filter-regex patterns.txt would NOT match:
Dr. Mario (World) (Rev 1)
Super Mario Land (World) (Rev 1)
Tetris (World) (Rev 1)
Wario Land II (USA, Europe) (SGB Enhanced)
```

## Language filter

```text
--filter-language [languages..]
```

Languages are two-letter codes, and multiple languages can be specified with commas between them. See the `--help` message for the full list of supported languages.

If a game doesn't have language information specified in its name, the region's primary language will be used. If a game doesn't have language or region information, then it will always be filtered out by this option.

Here are some example game names that Igir can parse languages from, including ones with multiple languages:

```text
English:
  Donkey Kong (Japan, USA) (En) (SGB Enhanced)
  Dr. Franken (USA)
  Dragon's Lair - The Legend (Europe)
  Gear Works (U) [!]

Japanese:
  Final Reverse (Japan)
  Makai Toushi Sa-Ga (World) (Ja) (Rev 1) (Collection of SaGa)
  Ohasuta Dance Dance Revolution GB (J) [C][!]

Spanish:
  Humans, The (Europe) (En,Fr,De,Es,It)
  Pokemon - Edicion Azul (Spain) (SGB Enhanced)
  Rugrats en Paris - La Pelicula (S) (M2) [C][!]
```

A game can have many languages, and all of them are considered during filtering.

!!! example

    Filter to only games in English or Japanese:

    ```text
    --filter-language En,Ja
    ```

!!! example

    Filter to only games in Chinese:

    ```text
    --filter-language Zh
    ```

## Region filter

```text
--filter-region [regions..]
```

Regions are two or three-letter codes, and you can specify multiple regions with commas between them. See the `--help` message for the full list of supported regions.

If a game doesn't have region information then it will always be filtered out by this option.

Here are some example game names that Igir can parse regions from:

```text
USA:
  10-Pin Bowling (USA)
  Addams Family, The - Pugsley's Scavenger Hunt (USA, Europe)
  Castelian (U) [!]

Japan:
  Dragon Quest I & II (J) [C][!]
  Taikyoku Renju (Japan) (En,Ja)

Europe:
  Adventures of Lolo (Europe) (SGB Enhanced)
  Castlevania Adventure, The (E) [!]
  Soccer (Europe, Australia) (En,Fr,De) (SGB Enhanced)

Spain:
  Dragon Ball Z - Guerreros de Leyenda (S) [C][!]
  Star Trek - The Next Generation (Spain)
```

A game can have many regions, and all of them are considered during filtering.

!!! example

    Filter to only games from Australia or New Zealand

    ```text
    --filter-region AUS,NZ
    ```

!!! example

    Filter to only games from South Korea:

    ```text
    --filter-region KOR
    ```

## Category filter

```text
--filter-category-regex <pattern|filename>
```

Only include games whose category matches the provided regular expression.

!!! warning

    This options requires that the DATs you use include category information. Not every DAT release group includes category information (e.g. MAME and TOSEC don't), and not every release group includes category in every version of their DATs (e.g. No-Intro doesn't always). Games without categories will always be filtered out by this option!

## BIOS

```text
--no-bios, --only-bios
```

Filter out, or only include games that are marked `isbios="yes"` in the DAT, or contain `[BIOS]` in their name, e.g.:

```text
[BIOS] Nintendo Game Boy Boot ROM (World) (Rev 1)
[BIOS] Nintendo Game Boy Color Boot ROM (World) (Rev 1)
```

!!! tip

    `--only-bios` is a great option to collate all BIOS files across all consoles to one directory.

## MAME devices

```text
--no-device, --only-device
```

Filter out or only include [MAME devices](https://wiki.mamedev.org/index.php/MAME_Device_Basics). MAME devices typically represent physical devices, such as microcontrollers, video display controllers, sounds boards, and more. Many MAME devices don't have any associated ROM files.

## Unlicensed

```text
--no-unlicensed, --only-unlicensed
```

Filter out, or only include games that contain `(Unl)` or `(Unlicensed)` in their name, e.g.:

```text
4 in 1 (Europe) (4B-002, Sachen) (Unl)
Caihong Zhanshi - Rainbow Prince (Taiwan) (Unl)
```

These games are still considered "retail" releases (below).

---

## Only retail

```text
--only-retail
```

Enables all the following `--no-*` options, as well as filtering out games that are:

- **Alphas**: games that contain `(Alpha)` in their name, e.g.:

  ```text
  Isle Quest (World) (v0.1c) (Alpha) (Aftermarket) (Homebrew)
  Sword (Alpha) (PD) [C]
  ```

- **Bootleg**: games that contain `bootleg` in their manufacturer

- **Cracked**: games that contain `[cr]` or `[cr *]` in their name, e.g.:

  ```text
  Jet Set Willy (1984)(Software Projects)[cr]
  Buck Rogers - Countdown to Doomsday v1.0 (1991)(SSI)(Disk 1 of 3)[cr2][FD installed]
  Dungeon Master (1987)(FTL)[cr 42-Crew]
  ```

- **Enhancement chips**: games that contain `(Enhancement Chip)` in their name, e.g.:

  ```text
  DSP1 B (World) (Enhancement Chip)
  Super Game Boy SGB-CPU (World) (Enhancement Chip)
  ```

- **Fixed**: games that contain `[f]` or `[f#]` in their name, e.g.:

  ```text
  Black Bass - Lure Fishing (U) [C][f1]
  Bugs Bunny - Crazy Castle 3 (J) [C][f2]
  ```

- **Non-public "MIA"**: games that contain `[MIA]` in their name, e.g.:

  ```text
  [MIA] Better Dead Than Alien (Europe)
  [MIA] Billiards Simulator (Europe) (En,Fr,De)
  ```

- **Overdumps**: games that contain `[o]` or `[o#]` in their name, e.g.:

  ```text
  Castlevania II - Belmont's Revenge (U) [o1]
  Cave Noire (J) [o2]
  ```

- **Pending dumps**: games that contain `[!p]` in their name, e.g.:

  ```text
  Cheetah Men II (Active Enterprises) [!p]
  ```

- **Pirated**: games that contain `(Pirate)`, `[p]`, or `[p#]` in their name, e.g.:

  ```text
  Flipull (J) [p1]
  Super Mario 4 (Unknown) (Ja) (Pirate)
  Super Robot Taisen Final Vol.1 (Unl) [C][p2]
  ```

- **Unofficial translations**: games that contain `[T-*]` or `[T+*]` in their name, e.g.:

  ```text
  Duck Tales (E) [T-Ger]
  Final Fantasy Legend II (U) [T+Fre]
  ```

- **Games with hacks**: games that contain `(Hack)` or `[h*]` in their name, or `hack` in their manufacturer, e.g.:

  ```text
  Kirby's Dream Land 2 (U) [S][h1] (Sound Test)
  Pokemon - Blue Version (UE) [S][h2]
  Q-bert II (UE) [h1C]
  ```

- **Games with trainers**: games that contain `[t]` or `[t#]` in their name, e.g.:

  ```text
  Qix Adventure (J) [C][t1]
  R-Type DX (U) [C][t2]
  ```

## Debug

```text
--no-debug, --only-debug
```

Filter out, or only include games that contain `(Debug)` in their name, e.g.:

```text
Megaman - Battle Network 2 (USA) (Debug Version)
Perfect Dark (USA) (2000-03-22) (Debug)
```

## Demos

```text
--no-demo, --only-demo
```

Filter out or only include games that contain one of the following in their name:

- `(Demo[a-z0-9. -]*)` (regex)
- `@barai`
- `(Kiosk[a-z0-9. -]*)` (regex)
- `(Preview)`
- `GameCube Preview`
- `Kiosk Demo Disc`
- `PS2 Kiosk`
- `PSP System Kiosk`
- `Taikenban`
- `Trial Edition`

or has the game category of `Demos`, e.g.:

```text
Coria and the Sunken City (Unknown) (Demo)
Two Hearts (Japan) (Demo) (Unl)
```

## Betas

```text
--no-beta, --only-beta
```

Filter out, or only include games that contain `(Beta)` in their name, e.g.:

```text
Cosmo Tank (Japan) (Beta)
F-15 Strike Eagle II (USA, Europe) (Beta) (July, 1992)
```

## Samples

```text
--no-sample, --only-sample
```

Filter out, or only include games that contain `(Sample)` in their name, e.g.:

```text
Mega Man III (USA) (Sample)
Shin Nihon Pro Wrestling - Toukon Sanjuushi (Japan) (Sample)
```

## Prototypes

```text
--no-prototype, --only-prototype
```

Filter out, or only include games that contain `(Proto)` or `(Prototype)` in their name, or has the game category of `Preproduction`, e.g.:

```text
Philip & Marlowe in Bloomland (USA) (Proto)
Sword of Hope, The (Europe) (Proto)
```

## Program application ROMS

```text
--no-program, --only-program
```

Filter out or only include games that contain one of the following in their name

- `([a-z0-9. ]*Program)` (regex)
- `Check Program`
- `Sample Program`

```text
AGB Aging Cartridge (World) (v1.0) (Test Program)
AGB-Parallel Interface Cartridge (Japan) (En) (Program)
```

## Aftermarket ROMs

```text
--no-aftermarket, --only-aftermarket
```

Filter out, or only include games that contain `(Aftermarket)` in their name, e.g.:

```text
Bub-O Escape (World) (v2.5) (Aftermarket) (Unl)
D-Fuzed (World) (v1.1.0) (GB Compatible) (Aftermarket) (Unl)
```

## Homebrew

```text
--no-homebrew, --only-homebrew
```

Filter out, or only include games that contain `(Homebrew)` in their name, e.g.:

```text
Game Boy Camera Gallery 2022, The (World) (Aftermarket) (Homebrew)
GB-Wordyl (World) (Aftermarket) (Homebrew)
```

## Unverified dumps

```text
--no-unverified, --only-unverified
```

Only include, or filter out games that contain `[!]` in their name.

For example, `--no-unverified` would filter out the following:

```text
Getaway, The (U)
Gex - Enter the Gecko (U) [C][b1]
Golf (W) [o1]
Grand Theft Auto (E) (M5) [C][t1]
```

and `--only-unverified` would filter out the following:

```text
Kirby & The Amazing Mirror (U) [!]
Legend of Zelda, The - A Link To The Past with Four Swords (E) (M5) [!]
Mario & Luigi - Superstar Saga (U) [!]
```

!!! warning

    This is a [GoodTools](https://emulation.gametechwiki.com/index.php/GoodTools#Good_codes) naming convention, other groups such as [No-Intro](https://no-intro.org/) never include `[!]` in their names!

## Bad dumps

```text
--no-bad, --only-bad
```

Filter out, or only include games that contain `[b]` or `[b#]` in their name, e.g.:

```text
[MIA] Aprilia - DiTech Interface (Unknown) (Unl) [b]
Great Greed (U) [b1]
Gremlins 2 - The New Batch (W) [b2]
```

as well as games that contain `[c]` or `[x]` and are _not_ verified dumps (above), e.g.:

```text
Brian Lara Cricket 96 (E) [a1][x]
Micro Machines Military - It's a Blast! (E) [x]
```

!!! warning

    This is a [GoodTools](https://emulation.gametechwiki.com/index.php/GoodTools#Good_codes) naming convention, other groups such as [No-Intro](https://no-intro.org/) never include `[b]` in their names!
