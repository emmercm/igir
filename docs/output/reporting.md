# Reporting

## Overview

When using DATs (the `--dat` option), the `igir report` command can report on:

- What ROMs were found, and where the files are
- What ROMs are missing
- What input files didn't match to any ROM
- What output files were cleaned (`igir clean` command)

At least one DAT is required for the `igir report` command to work, otherwise `igir` has no way to understand what input files are known ROMs and which aren't. See the [DAT docs](../input/dats.md) for more information about DATs.

The `igir report` can be specified on its own without any [writing command](../commands.md) in order to report on an existing collection, e.g.:

```shell
$ igir report --dat *.dat --input ROMs/

$ ls ROMs/*.csv
ROMs/igir_2023-03-29T18;26;00-04;00.csv
```

## Format & filtering

The output report format is a standard CSV which can be opened in Microsoft Excel, Apple Numbers, Google Sheets, LibreOffice Calc, and similar spreadsheet applications.

Unlike the report formats of other tools, CSVs allow you to filter rows by column values. For example, you can filter the "Status" column to only "MISSING" to understand what ROMs are missing from your collection, or to "UNMATCHED" to understand what input files aren't recognized as a known ROM. The ability to filter CSVs in spreadsheet applications means that `igir` should not need use-case-specific options to achieve your goal.

To perform this filtering, most spreadsheet applications have a button or menu item to "create a filter" or "auto filter."

## Output location

The `--report-output` options is provided to configure where the `igir report` report is written. See the `igir --help` message for the report's default location.

The report output filename supports a version of [Moment.js symbols](https://momentjs.com/docs/#/displaying/) for date and time. To make it clearer what is a replaceable symbol, `%` is prepended to symbols. This is _non-standard_ for Moment.js - but the `%` format should feel more familiar to more people as it resembles [Python's `date.strftime()`](https://docs.python.org/3/library/datetime.html#datetime.date.strftime), [PHP's `strftime()`](https://www.php.net/manual/en/function.strftime.php), [C++'s `strftime()`](https://cplusplus.com/reference/ctime/strftime/), and more.

!!! info

    See the [Moment.js docs](https://momentjs.com/docs/#/displaying/) for a complete list of tokens you can use.

Here are some example usages:

```shell
$ igir report --dat *.dat --input ROMs/ --report-output "./report.csv"

$ igir report --dat *.dat --input ROMs/ --report-output "./report %dddd, %MMMM %Do %YYYY, %h:%mm:%ss %a.csv"
# ./report Friday, April 14th 2023, 4:28:26 pm.csv

$ igir report --dat *.dat --input ROMs/ --report-output "/igir/%X.csv"
# /igir/1681515048.csv
```
