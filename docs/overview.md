# Overview

## What is a ROM?

From [Wikipedia](https://en.wikipedia.org/wiki/ROM_image):

> A ROM image, or ROM file, is a computer file which contains a copy of the data from a read-only memory chip, often from a video game cartridge, or used to contain a computer's firmware, or from an arcade game's main board. The term is frequently used in the context of emulation, whereby older games or firmware are copied to ROM files on modern computers and can, using a piece of software known as an emulator, be run on a different device than which they were designed for.

ROMs are complete copies of game data stored in cartridges or on discs.

A game may consist of multiple ROMs. For example, arcade cabinets that contain multiple chips, or disc-based games that have multiple tracks on the disc.

## What is a ROM manager?

ROM managers are applications that serve two main purposes:

1. Help you organize your video game ROM collection
2. Help you understand what video game ROMs are missing from your collection

all additional features help serve these two purposes.

Most ROM managers can automatically read & write many different ROM types including those in [archives](input/reading-archives.md) and those with [headers](roms/headers.md) so that you don't have to do much pre-work.

Most ROM managers rely on [DATs](input/dats.md), files that catalog every known ROM that exists per game system. DATs are published by release groups dedicated to keeping these catalogs accurate and up-to-date. DATs help ROM collectors name their ROMs in a consistent way as well as understand what ROMs may be missing from their collection.

## What is `igir`?

`igir` is a ROM manager for the modern age.

Most ROM managers are only built for Windows, and some offer workarounds for running on macOS and Linux. Most of these managers have confusing GUIs that make batch-able, repeatable actions difficult. `igir` is a command line tool that works on any OS.

In addition, `igir` has features that aren't found in any other ROM managers, such as [ROM patching](roms/patching.md).

!!! info

    See the [alternative managers](alternatives.md) page for a feature comparison between `igir` and other ROM managers.

## Next steps

See the [installation](installation.md) page for instructions on getting `igir` installed.
