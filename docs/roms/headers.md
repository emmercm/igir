# ROM Headers

There are a handful of consoles where it is common for their ROMs to have extra data at the beginning of the file (a "header") that wasn't present on the physical ROM chip.

Some of these headers are used to tell the emulator information about how to emulate the game (Atari 7800 "A78," NES "iNES," Famicom Disk System "FDS," etc.). There are other consoles where it is somewhat common to find the ROMs without a header (Atari Lynx "LYX," SNES "SFC").

## Header detection

Igir can detect headers for the following consoles and file extensions:

| Console                        | Header        | Extension |
|--------------------------------|---------------|-----------|
| Atari 7800                     | A78           | `.a78`    |
| Atari Lynx                     | LNX           | `.lnx`    |
| Nintendo - NES                 | iNES, NES 2.0 | `.nes`    |
| Nintendo - Famicom Disk System | fsNES/FDS     | `.fds`    |
| Nintendo - SNES                | SMC           | `.smc`    |

Those file extensions above are the commonly accepted "correct" extensions, and Igir will attempt to detect if a header is present in those ROM files automatically. If for some reason your files don't have the right extension (e.g. `.rom`) you can force header detection with the `--header` glob option:

```shell
igir [commands..] --dat <dats> --input <input> --header "*.rom"
```

Igir will use this detected header information to compute both "headered" and "headerless" checksums of ROMs and use both of those to match against DAT files.

!!! warning

    Many DAT groups expressly only include the size and checksum information for the headerless ROM, even if the header should not be removed.

## Manual header removal

Some emulators cannot parse ROMs with headers and instead need a "headerless" version. This seems most common with SNES. Sometimes "headerless" files will have a different file extension:

| Console                        | Header        | Headered<br/>Extension | Headerless<br/>Extension |
|--------------------------------|---------------|------------------------|--------------------------|
| Atari 7800                     | A78           | `.a78`                 | (no change)              |
| Atari Lynx                     | LNX           | `.lnx`                 | `.lyx`                   |
| Nintendo - NES                 | iNES, NES 2.0 | `.nes`                 | (no change)              |
| Nintendo - Famicom Disk System | fsNES/FDS     | `.fds`                 | (no change)              |
| Nintendo - SNES                | SMC           | `.smc`                 | `.sfc`                   |

For every console that Igir can understand the headers for, it can also remove them with the `--remove-headers` option. This only makes sense for the consoles above with different "headerless" extensions, so you have to specify the extensions like this:

```shell
igir [commands..] --dat <dats> --input <input> --remove-headers .lnx,.smc
```

But if you're absolutely sure you want to remove any known header from every single ROM file, you can omit the extension argument:

```shell
igir [commands..] --dat <dats> --input <input> --remove-headers
```

## Automatic header removal

Some DAT groups such as No-Intro publish "headered" and "headerless" DATs for the same console, such as NES. Igir will treat these DATs differently, it will automatically remove headers (if present) for "headerless" DATs, and leave the header intact for "headered" DATs (ignoring the `--remove-headers` option completely).

As explained above, you almost always want the "headered" version. It's only in very specific circumstances that you might need the "headerless" version.
