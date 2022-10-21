# ROM Filtering

`igir` offers many options for filtering as well as 1G1R priority (combined with `--single`).

They are processed in this order:

1. Any [filters](#filters) (e.g. `--language-filter`, `--region-filter`)
2. Any priorities (e.g. `--prefer-good`, `--prefer-revision-newer`)
3. If `--single` is specified, only the highest priority game from a set of parent/clones (see [docs](dats.md#parentclone-pc)) is returned

## Filters

`igir` supports the following filters:

**Language filter (`--language-filter [languages..]`)**

Languages are two-letter codes, and you can specify multiple languages with commas between them. See the `--help` message for the full list of understood languages.

If a game does not have language information specified it will be inferred from the region.

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

**Region filter (`--region-filter [regions..]`)**

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

**Only BIOS (`--only-bios`)**

Games that are marked `bios="yes"` in the DAT, or contain `[BIOS]` in their name, e.g.:

```text
[BIOS] Nintendo Game Boy Boot ROM (World) (Rev 1)
[BIOS] Nintendo Game Boy Color Boot ROM (World) (Rev 1)
```

This option is best used for collating all BIOS files across all consoles to one directory.

**No BIOS (`--no-bios`)**

Opposite of the above. This will filter out files that aren't games.

**No unlicensed (`--no-unlicensed`)**

Filters out games that contain `(Unl)` or `(Unlicensed)` in their name, e.g.:

```text
4 in 1 (Europe) (4B-002, Sachen) (Unl)
Caihong Zhanshi - Rainbow Prince (Taiwan) (Unl)
```

These games are still considered "retail" releases (below).

**Only retail (`--only-retail`)**

Games that are not any of the below options, and are not:

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

**No demos (`--no-demo`)**

Filters out games that contain `(Demo)` in their name, e.g.:

```text
Coria and the Sunken City (Unknown) (Demo)
Two Hearts (Japan) (Demo) (Unl)
```

**No betas (`--no-beta`)**

Filters out games that contain `(Beta)` in their name, e.g.:

```text
Cosmo Tank (Japan) (Beta)
F-15 Strike Eagle II (USA, Europe) (Beta) (July, 1992)
```

**No samples (`--no-sample`)**

Filters out games that contain `(Sample)` in their name, e.g.:

```text
Mega Man III (USA) (Sample)
Shin Nihon Pro Wrestling - Toukon Sanjuushi (Japan) (Sample)
```

**No prototypes (`--no-prototype`)**

Filters out games that contain `(Proto)` or `(Prototype)` in their name, e.g.:

```text
Philip & Marlowe in Bloomland (USA) (Proto)
Sword of Hope, The (Europe) (Proto)
```

**No test ROMs (`--no-test-roms`)**

Filters out games that contain `(Test)` in their name, e.g.:

```text
2097 ROM Pack II (USA) (Test Program)
Game Boy Test Cartridge (USA, Europe) (Proto) (Test Program)
```

**No homebrew (`--no-homebrew`)**

Filters out games that contain `(Homebrew)` in their name, e.g.:

```text
Game Boy Camera Gallery 2022, The (World) (Aftermarket) (Homebrew)
GB-Wordyl (World) (Aftermarket) (Homebrew)
```

**No unverified dumps (`--no-unverified`)**

Filters out games that do _not_ contain `[!]` in their name, e.g.:

```text
Getaway, The (U)
Gex - Enter the Gecko (U) [C][b1]
Golf (W) [o1]
Grand Theft Auto (E) (M5) [C][t1]
```

Note that this is a [GoodTools](https://emulation.gametechwiki.com/index.php/GoodTools#Good_codes) naming convention, other groups such as [No-Intro](https://no-intro.org/) never include `[!]` in their names!

**No bad dumps (`--no-bad`)**

Filters out games that contain `[b]` or `[b#]` in their name, e.g.:

```text
[MIA] Aprilia - DiTech Interface (Unknown) (Unl) [b]
Great Greed (U) [b1]
Gremlins 2 - The New Batch (W) [b2]
```

And also filters out games that contain `[c]` or `[x]` and are _not_ verified dumps (above), e.g.:

```text
Brian Lara Cricket 96 (E) [a1][x]
Micro Machines Military - It's a Blast! (E) [x]
```
