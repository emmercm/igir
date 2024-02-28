# ROM Filtering & Preferences

`igir` offers many options for filtering as well as 1G1R preferences/priorities (when combined with the `--single` option).

ROM filters cut down the list of games desired for a set, and any games filtered out will not appear in [reports](../output/reporting.md). ROM preferences decide what duplicates to eliminate (1G1R).

## Filters

Multiple filter options can be specified at once.

### Game name filter

```text
--filter-regex <pattern|filename>, --filter-regex-exclude <pattern|filename>
```

Only include, or exclude games based if their DAT name (or filename if not using DATs) matches a regular expression.

Regex flags can be optionally provided in the form `/<pattern>/<flags>`, for example:

```text
Mario|Zelda
/mario|zelda/i
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

### Language filter

```text
--filter-language [languages..]
```

Languages are two-letter codes, and multiple languages can be specified with commas between them. See the `--help` message for the full list of understood languages.

If a game does not have language information specified, it will be inferred from the region.

Here are some example game names that `igir` can parse languages from, including ones with multiple languages:

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

### Region filter

```text
--filter-region [regions..]
```

Regions are two or three-letter codes, and you can specify multiple regions with commas between them. See the `--help` message for the full list of understood regions.

Here are some example game names that `igir` can parse regions from:

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

A game can only have one primary region. The first region detected is what is used.

### BIOS

```text
--no-bios, --only-bios
```

Filter out, or only include games that are marked `bios="yes"` in the DAT, or contain `[BIOS]` in their name, e.g.:

```text
[BIOS] Nintendo Game Boy Boot ROM (World) (Rev 1)
[BIOS] Nintendo Game Boy Color Boot ROM (World) (Rev 1)
```

!!! tip

    `--only-bios` is a great option to collate all BIOS files across all consoles to one directory.

### MAME devices

```text
--no-device, --only-device
```

Filter out, or only include [MAME devices](https://wiki.mamedev.org/index.php/MAME_Device_Basics). MAME devices typically represent physical devices, such as microcontrollers, video display controllers, sounds boards, and more. Many MAME devices don't have any associated ROM files.

### Unlicensed

```text
--no-unlicensed, --only-unlicensed
```

Filter out, or only include games that contain `(Unl)` or `(Unlicensed)` in their name, e.g.:

```text
4 in 1 (Europe) (4B-002, Sachen) (Unl)
Caihong Zhanshi - Rainbow Prince (Taiwan) (Unl)
```

These games are still considered "retail" releases (below).

### Only retail

```text
--only-retail
```

Enables all the following `--no-*` options, as well as filtering out games that are:

- **Alphas**: games that contain `(Alpha)` in their name, e.g.:

  ```text
  Isle Quest (World) (v0.1c) (Alpha) (Aftermarket) (Homebrew)
  Sword (Alpha) (PD) [C]
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

- **Games with hacks**: games that contain `(Hack)` or `[h*]` in their name, e.g.:

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

### Debug

```text
--no-debug, --only-debug
```

Filter out, or only include games that contain `(Debug)` in their name, e.g.:

```text
Megaman - Battle Network 2 (USA) (Debug Version)
Perfect Dark (USA) (2000-03-22) (Debug)
```

### Demos

```text
--no-demo, --only-demo
```

Filter out, or only include games that contain one of the following in their name:

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

### Betas

```text
--no-beta, --only-beta
```

Filter out, or only include games that contain `(Beta)` in their name, e.g.:

```text
Cosmo Tank (Japan) (Beta)
F-15 Strike Eagle II (USA, Europe) (Beta) (July, 1992)
```

### Samples

```text
--no-sample, --only-sample
```

Filter out, or only include games that contain `(Sample)` in their name, e.g.:

```text
Mega Man III (USA) (Sample)
Shin Nihon Pro Wrestling - Toukon Sanjuushi (Japan) (Sample)
```

### Prototypes

```text
--no-prototype, --only-prototype
```

Filter out, or only include games that contain `(Proto)` or `(Prototype)` in their name, or has the game category of `Preproduction`, e.g.:

```text
Philip & Marlowe in Bloomland (USA) (Proto)
Sword of Hope, The (Europe) (Proto)
```

### Program application ROMS

```text
--no-program, --only-program
```

Filter out, or only include games that contain one of the following in their name

- `([a-z0-9. ]*Program)` (regex)
- `Check Program`
- `Sample Program`

```text
AGB Aging Cartridge (World) (v1.0) (Test Program)
AGB-Parallel Interface Cartridge (Japan) (En) (Program)
```

### Homebrew

```text
--no-homebrew, --only-homebrew
```

Filter out, or only include games that contain `(Homebrew)` in their name, e.g.:

```text
Game Boy Camera Gallery 2022, The (World) (Aftermarket) (Homebrew)
GB-Wordyl (World) (Aftermarket) (Homebrew)
```

### Unverified dumps

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

### Bad dumps

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

## Preferences (for 1G1R)

The `--single` option is required for all `--prefer-*` options, otherwise there would be no effect.

Multiple `--prefer-*` options can be specified at once, and they will be applied in the following order of importance (most important to least important).

### Prefer game names

```text
--prefer-game-regex <pattern|filename>
```

Prefer games if their DAT name (or filename if not using DATs) matches a regular expression.

Regex flags can be optionally provided in the form `/<pattern>/<flags>`, for example:

```text
Mario|Zelda
/mario|zelda/i
```

### Prefer ROM filenames

```text
--prefer-rom-regex <pattern|filename>
```

Prefer games if any of their ROM filenames matches a regular expression.

Regex flags can be optionally provided in the form `/<pattern>/<flags>`, for example:

```text
Mario.*\\.gb$
/mario.*\\.gb$/i
```

### Prefer verified

```text
--prefer-verified
```

Prefer games that contain `[!]` in their name over those that don't.

!!! warning

    This is a [GoodTools](https://emulation.gametechwiki.com/index.php/GoodTools#Good_codes) naming convention, other groups such as [No-Intro](https://no-intro.org/) never include `[!]` in their names!

### Prefer good

```text
--prefer-good
```

Prefer games that _don't_ contain `[b]` or `[b#]` in their name over those that do.

See the [bad dumps](#bad-dumps) section for more information about "good" and "bad" ROMs.

### Prefer language

```text
--prefer-language
```

Prefer games of certain languages over those in other languages. Multiple languages can be specified, in priority order, with commas between them. See the `--help` message for the full list of understood languages.

If a game does not have language information specified, it will be inferred from the region.

For example, to prefer games in English and _then_ Japanese, the command would be:

```text
--prefer-language En,Ja
```

### Prefer region

```text
--prefer-region
```

Prefer games from certain regions over those from other regions. Multiple regions can be specified, in priority order, with commas between them. See the `--help` message for the full list of understood regions.

For example, to prefer games from: USA (highest priority), "world," and then Europe, the command would be:

```text
--prefer-region USA,WORLD,EUR
```

### Prefer revision

```text
--prefer-revision-newer, --prefer-revision-older
```

Prefer newer or older revisions of a game.

Revisions can be numeric:

```text
Frogger (Europe) (En,Fr,De,Es,It,Nl) (GB Compatible)
Frogger (USA) (Rev 1) (GB Compatible)
Frogger (USA) (Rev 2) (GB Compatible)
```

or alphabetical:

```text
MSR - Metropolis Street Racer (Europe) (En,Fr,De,Es)
MSR - Metropolis Street Racer (Europe) (En,Fr,De,Es) (Rev A)
MSR - Metropolis Street Racer (Europe) (En,Fr,De,Es) (Rev B)
```

### Prefer retail

```text
--prefer-retail
```

Prefer games that are considered "retail" releases over those that aren't.

See the [only retail](#only-retail) section for more information on what games are considered "retail."

### Prefer NTSC, PAL

```text
--prefer-ntsc, --prefer-pal
```

Prefer games that are explicitly labeled as NTSC or PAL, over those that aren't.

!!! note

    Most DAT groups do not label games with this information, generally games are labeled by region instead.

### Prefer parent

```text
--prefer-parent
```

Prefer games that DATs consider the "parent" of other game clones, over the clones themselves.

It is unlikely you will often use this option, it is more likely other preference options will accomplish what you want.
