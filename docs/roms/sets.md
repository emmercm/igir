# ROM Sets

"Sets" here refers to the collection of all ROM files for a game. The options here change what is included or excluded from sets, how sets can be combined, and what is permissible in sets.

## ROM set merge types

The `--merge-roms <mode>` option is used to reduce storage requirements when working with MAME and other arcade DATs that supply [parent/clone](../dats/introduction.md#parentclone-pc-dats) information. See the [arcade docs](../usage/arcade.md#rom-set-merge-types) for information on this option.

## Merging multi-disc games

Most DAT groups that catalog optical media-based consoles (e.g. PS1, Dreamcast, GameCube) consider different discs of a multi-disc game to be separate "games," with no relation between them other than having a similar name. This is because ROM managers may not process games unless all of its ROM files are present, but there may be bonus discs that you don't care about for storage reasons.

The `--merge-discs` option will merge these separate games of a multi-disc game. The option relies on well-named files in formats like these:

- **Redump-style:**

  ```text
  Final Fantasy IX (USA) (Disc 1)
  Final Fantasy IX (USA) (Disc 2)
  Final Fantasy IX (USA) (Disc 3)
  Final Fantasy IX (USA) (Disc 4)

  Metal Gear Solid - The Twin Snakes (USA) (Disc 1)
  Metal Gear Solid - The Twin Snakes (USA) (Disc 2)
  ```

- **TOSEC-style:**

  ```text
  Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 1 of 2)[!]
  Skies of Arcadia v1.002 (2000)(Sega)(US)(Disc 2 of 2)[!]

  Panzer Dragoon Saga v1.000 (1998)(Sega)(PAL)(Disc 1 of 4)[!]
  Panzer Dragoon Saga v1.000 (1998)(Sega)(PAL)(Disc 2 of 4)[!]
  Panzer Dragoon Saga v1.000 (1998)(Sega)(PAL)(Disc 3 of 4)[!]
  Panzer Dragoon Saga v1.000 (1998)(Sega)(PAL)(Disc 4 of 4)[!]
  ```

!!! note

    This option doesn't require you to supply DATs with the [`--dat <path>` option](../dats/processing.md#scanning-for-dats), but doing so will greatly increase the chance of the option working as intended.

<!-- TODO(cemmer): document allow-excess-sets -->

<!-- TODO(cemmer): document allow-incomplete-sets -->
