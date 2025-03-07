# Writing ROM Reports

## Overview

When using DATs (the [`--dat <path>` option](../dats/processing.md#scanning-for-dats)), the `igir report` [command](../commands.md) can report on:

- `FOUND`: what ROMs were found, and where their files are on disk
- `MISSING`: what ROMs were wanted, but weren't found
- `DUPLICATE`: what input files _did_ match to a ROM but weren't used when writing
- `UNUSED`: what input files didn't match to any ROM
- `DELETED`: what output files were [cleaned](cleaning.md) (`igir clean` command)

At least one DAT is required for the `igir report` command to work, otherwise Igir has no way to understand what input files are known ROMs and which aren't. See the [DAT docs](../dats/introduction.md) for more information about DATs.

The `igir report` command can be specified on its own without any [writing command](../commands.md) (i.e. `igir copy`, `igir move`, etc.) to report on an existing collection. This causes Igir to operate in a _read-only_ mode, no files will be copied, moved, or deleted. For example:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    > igir.exe report --dat *.dat --input ROMs\

    > dir /b *.csv
    igir_2023-03-29T18;26;00-04;00.csv
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    $ igir report --dat *.dat --input ROMs/

    $ ls *.csv
    igir_2023-03-29T18;26;00-04;00.csv
    ```

=== ":simple-linux: Linux"

    ```shell
    $ igir report --dat *.dat --input ROMs/

    $ ls *.csv
    igir_2023-03-29T18;26;00-04;00.csv
    ```

See the `igir --help` message for the report's default location.

## Format & filtering

The output report format is a standard CSV that can be opened in Microsoft Excel, Apple Numbers, Google Sheets, LibreOffice Calc, and other similar spreadsheet applications.

Unlike the report formats of [other ROM managers](../alternatives.md), CSVs allow you to filter rows by column values. For example, you can filter the "Status" column to only "MISSING" to understand what ROMs are missing from your collection, or to "UNUSED" to understand what input files weren't used as the source of any output file. The ability to filter CSVs in spreadsheet applications means that Igir shouldn’t need use-case-specific report options to achieve your goal.

To perform this filtering, most spreadsheet applications have a button or menu item to "create a filter" or "auto filter."

## Output location

The `--report-output <path>` option is provided to configure where the `igir report` CSV is written. See the `igir --help` message for the report's default location.

The report output filename supports a version of [Moment.js symbols](https://momentjs.com/docs/#/displaying/) for date and time. To make it clearer what is a replaceable symbol, `%` is prepended to symbols. This is _non-standard_ for Moment.js, but the `%` format should feel more familiar to more people as it resembles [Python's `date.strftime()`](https://docs.python.org/3/library/datetime.html#datetime.date.strftime), [PHP's `strftime()`](https://www.php.net/manual/en/function.strftime.php), [C++'s `strftime()`](https://cplusplus.com/reference/ctime/strftime/), and more.

!!! info

    See the [Moment.js docs](https://momentjs.com/docs/#/displaying/) for a complete list of tokens you can use.

!!! warning

    The `%` character is used to denote replaceable variable names (such as `%USERPROFILE%` and `%TEMP%`) in Windows Batch scripting. You may need to "escape" `%` characters with a `^` if you experience problems. Example:

    ```text
    --report-output ^%X.csv
    ```

Here are some example usages:

=== ":fontawesome-brands-windows: Windows"

    ```batch
    > igir.exe report --dat *.dat --input ROMs\ --report-output ".\report.csv"

    > igir.exe report --dat *.dat --input ROMs\ --report-output ".\report %dddd, %MMMM %Do %YYYY, %h:%mm:%ss %a.csv"
    REM ./report Friday, April 14th 2023, 4:28:26 pm.csv

    > igir.exe report --dat *.dat --input ROMs\ --report-output "igir\%X.csv"
    REM /igir/1681515048.csv
    ```

=== ":fontawesome-brands-apple: macOS"

    ```shell
    $ igir report --dat *.dat --input ROMs/ --report-output "./report.csv"

    $ igir report --dat *.dat --input ROMs/ --report-output "./report %dddd, %MMMM %Do %YYYY, %h:%mm:%ss %a.csv"
    # ./report Friday, April 14th 2023, 4:28:26 pm.csv

    $ igir report --dat *.dat --input ROMs/ --report-output "igir\%X.csv"
    # /igir/1681515048.csv
    ```

=== ":simple-linux: Linux"

    ```shell
    $ igir report --dat *.dat --input ROMs/ --report-output "./report.csv"

    $ igir report --dat *.dat --input ROMs/ --report-output "./report %dddd, %MMMM %Do %YYYY, %h:%mm:%ss %a.csv"
    # ./report Friday, April 14th 2023, 4:28:26 pm.csv

    $ igir report --dat *.dat --input ROMs/ --report-output "igir/%X.csv"
    # /igir/1681515048.csv
    ```
