# Logging

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

  This level is helpful to turn on if you want debug why an action didn't take place.

- **`TRACE` (`-vvv`): print information about actions taken, skipped, and additional information that can be helpful to debug issues.**

  Usage:

  ```shell
  igir [commands..] [options] -vvv
  ```

  !!! note

      Trace logs are required when submitting [bug reports](https://github.com/emmercm/igir/issues/new/choose) as they include information that can help diagnose your unique situation!
