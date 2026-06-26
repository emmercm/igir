# DAT Processing

Igir has a number of ways it can process [DATs](introduction.md), and it processes them in the following order.

## DAT filtering

The [`--dat-exclude <path|glob>`](scanning.md#scanning-exclusions) option can help you exclude entire files from being processed, but additional options are provided to help filter DATs within archives.

### DAT name regex filtering

```text
--dat-name-regex <pattern|filename>
```

```text
--dat-name-regex-exclude <pattern|filename>
```

These options limit which DATs are processed. The regex is applied to the DAT's name found within its file contents, _not_ its filename.

Regex flags can be optionally provided in the form `/<pattern>/<flags>`, for example:

```text
Headerless|Encrypted
/headerless|encrypted/i
```

!!! tip

    `--dat-name-regex-exclude <pattern|filename>` is particularly helpful for excluding some No-Intro DATs versions such as "encrypted" and "headerless".

!!! example

    Processing a directory of No-Intro DATs while excluding the "headerless" and "encrypted" variants:

    === ":fontawesome-brands-windows: Windows"

        ```batch
        igir copy ^
          --dat "No-Intro*.zip" ^
          --dat-name-regex-exclude "/headerless|encrypted/i" ^
          --input ROMs ^
          --output ROMs-Sorted
        ```

    === ":fontawesome-brands-apple: macOS"

        ```shell
        igir copy \
          --dat "No-Intro*.zip" \
          --dat-name-regex-exclude "/headerless|encrypted/i" \
          --input ROMs \
          --output ROMs-Sorted
        ```

    === ":simple-linux: Linux"

        ```shell
        igir copy \
          --dat "No-Intro*.zip" \
          --dat-name-regex-exclude "/headerless|encrypted/i" \
          --input ROMs \
          --output ROMs-Sorted
        ```

### DAT description regex filtering

```text
--dat-description-regex <pattern|filename>
```

```text
--dat-description-regex-exclude <pattern|filename>
```

These options limit which DATs are processed. The regex is applied to the DAT's description found within its file contents.

## DAT combining

The `--dat-combine` option lets you combine every game from every parsed DAT into one file.

This may be desirable when creating a [dir2dat](dir2dat.md), a [fixdat](fixdats.md), or other complicated situations.

!!! example

    TOSEC separates DATs by region, so combining all regions for one console into one DAT may be desirable:

    === ":fontawesome-brands-windows: Windows"

        ```batch
        igir copy ^
          --dat "TOSEC*.zip" ^
          --dat-name-regex "/Dreamcast/i" ^
          --dat-combine ^
          --input ROMs ^
          --output ROMs-Dreamcast
        ```

    === ":fontawesome-brands-apple: macOS"

        ```shell
        igir copy \
          --dat "TOSEC*.zip" \
          --dat-name-regex "/Dreamcast/i" \
          --dat-combine \
          --input ROMs \
          --output ROMs-Dreamcast
        ```

    === ":simple-linux: Linux"

        ```shell
        igir copy \
          --dat "TOSEC*.zip" \
          --dat-name-regex "/Dreamcast/i" \
          --dat-combine \
          --input ROMs \
          --output ROMs-Dreamcast
        ```

!!! note

    Combining this option with the [`--zip-dat-name` option](../output/writing-archives.md#grouping-roms-by-dat-name) will create one, potentially extremely large, output archive. This may be desirable in some cases, but likely undesirable for most users.

## Parent/clone inference

One feature that sets Igir apart from other ROM managers is its ability to infer parent/clone information when DATs don't provide it. For example, Redump DATs don't provide parent/clone information, which makes it much more difficult to create [1G1R](../roms/1g1r.md) sets.

For example, all of these Super Smash Bros. Melee releases should be considered the same game, even if a DAT doesn't provide proper information. If the releases are all considered the same game, then the `--single` option can be used in combination with [1G1R preferences](../roms/1g1r.md) to make a 1G1R set. Igir is smart enough to understand that the only differences between these releases are the regions, languages, and revisions.

```text
Super Smash Bros. Melee (Europe) (En,Fr,De,Es,It)
Super Smash Bros. Melee (Korea) (En,Ja)
Super Smash Bros. Melee (USA) (En,Ja)
Super Smash Bros. Melee (USA) (En,Ja) (Rev 1)
Super Smash Bros. Melee (USA) (En,Ja) (Rev 2)
```

!!! note

    If a DAT has any parent/clone information then Igir will use that and skip inference. If you want to ignore this information and use Igir's inference instead, you can provide the `--dat-ignore-parent-clone` option.

!!! note

    It is unlikely that Igir will ever be perfect with inferring parent/clone information. If you find an instance where Igir made the wrong choice, please create a [GitHub issue](https://github.com/emmercm/igir/issues).

!!! tip

    [Retool](https://github.com/unexpectedpanda/retool) (no longer maintained) is a DAT manipulation tool that has a set of hand-maintained [parent/clone lists](https://github.com/unexpectedpanda/retool-clonelists-metadata) to supplement common DAT groups such as No-Intro and Redump. This helps cover situations such as release titles in different languages that would be hard to group together automatically.

    1G1R DATs made by Retool can be used seamlessly with Igir. You won't need to supply the `--single` option or any [ROM 1G1R preferences](../roms/1g1r.md) for Igir, as you would have already applied these preferences in Retool, but you can still supply [ROM filtering](../roms/filtering.md) options if desired.
