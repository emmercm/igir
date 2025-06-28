# CLI Overview

Igir uses a series of live-updating progress bars to indicate what it is currently working on and how much processing is left to do.

<script src="https://asciinema.org/a/xE6kMquCPFYtpvhsiQfS0eS7c.js" id="asciicast-xE6kMquCPFYtpvhsiQfS0eS7c" async="true"></script>

See the [internal operations](advanced/internals.md#order-of-operations) page for more information on every processing that Igir might do.

## Progress bar icons

ASCII symbols are used to indicate what processing is happening. Here is a table of those symbols, in order:

| Symbol (magenta)                                           | Scanning operation                                                                        |
|------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| <span style="color:#AA00AA"><b>↻</b></span> (circle arrow) | Files (DATs, ROMs, patches, etc.) are being found/enumerated                              |
| <span style="color:#AA00AA"><b>↓</b></span> (down arrow)   | [DATs](dats/introduction.md) are being [downloaded](dats/processing.md#scanning-for-dats) |
| <span style="color:#AA00AA"><b>Σ</b></span> (sigma)        | [DATs](dats/introduction.md) are being parsed                                             |
| <span style="color:#AA00AA"><b>#</b></span> (hash)         | ROMs are having checksums calculated for [matching](roms/matching.md)                     |
| <span style="color:#AA00AA"><b>^</b></span> (hat)          | ROMs are being checked for [headers](roms/headers.md)                                     |

| Symbol (cyan)                                                   | Per-DAT processing operation                                                                  |
|-----------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| <span style="color:#00AAAA"><b>∩</b></span> (intersection)      | DATs are having parent/clone information [inferred](dats/processing.md#parentclone-inference) |
| <span style="color:#00AAAA"><b>↔</b></span> (left/right arrows) | DATs are having [merge/split rules](usage/arcade.md#rom-set-merge-types) applied              |
| <span style="color:#00AAAA"><b>∆</b></span> (delta)             | DAT is being [filtered](roms/filtering-preferences.md#filters)                                |
| <span style="color:#00AAAA"><b>⇅</b></span> (up/down arrows)    | ROM [1G1R rules](roms/filtering-preferences.md#preferences-for-1g1r) are being applied        |
| <span style="color:#00AAAA"><b>Σ</b></span> (sigma)             | ROMs are being [matched](roms/matching.md) to the DAT                                         |
| <span style="color:#00AAAA"><b>.</b></span> (period)            | ROM matches are having their [extension corrected](output/options.md#fixing-rom-extensions)   |
| <span style="color:#00AAAA"><b>≟</b></span> (question equal)    | ROM matches are being checked for issues                                                      |
| <span style="color:#00AAAA"><b>∪</b></span> (union)             | ROM matches are being combined into one zip                                                   |

| Symbol (yellow)                                              | Per-DAT writing operation                                                                                                  |
|--------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| <span style="color:#AAAA00"><b>#</b></span> (hash)           | Archives are having checksums calculated to [test](commands.md#test) after [writing](commands.md#rom-writing)              |
| <span style="color:#AAAA00"><b>≟</b></span> (question equal) | Output files are being checked before being [overwritten](output/options.md#overwriting-files), no writing has started yet |
| <span style="color:#AAAA00"><b>✎</b></span> (pencil)         | Output files are or have been written                                                                                      |

| Symbol                                                | Deleting operation                                                                                          |
|-------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| <span style="color:#0000AA"><b>♻</b></span> (recycle) | Output directory [cleaned files](output/cleaning.md) are being recycled                                     |
| <span style="color:#AA0000"><b>✕</b></span> (x)       | Moved ROM matches are being deleted, output directory [cleaned files](output/cleaning.md) are being deleted |
