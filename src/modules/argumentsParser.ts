import terminalSize from 'term-size';
import yargs, { Argv } from 'yargs';

import Logger from '../console/logger.js';
import Constants from '../constants.js';
import FileHeader from '../types/files/fileHeader.js';
import Options from '../types/options.js';
import PatchFactory from '../types/patches/patchFactory.js';
import ReleaseCandidate from '../types/releaseCandidate.js';

/**
 * Parse a CLI argv string[] into {@link Options}.
 *
 * This class will not be run concurrently with any other class.
 */
export default class ArgumentsParser {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  private static getLastValue<T>(arr: T | T[]): T {
    if (Array.isArray(arr) && arr.length) {
      return arr[arr.length - 1];
    }
    return arr as T;
  }

  private static getHelpWidth(argv: string[]): number {
    // Look for --help/-h with a numerical value
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i].toLowerCase() === '--help' || argv[i].toLowerCase() === '-h') {
        const helpFlagVal = parseInt(argv[i + 1], 10);
        if (!Number.isNaN(helpFlagVal)) {
          return parseInt(argv[i + 1], 10);
        }
      }
    }

    return Math.min(
      // Use the terminal width if it has one
      process.stdout.isTTY ? terminalSize().columns : Number.MAX_SAFE_INTEGER,
      // Sane maximum
      110,
    );
  }

  parse(argv: string[]): Options {
    this.logger.info(`Parsing CLI arguments: ${argv}`);

    const groupInput = 'Input options (supports globbing):';
    const groupDat = 'DAT input options:';
    const groupOutput = 'ROM output options:';
    const groupArchive = 'Zip command options:';
    const groupSymlink = 'Symlink command options:';
    const groupHeader = 'ROM header options:';
    const groupFiltering = 'ROM filtering options:';
    const groupPriority = 'ROM priority options:';
    const groupHelpDebug = 'Help & debug options:';

    // Add every command to a yargs object, recursively, resulting in the ability to specify
    // multiple commands
    const addCommands = (yargsObj: Argv): Argv => yargsObj
      .command('copy', 'Copy ROM files from the input to output directory', (yargsSubObj) => {
        addCommands(yargsSubObj);
      })
      .command('move', 'Move ROM files from the input to output directory', (yargsSubObj) => {
        addCommands(yargsSubObj);
      })
      .command('symlink', 'Create symlinks in the output directory to ROM files in the input directory', (yargsSubObj) => {
        addCommands(yargsSubObj);
      })
      .command('extract', 'Extract ROM files in archives when copying or moving', (yargsSubObj) => {
        addCommands(yargsSubObj);
      })
      .command('zip', 'Create zip archives of ROMs when copying or moving', (yargsSubObj) => {
        addCommands(yargsSubObj);
      })
      .command('test', 'Test ROMs for accuracy after writing them to the output directory', (yargsSubObj) => {
        addCommands(yargsSubObj);
      })
      .command('clean', 'Recycle unknown files in the output directory', (yargsSubObj) => {
        addCommands(yargsSubObj);
      })
      .command('report', 'Generate a CSV report on the known ROM files found in the input directories (requires --dat)', (yargsSubObj) => {
        addCommands(yargsSubObj);
      })
      .check((checkArgv) => {
        if (checkArgv.help) {
          return true;
        }

        const writeCommands = ['copy', 'move', 'symlink'].filter((command) => checkArgv._.indexOf(command) !== -1);
        if (writeCommands.length > 1) {
          throw new Error(`Incompatible commands: ${writeCommands.join(', ')}`);
        }

        const archiveCommands = ['symlink', 'extract', 'zip'].filter((command) => checkArgv._.indexOf(command) !== -1);
        if (archiveCommands.length > 1) {
          throw new Error(`Incompatible commands: ${archiveCommands.join(', ')}`);
        }

        ['extract', 'zip'].forEach((command) => {
          if (checkArgv._.indexOf(command) !== -1 && ['copy', 'move'].every((write) => checkArgv._.indexOf(write) === -1)) {
            throw new Error(`Command "${command}" also requires the commands copy or move`);
          }
        });

        ['test', 'clean'].forEach((command) => {
          if (checkArgv._.indexOf(command) !== -1 && ['copy', 'move', 'symlink'].every((write) => checkArgv._.indexOf(write) === -1)) {
            throw new Error(`Command "${command}" requires one of the commands: copy, move, or symlink`);
          }
        });

        return true;
      });

    const yargsParser = yargs([])
      .parserConfiguration({
        'boolean-negation': false,
      })
      .locale('en')
      .scriptName(Constants.COMMAND_NAME)
      .usage('Usage: $0 [commands..] [options]');

    addCommands(yargsParser)
      .demandCommand(1, 'You must specify at least one command')
      .strictCommands(true);

    yargsParser
      .option('input', {
        group: groupInput,
        alias: 'i',
        description: 'Path(s) to ROM files or archives',
        demandOption: true,
        type: 'array',
        requiresArg: true,
      })
      .option('input-exclude', {
        group: groupInput,
        alias: 'I',
        description: 'Path(s) to ROM files or archives to exclude from processing',
        type: 'array',
        requiresArg: true,
      })
      .option('patch', {
        group: groupInput,
        alias: 'p',
        description: `Path(s) to ROM patch files or archives (supported: ${PatchFactory.getSupportedExtensions().join(', ')})`,
        type: 'array',
        requiresArg: true,
      })

      .option('dat', {
        group: groupDat,
        alias: 'd',
        description: 'Path(s) to DAT files or archives (supports globbing)',
        type: 'array',
        requiresArg: true,
      })
      .option('dat-exclude', {
        group: groupDat,
        description: 'Path(s) to DAT files or archives to exclude from processing (supports globbing)',
        type: 'array',
        requiresArg: true,
      })
      .option('dat-regex', {
        group: groupDat,
        description: 'Regular expression of DAT names to process',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('dat-regex-exclude', {
        group: groupDat,
        description: 'Regular expression of DAT names to exclude from processing',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .check((checkArgv) => {
        if (checkArgv.help) {
          return true;
        }
        const needDat = ['report'].filter((command) => checkArgv._.indexOf(command) !== -1);
        if ((!checkArgv.dat || !checkArgv.dat.length) && needDat.length) {
          throw new Error(`Missing required option for commands ${needDat.join(', ')}: dat`);
        }
        return true;
      })

      .option('output', {
        group: groupOutput,
        alias: 'o',
        description: 'Path to the ROM output directory (supports replaceable symbols, see below)',
        demandOption: false, // use the .check()
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('dir-mirror', {
        group: groupOutput,
        description: 'Use the input subdirectory structure for the output directory',
        type: 'boolean',
      })
      .option('dir-dat-name', {
        group: groupOutput,
        alias: 'D',
        description: 'Use the DAT name as the output subdirectory',
        type: 'boolean',
        implies: 'dat',
      })
      .option('dir-letter', {
        group: groupOutput,
        description: 'Append the first letter of the ROM name as an output subdirectory',
        type: 'boolean',
      })
      .option('overwrite', {
        group: groupOutput,
        alias: 'O',
        description: 'Overwrite any files in the output directory',
        type: 'boolean',
      })
      .option('clean-exclude', {
        group: groupOutput,
        alias: 'C',
        description: 'Path(s) to files to exclude from cleaning (supports globbing)',
        type: 'array',
        requiresArg: true,
      })
      .check((checkArgv) => {
        if (checkArgv.help) {
          return true;
        }
        const needOutput = ['copy', 'move', 'extract', 'zip', 'clean'].filter((command) => checkArgv._.indexOf(command) !== -1);
        if (!checkArgv.output && needOutput.length) {
          throw new Error(`Missing required option for commands ${needOutput.join(', ')}: output`);
        }
        return true;
      })

      .option('zip-exclude', {
        group: groupArchive,
        alias: 'Z',
        description: 'Glob pattern of files to exclude from zipping',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('zip-dat-name', {
        group: groupArchive,
        description: 'Group all ROMs from the same DAT into the same zip archive, if not excluded from zipping (enforces --dat-threads 1)',
        type: 'boolean',
      })
      .check((checkArgv) => {
        if (checkArgv.help) {
          return true;
        }
        const needZip = ['zip-exclude', 'zip-dat-name'].filter((option) => checkArgv[option]);
        if (checkArgv._.indexOf('zip') === -1 && needZip.length) {
          throw new Error(`Missing required command for options ${needZip.join(', ')}: zip`);
        }
        return true;
      })

      .option('symlink-relative', {
        group: groupSymlink,
        description: 'Create symlinks as relative to the target path, as opposed to absolute',
        type: 'boolean',
      })
      .check((checkArgv) => {
        if (checkArgv.help) {
          return true;
        }
        const needSymlink = ['symlink-relative'].filter((option) => checkArgv[option]);
        if (checkArgv._.indexOf('symlink') === -1 && needSymlink.length) {
          throw new Error(`Missing required command for options ${needSymlink.join(', ')}: symlink`);
        }
        return true;
      })

      .option('header', {
        group: groupHeader,
        description: 'Glob pattern of files to force header processing for',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('remove-headers', {
        group: groupHeader,
        alias: 'H',
        description: `Remove known headers from ROMs, optionally limited to a list of comma-separated file extensions (supported: ${FileHeader.getSupportedExtensions().join(', ')})`,
        type: 'string',
        coerce: (vals: string) => vals
          .split(',')
          .map((val) => {
            if (val === '') {
              // Flag was provided without any extensions
              return val;
            }
            return `.${val.replace(/^\.+/, '')}`;
          }),
      })

      .option('filter-regex', {
        group: groupFiltering,
        alias: 'x',
        description: 'Regular expression of game names to filter to',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('filter-regex-exclude', {
        group: groupFiltering,
        alias: 'X',
        description: 'Regular expression of game names to exclude',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('language-filter', {
        group: groupFiltering,
        alias: 'L',
        description: `List of comma-separated languages to filter to (supported: ${ReleaseCandidate.getLanguages().join(', ')})`,
        type: 'string',
        coerce: (val: string) => val.split(','),
        requiresArg: true,
      })
      .option('region-filter', {
        group: groupFiltering,
        alias: 'R',
        description: `List of comma-separated regions to filter to (supported: ${ReleaseCandidate.getRegions().join(', ')})`,
        type: 'string',
        coerce: (val: string) => val.split(','),
        requiresArg: true,
      })
      .option('only-bios', {
        group: groupFiltering,
        description: 'Filter to only BIOS files',
        type: 'boolean',
        conflicts: ['no-bios'],
      })
      .option('no-bios', {
        group: groupFiltering,
        description: 'Filter out BIOS files',
        type: 'boolean',
        conflicts: ['only-bios'],
      })
      .option('no-unlicensed', {
        group: groupFiltering,
        description: 'Filter out unlicensed ROMs',
        type: 'boolean',
      })
      .option('only-retail', {
        group: groupFiltering,
        description: 'Filter to only retail releases, enabling all the following options',
        type: 'boolean',
      })
      .option('no-demo', {
        group: groupFiltering,
        description: 'Filter out demo ROMs',
        type: 'boolean',
      })
      .option('no-beta', {
        group: groupFiltering,
        description: 'Filter out beta ROMs',
        type: 'boolean',
      })
      .option('no-sample', {
        group: groupFiltering,
        description: 'Filter out sample ROMs',
        type: 'boolean',
      })
      .option('no-prototype', {
        group: groupFiltering,
        description: 'Filter out prototype ROMs',
        type: 'boolean',
      })
      .option('no-test-roms', {
        group: groupFiltering,
        description: 'Filter out test ROMs',
        type: 'boolean',
      })
      .option('no-aftermarket', {
        group: groupFiltering,
        description: 'Filter out aftermarket ROMs',
        type: 'boolean',
      })
      .option('no-homebrew', {
        group: groupFiltering,
        description: 'Filter out homebrew ROMs',
        type: 'boolean',
      })
      .option('no-unverified', {
        group: groupFiltering,
        description: 'Filter out un-verified ROMs',
        type: 'boolean',
      })
      .option('no-bad', {
        group: groupFiltering,
        description: 'Filter out bad ROM dumps',
        type: 'boolean',
      })

      .option('single', {
        group: groupPriority,
        alias: 's',
        description: 'Output only a single game per parent (1G1R) (required for all options below, requires parent/clone DAT files)',
        type: 'boolean',
        implies: 'dat',
      })
      .option('prefer-verified', {
        group: groupPriority,
        description: 'Prefer verified ROM dumps over unverified',
        type: 'boolean',
        implies: 'single',
      })
      .option('prefer-good', {
        group: groupPriority,
        description: 'Prefer good ROM dumps over bad',
        type: 'boolean',
        implies: 'single',
      })
      .option('prefer-language', {
        group: groupPriority,
        alias: 'l',
        description: `List of comma-separated languages in priority order (supported: ${ReleaseCandidate.getLanguages().join(', ')})`,
        type: 'string',
        coerce: (val: string) => val.split(','),
        requiresArg: true,
        implies: 'single',
      })
      .option('prefer-region', {
        group: groupPriority,
        alias: 'r',
        description: `List of comma-separated regions in priority order (supported: ${ReleaseCandidate.getRegions().join(', ')})`,
        type: 'string',
        coerce: (val: string) => val.split(','),
        requiresArg: true,
        implies: 'single',
      })
      .option('prefer-revision-newer', {
        group: groupPriority,
        description: 'Prefer newer ROM revisions over older',
        type: 'boolean',
        conflicts: ['prefer-revision-older'],
        implies: 'single',
      })
      .option('prefer-revision-older', {
        group: groupPriority,
        description: 'Prefer older ROM revisions over newer',
        type: 'boolean',
        conflicts: ['prefer-revision-newer'],
        implies: 'single',
      })
      .option('prefer-retail', {
        group: groupPriority,
        description: 'Prefer retail releases (see --only-retail)',
        type: 'boolean',
        implies: 'single',
      })
      .option('prefer-parent', {
        group: groupPriority,
        description: 'Prefer parent ROMs over clones (requires parent/clone DAT files)',
        type: 'boolean',
        implies: ['dat', 'single'],
      })

      .option('dat-threads', {
        group: groupHelpDebug,
        description: 'Number of DATs to process in parallel',
        type: 'number',
        coerce: (val: number) => Math.max(val, 1),
        requiresArg: true,
        default: Constants.DAT_DEFAULT_THREADS,
      })
      .middleware((middlewareArgv) => {
        /* eslint-disable no-param-reassign */
        if (middlewareArgv.zipDatName) {
          middlewareArgv.datThreads = 1;
        }
      })
      .option('verbose', {
        group: groupHelpDebug,
        alias: 'v',
        description: 'Enable verbose logging, can specify up to three times (-vvv)',
        type: 'count',
      })

      .wrap(ArgumentsParser.getHelpWidth(argv))
      .version(false)

      // NOTE(cemmer): the .epilogue() renders after .example() but I want them switched
      .epilogue(`${'-'.repeat(ArgumentsParser.getHelpWidth(argv))}

Advanced usage:

  Tokens that are replaced when generating the output (--output) path of a ROM:
    {datName}             The name of the DAT that contains the ROM (e.g. "Nintendo - Game Boy")
    {datReleaseRegion}    The region of the ROM release (e.g. "USA"), each ROM can have multiple
    {datReleaseLanguage}  The language of the ROM release (e.g. "En"), each ROM can have multiple

    {inputDirname}    The input ROM's dirname
    {outputBasename}  Equivalent to "{outputName}.{outputExt}"
    {outputName}      The output ROM's filename without extension
    {outputExt}       The output ROM's extension

    {pocket}  The ROM's core-specific /Assets/* directory for the Analogue Pocket (e.g. "gb")
    {mister}  The ROM's core-specific /games/* directory for the MiSTer FPGA (e.g. "Gameboy")

Example use cases:

  Merge new ROMs into an existing ROM collection and generate a report:
    $0 copy report --dat *.dat --input **/*.zip --input ROMs/ --output ROMs/

  Generate a report on an existing ROM collection, without copying or moving ROMs (read only):
    $0 report --dat *.dat --input ROMs/

  Organize and zip an existing ROM collection:
    $0 move zip --dat *.dat --input ROMs/ --output ROMs/

  Produce a 1G1R set per console, preferring English ROMs from USA>WORLD>EUR>JPN:
    $0 copy --dat *.dat --input **/*.zip --output 1G1R/ --dir-dat-name --single --prefer-language EN --prefer-region USA,WORLD,EUR,JPN

  Copy all BIOS files into one directory, extracting if necessary:
    $0 copy extract --dat *.dat --input **/*.zip --output BIOS/ --only-bios

  Create patched copies of ROMs in an existing collection, not overwriting existing files:
    $0 copy extract --input ROMs/ --patch Patches/ --output ROMs/

  Copy ROMs to an Analogue Pocket and test they were written correctly:
    $0 copy extract test --dat *.dat --input ROMs/ --output /Assets/{pocket}/common/ --dir-letter

  Symlink Super Game Boy enhanced ROMs to an Analogue Pocket SGB folder:
    $0 symlink --input "/Assets/gb?(c)/common/**" --output /Assets/sgb/common/ --dir-letter --filter-regex "/SGB Enhanced/i"`)

      // Colorize help output
      .option('help', {
        group: groupHelpDebug,
        alias: 'h',
        description: 'Show help',
        type: 'boolean',
      })
      .fail((msg, err, _yargs) => {
        if (err) {
          throw err;
        }
        this.logger.colorizeYargs(`${_yargs.help().toString().trimEnd()}\n`);
        throw new Error(msg);
      });

    const yargsArgv = yargsParser
      .strictOptions(true)
      .parse(argv, {}, (err, parsedArgv, output) => {
        if (output) {
          this.logger.colorizeYargs(`${output.trimEnd()}\n`);
        }
      });

    const options = Options.fromObject(yargsArgv);
    this.logger.info(`Parsed options: ${options.toString()}`);

    return options;
  }
}
