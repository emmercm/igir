# igir

A ROM collection manager designed to make one game, one rom (1G1R) sets.

## Installation

## Usage

```help
 ______   ______   ______  _______  
|      \ /      \ |      \|       \ 
 \$$$$$$|  $$$$$$\ \$$$$$$| $$$$$$$\
  | $$  | $$ __\$$  | $$  | $$__| $$
  | $$  | $$|    \  | $$  | $$    $$
  | $$  | $$ \$$$$  | $$  | $$$$$$$\   ROM collection manager
 _| $$_ | $$__| $$ _| $$_ | $$  | $$
|   $$ \ \$$    $$|   $$ \| $$  | $$
 \$$$$$$  \$$$$$$  \$$$$$$ \$$   \$$


Usage: igir [options]

Path options (inputs support globbing):
  -d, --dat            Path(s) to DAT files                             [array] [default: ["*.dat"]]
  -i, --input          Path(s) to ROM files, with support for .zip and .7z archives
                                                                                  [array] [required]
  -I, --input-exclude  Path(s) to ROM files to exclude                                       [array]
  -o, --output         Path to the ROM output directory                          [string] [required]

Output options:
      --dir-mirror   Use the input subdirectory structure as the output subdirectory       [boolean]
      --dir-datname  Use the DAT name as the output subdirectory                           [boolean]
      --dir-letter   Append the first letter of the ROM name as an output subdirectory     [boolean]
  -s, --single       Output only a single game per parent (requires parent-clone DAT files)[boolean]
  -z, --zip          Zip archive ROM files                                                 [boolean]
  -m, --move         Move ROMs to the output directory                                     [boolean]
  -O, --overwrite    Overwrite any ROMs in the output directory                            [boolean]
  -t, --test         Test ROMs for accuracy after writing them
  -c, --clean        Remove unmatched files from the ROM output directory                  [boolean]

Priority options:
      --prefer-good             Prefer good ROM dumps over bad             [boolean] [default: true]
  -l, --prefer-language         List of comma-separated languages in priority order         [string]
  -r, --prefer-region           List of comma-separated regions in priority order           [string]
      --prefer-revisions-newer  Prefer newer ROM revisions over older                      [boolean]
      --prefer-revisions-older  Prefer older ROM revisions over newer                      [boolean]
      --prefer-releases         Prefer ROMs marked as releases                             [boolean]
      --prefer-parents          Prefer parent ROMs over clones (requires parent-clone DAT files)
                                                                                           [boolean]

Filtering options:
  -L, --language-filter  List of comma-separated languages to limit to                      [string]
  -R, --region-filter    List of comma-separated regions to limit to                        [string]
      --only-bios        Filter to only BIOS files                                         [boolean]
      --no-bios          Filter out BIOS files                                             [boolean]
      --no-unlicensed    Filter out unlicensed ROMs                                        [boolean]
      --no-demo          Filter out demo ROMs                                              [boolean]
      --no-beta          Filter out beta ROMs                                              [boolean]
      --no-sample        Filter out sample ROMs                                            [boolean]
      --no-prototype     Filter out prototype ROMs                                         [boolean]
      --no-test-roms     Filter out test ROMs                                              [boolean]
      --no-aftermarket   Filter out aftermarket ROMs                                       [boolean]
      --no-homebrew      Filter out homebrew ROMs                                          [boolean]
      --no-bad           Filter out bad ROM dumps                          [boolean] [default: true]

Options:
      --help  Show help                                                                    [boolean]

Examples:
  igir -i **/*.zip -o 1G1R/ -s -l En -r USA,EUR,JPN  Produce a 1G1R set per console, preferring Engl
                                                     ish from USA>EUR>JPN

  igir -i **/*.zip -i 1G1R/ -o 1G1R/                 Merge new ROMs into an existing ROM collection

  igir -i 1G1R/ -o 1G1R/ -m -z                       Organize and zip an existing ROM collection

  igir -i **/*.zip -o bios/ --only-bios              Collate all BIOS files
```

## Obtaining ROMs

Emulators are legal, as long as they don't include copyrighted software such as a system BIOS.

Downloading ROM files that you do not own is piracy and is illegal. Here are some ways you can legally create ROM files for games you own:

- Nintendo - 3DS: [GodMode9](https://github.com/d0k3/GodMode9)
- Nintendo - DS, DSi: [GodMode9i](https://github.com/DS-Homebrew/GodMode9i)
- Nintendo - Game Boy, Game Boy Color, Game Boy Advance: [INLretro Dumper](https://www.infiniteneslives.com/inlretro.php), [Retrode](https://www.retrode.com/) (with an adapter), [GB Operator](https://www.epilogue.co/product/gb-operator)
- Nintendo - Gamecube: [CleanRip](https://wiibrew.org/wiki/CleanRip) (with a Wii)
- Nintendo - Nintendo 64: [INLretro Dumper](https://www.infiniteneslives.com/inlretro.php), [Retrode](https://www.retrode.com/) (with an adapter)
- Nintendo - Nintendo Entertainment System, Famicom: [INLretro Dumper](https://www.infiniteneslives.com/inlretro.php)
- Nintendo - Super Nintendo: [INLretro Dumper](https://www.infiniteneslives.com/inlretro.php), [Retrode](https://www.retrode.com/)
- Nintendo - Wii: [CleanRip](https://wiibrew.org/wiki/CleanRip)
- Sega - Genesis / Mega Drive: [INLretro Dumper](https://www.infiniteneslives.com/inlretro.php), [Retrode](https://www.retrode.com/)
- Sega - Master System: [Retrode](https://www.retrode.com/) (with an adapter)
- Sega - Saturn: [ImgBurn](https://ninite.com/ImgBurn/) (with a PC)
- Sony - Playstation 1: [ImgBurn](https://ninite.com/ImgBurn/) (with a PC)
- Sony - Playstation 2: [ImgBurn](https://ninite.com/ImgBurn/) (with a PC)
