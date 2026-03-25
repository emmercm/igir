# ROM Scanning

The `--input <path|glob>` option is required for almost every [command](../commands.md). It tells Igir what path(s) to look for ROMs in. The option can be provided multiple times, to specify different paths or [glob patterns](../input/file-scanning.md#glob-patterns).

See the [file scanning docs](../input/file-scanning.md) for more information about how Igir scans for files, generally.

## The golden rule

Igir will only ever write a file to the [`--output <path>`](../output/path-options.md#base-output-directory) using a file from an input path. In other words, Igir will _not_ automatically scan the output directory and copy, move, or link any files within it.

This is different from other ROM managers

This behavior is to give you very granular control over what files are written where, but it has these important consequences:

- The [`igir dir2dat`](../dats/dir2dat.md) and [`igir fixdat`](../dats/fixdats.md) commands only process files from input directories.
- The [`igir clean` command](../output/cleaning.md) will delete any files in the output directory that match a [DAT](../dats/processing.md) but are not in the correct path. You need to first copy or move files already in the output directory to the correct path, which can be done by specifying the output directory as an input directory.

## Scanning exclusions

Input file exclusions can be provided with the option:

```text
--input-exclude <path|glob>
```

This can help you exclude files that take a long time to process or are unnecessary to process.
