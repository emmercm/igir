# Reporting

When using DATs (the `--dat` option), the `igir report` command can report on:

- What ROMs were found, and where the files are
- What ROMs are missing
- What input files didn't match to any ROM
- What output files were cleaned (`igir clean` command)

At least one DAT is required for the `igir report` command to work, otherwise `igir` has no way to understand what input files are known ROMs and which aren't. See the [DAT docs](dats.md) for more information about DATs.

The `igir report` can be specified on its own without any writing command in order to report on an existing collection, e.g.:

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

When writing to an output directory (i.e. the `igir copy`, `igir move`, and `igir symlink` commands), `igir` will write the report to the root of that directory, e.g.:

```shell
$ igir copy extract report --dat *.dat --input ROMs-Unsorted/ --output ROMs-Sorted/

$ ls ROMs-Sorted/*.csv
ROMs-Sorted/igir_2023-03-29T18;26;00-04;00.csv
```

When not writing anything (i.e. `igir report` without any other commands), `igir` will write the report to the root of the first input directory, e.g.:

```shell
$ igir report --dat *.dat --input ROMs/

$ ls ROMs/*.csv
ROMs/igir_2023-03-29T18;26;00-04;00.csv
```
