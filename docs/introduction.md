# Introduction

## What is a ROM?

From [Wikipedia](https://en.wikipedia.org/wiki/ROM_image):

> A ROM image, or ROM file, is a computer file which contains a copy of the data from a read-only memory chip, often from a video game cartridge, or used to contain a computer's firmware, or from an arcade game's main board. The term is frequently used in the context of emulation, whereby older games or firmware are copied to ROM files on modern computers and can, using a piece of software known as an emulator, be run on a different device than which they were designed for.

A "ROM" typically refers to a single file of game data, of which there can be multiple for a single game. The term has also expanded to include files from other types of storage media, such as hard drives or optical discs.

But generally, a ROM is a byte-for-byte copy of game data, typically structured or organized in a format that can be used by emulators.

## What is a ROM manager?

ROM managers are applications that serve two main purposes:

1. To help you organize your video game ROM collection (including into formats required by some emulators)
2. To help you understand what video game ROMs are missing from your collection

all additional features help serve these two purposes.

Most ROM managers can automatically read & write many different ROM types, including those in [archives](input/reading-archives.md) and those with [headers](roms/headers.md) so that you don't have to do much pre-work.

Most ROM managers rely on [DATs](dats/introduction.md), files that catalog every known ROM that exists per game system. You can think of DATs as databases of games and game files, but with an opinionated naming scheme. DATs are published by release groups dedicated to keeping these catalogs accurate and up to date. DATs help ROM collectors name their ROMs consistently, as well as understand what ROMs may be missing from their collection.

## What is Igir?

Igir is a ROM manager for the modern age.

Most ROM managers are only built for Windows (though some offer workarounds for running on macOS and Linux). Most of these managers have confusing GUIs that make batch-able, repeatable actions difficult. Igir is a command line tool that works on any OS.

Igir has features that aren't found in any other ROM managers, such as [ROM patching](roms/patching.md), [ROM trim detection](roms/trimming.md), [ROM extension correction](output/options.md#fixing-rom-extensions), multi-disc [playlist creation](output/playlists.md), and more.

!!! info

    See the [alternative managers](alternatives.md) page for a feature comparison between Igir and other ROM managers.

## Why should I use Igir?

If you aren't using a ROM manager already, Igir can help you:

- Sort your ROM files into meaningful folders.
- Name your ROM files consistently.
- Filter out undesired ROM files.
- Convert your ROM files into consistent format (archived or unarchived).

If you are already using a ROM manager, Igir can help you:

- Cut down on the number of necessary tools by combining functionality that has historically required different applications.
- Script repeatable actions with its CLI nature.
- Organize your ROM files on any modern OS, not just Windows.

See the [basic usage](usage/basic.md) page to see real world use cases for Igir!

## Next steps

See the [installation](installation.md) page for instructions on getting Igir installed.
