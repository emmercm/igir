# File Cache

Calculating certain information for files can be quite expensive, especially if archives have to be decompressed first. Igir remembers the results of many file operations and stores them in a cache file.

## Operations cached

Igir caches the following file operations:

- Calculating checksums for plain files
- Calculating checksums for files in [archives](../input/reading-archives.md)
- Calculating [file headers](../roms/headers.md)
- Calculating [file signatures](../output/options.md#fixing-rom-extensions)
- Calculating [file paddings](../roms/trim-detection.md)

The results are stored using the file's absolute path. Igir stores and checks if the file's size or modified timestamp has changed since the cached result was calculated, and if there's a mismatch, will recalculate the file operation.

## Files that Igir writes

Because results are stored by file path, a file that Igir [copies](../commands.md#copy) or [moves](../commands.md#move) to a new location wouldn't have a cached result at its new path, and would need to be read again on the next run.

To avoid this, Igir caches what it already knows about every file it writes:

- When copying or moving files, the output file has the same contents as the input file, so the input file's checksums are cached for the output file's path
- When [writing zip files](../output/writing-archives.md), Igir already knows the checksums of every entry it wrote, so they're cached for the output zip's path

This means a subsequent run that uses the output directory as an input directory won't need to re-read those files.

Igir won't cache results for files whose contents it changed while writing them, because the input file's checksums no longer describe the output file. That includes [removing headers](../roms/headers.md), [applying patches](../roms/patching.md), and [restoring padding](../roms/trim-detection.md) to trimmed ROMs.

Cached results for written files are only as trustworthy as the write that produced them. Use the [`test` command](../commands.md#test) if you want Igir to verify what it wrote before trusting it.

## File format

The cache is a gzipped JSON file. You can explore the contents of it with commands such as:

=== ":fontawesome-brands-apple: macOS"

    ```shell
    gunzip -c ~/igir.cache > igir.cache.json

    gunzip -c ~/igir.cache | jq
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    gunzip -c ~/igir.cache > igir.cache.json

    gunzip -c ~/igir.cache | jq
    ```

## Changing the cache path

Igir will look for existing cache files in these locations, in order:

1. User's home directory: `~/igir.cache` (macOS, Linux) or `%HOMEPATH%\igir.cache` (Windows)
2. Current working directory: `igir.cache`

If no existing cache file is found, then Igir will choose the first path it can write to in the same priority order.

You can tell Igir to read & write the cache file to a specific location with the option:

```text
--cache-path <path>
```

## Disabling the cache

You can instruct Igir to not load any existing cache file, and to not write any cache file, with the option:

```text
--disable-cache
```
