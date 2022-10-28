# ROM Headers

There are a handful of consoles where it is common for their ROMs to have extra data at the beginning of the file (a "header") that wasn't present on the physical ROM chip.

Some these headers are used to tell the emulator information about how to emulate the game (Atari 7800 "A78", Nintendo Entertainment System "iNES", Famicom Disk System "FDS", etc.). There are other consoles where it is somewhat common to find the ROMs without a header (Atari Lynx "LYX", Super Nintendo Entertainment System "SFC").

## Header detection

`igir` can detect headers for the following consoles and file extensions:

| Console                        | Header        | Extension |
|--------------------------------|---------------|-----------|
| Atari 7800                     | A78           | `.a78`    |
| Atari Lynx                     | LNX           | `.lnx`    |
| Nintendo - NES                 | iNES, NES 2.0 | `.nes`    |
| Nintendo - Famicom Disk System | fsNES/FDS     | `.fds`    |
| Nintendo - SNES                | SMC           | `.smc`    |

Those file extensions above are the commonly accepted "correct" ones and `igir` will attempt to detect if a header is present in them automatically. If for some reason your files don't have the right extension (e.g. `.rom`) you can force header detection with the `--header` glob option:

```shell
igir [commands..] --dat <dats> --input <input> --header "*.rom"
```

`igir` will use this detected header information to compute both "headered" and "un-headered" checksums of ROMs and use both of those to match against DAT files. Many DAT groups expressly only include the size and checksum information for the un-headered file, even if the header should not be removed.

## Header removal

Some emulators cannot parse ROMs with headers and instead need an "un-headered" version. This seems to be most common with SNES. Typically, "un-headered" files will have a different file extension:

| Console                        | Header        | Headered<br/>Extension | Un-headered<br/>Extension |
|--------------------------------|---------------|------------------------|---------------------------|
| Atari 7800                     | A78           | `.a78`                 | N/A                       |
| Atari Lynx                     | LNX           | `.lnx`                 | `.lyx`                    |
| Nintendo - NES                 | iNES, NES 2.0 | `.nes`                 | N/A                       |
| Nintendo - Famicom Disk System | fsNES/FDS     | `.fds`                 | N/A                       |
| Nintendo - SNES                | SMC           | `.smc`                 | `.sfc`                    |

For every console that `igir` can understand the headers for, it can also remove them with the `--remove-headers` option. This only makes sense for the consoles above with different "un-headered" extensions, so you have to specify the extensions like this:

```shell
igir [commands..] --dat <dats> --input <input> --remove-headers .lnx,.smc
```

But if you're absolutely sure you want to remove any known header from every single ROM file, you can omit the extensions:

```shell
igir [commands..] --dat <dats> --input <input> --remove-headers
```
