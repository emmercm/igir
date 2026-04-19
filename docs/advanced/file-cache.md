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
