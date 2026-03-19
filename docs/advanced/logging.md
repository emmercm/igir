# Logging

## Debug logs

It is required to submit a debug log with any bug reports. Igir has many options, and every person's scenario is different, so a debug log is critical to reproduce the issue.

To generate this debug log, provide the option:

```text
--debug-log
```

This will write the log file to the current working directory. You can provide a file path to the option if you want to write it somewhere else:

```text
--debug-log <path>
```

Debug logs will always be written with the most verbose log level.

## Log levels

By default, Igir will print the following log levels:

- `ERROR`: an unexpected error has prevented an intended [command](../commands.md)
- `WARN`: a preventable error has prevented an intended [command](../commands.md)

There are additional levels of verbosity that can be enabled with the `-v` flag:

- **`INFO` (`-v`): print information about actions taken.**

  This includes:

  - Files being copied, zipped, and linked
  - [dir2dat](../dats/dir2dat.md) files being created
  - [Fixdat](../dats/fixdats.md) files being created
  - Leftover input files deleted after being moved
  - Output files being [cleaned](../output/cleaning.md) (including files skipped due to `--clean-dry-run`)
  - [Report](../output/reporting.md) files being created

  Usage:

  ```shell
  igir [commands..] [options] -v
  ```

  This level is helpful to turn on if you want to know every action that is resulting in a file being created, modified, or deleted.

- **`DEBUG` (`-vv`): print information about actions taken and skipped.**

  This includes:

  - Everything from the `INFO` level above
  - Files skipped from being copied, zipped, or linked because the output file exists and an [`--overwrite` option](../output/options.md#overwriting-files) wasn't provided
  - [Fixdat](../dats/fixdats.md) files skipped from being created because all games were found

  Usage:

  ```shell
  igir [commands..] [options] -vv
  ```

  This level is helpful to turn on if you want to debug why an action didn't take place.

- **`TRACE` (`-vvv`): print information about actions taken, skipped, and additional information that can be helpful to debug issues.**

  Usage:

  ```shell
  igir [commands..] [options] -vvv
  ```

  !!! note

      Trace logs are required when submitting [bug reports](https://github.com/emmercm/igir/issues/new/choose) as they include information that can help diagnose your unique situation!

## Output redirection

Igir is smart enough to detect if the standard output is a TTY terminal or not, and if it is not, will not render progress bars and may format log lines differently. This lets you safely pipe the output of Igir:

=== ":fontawesome-brands-apple: macOS"

    ```shell
    igir [commands..] [options] > out.log
    ```

    ```shell
    igir [commands..] [options] | tee out.log
    ```

=== ":simple-linux: Linux"

    ```shell
    igir [commands..] [options] > out.log
    ```

    ```shell
    igir [commands..] [options] | tee out.log
    ```
