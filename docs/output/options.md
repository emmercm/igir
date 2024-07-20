# ROM Writing Options

## Overwriting files

By default, `igir` will _not_ overwrite or delete any files already in the output directory.

To change this behavior, the `--overwrite` option will force overwriting files in the output directory as necessary. Be careful with this option as it can cause unnecessary wear and tear on your hard drives.

The `--overwrite-invalid` option can also overwrite files in the output directory, but _only_ if those files don't match the expected size and checksum. This uses the same logic as the `igir test` command. Combining this option with the [`igir clean` command](./cleaning.md) will result in your output directory being a perfect subset of files contained in your [DATs](../dats/introduction.md).

## Fixing ROM extensions

ROM dumpers don't always do a good job of using the generally accepted filename extension when writing files. In situations where DATs aren't provided, or information in DATs is incomplete, `igir` has some ability to find the correct extension that filenames should have. This is done using [file signatures](https://en.wikipedia.org/wiki/List_of_file_signatures), pieces of data that are common to every file of a certain format.

Here are some examples of common mistakes:

| Incorrect extensions                                                   | Correct extension                    |
   |------------------------------------------------------------------------|--------------------------------------|
| `.fc` Nintendo Family Computer<br>`.nez` Nintendo Entertainment System | `.nes` Nintendo Entertainment System |
| `.sgb` Nintendo Super Game Boy                                         | `.gbc` Nintendo Game Boy Color       |
| `.bin` Sega Mega Drive / Genesis<br>`.gen` Sega Genesis                | `.md` Sega Mega Drive                |

This correction behavior can be controlled with the following option:

- `--fix-extension never`

  Don't correct any ROM filename extensions. If a DAT doesn't provide a ROM filename, a default name of `<game name>.rom` will be used.

- `--fix-extension auto` (default)

  When not using DATs (no [`--dat <path>` option](../dats/processing.md) was provided), or when a DAT doesn't specify the filename for a ROM, then try to correct the filename extension.

- `--fix-extension always`

  Always try to correct filename extensions, ignoring the information provided by DATs. You likely don't want this option.

See the `igir --help` message for the list of all known file types.
