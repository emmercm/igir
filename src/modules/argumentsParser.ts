import terminalSize from 'term-size';
import yargs, { Argv } from 'yargs';

import Logger from '../console/logger.js';
import Constants from '../constants.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';

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

    const groupInputOutputPaths = 'Path options (inputs support globbing):';
    const groupInput = 'Input options:';
    const groupOutput = 'Output options:';
    const groupPriority = 'Priority options (requires --single):';
    const groupFiltering = 'Filtering options:';
    const groupHelp = 'Help options:';

    // Add every command to a yargs object, recursively, resulting in the ability to specify
    // multiple commands
    const addCommands = (yargsObj: Argv): Argv => yargsObj
      .command('copy', 'Copy ROM files from the input to output directory', (yargsSubObj) => {
        addCommands(yargsSubObj);
      })
      .command('move', 'Move ROM files from the input to output directory', (yargsSubObj) => {
        addCommands(yargsSubObj);
      })
      .command('zip', 'Create .zip archives when copying or moving ROMs', (yargsSubObj) => {
        addCommands(yargsSubObj);
      })
      .command('test', 'Test ROMs for accuracy after writing them to the output directory', (yargsSubObj) => {
        addCommands(yargsSubObj);
      })
      .command('clean', 'Recycle unknown files in the output directory', (yargsSubObj) => {
        addCommands(yargsSubObj);
      })
      .command('report', 'Generate a report on the known ROM files found in the input directories', (yargsSubObj) => {
        addCommands(yargsSubObj);
      });

    const yargsParser = yargs([])
      .parserConfiguration({
        'boolean-negation': false,
      })
      .scriptName(Constants.COMMAND_NAME)
      .usage('Usage: $0 [commands..] [options]');

    addCommands(yargsParser)
      .demandCommand(1, 'You must specify at least one command')
      .strictCommands(true);

    yargsParser
      .option('dat', {
        group: groupInputOutputPaths,
        alias: 'd',
        description: 'Path(s) to DAT files or archives',
        demandOption: true,
        type: 'array',
        requiresArg: true,
        default: ['*.dat'],
      })
      .option('input', {
        group: groupInputOutputPaths,
        alias: 'i',
        // TODO(cemmer): add a warning when input and output directories are the same, but also
        // have a "yes" flag
        description: 'Path(s) to ROM files or archives, these files will not be modified',
        demandOption: true,
        type: 'array',
        requiresArg: true,
      })
      .option('input-exclude', {
        group: groupInputOutputPaths,
        alias: 'I',
        description: 'Path(s) to ROM files to exclude',
        type: 'array',
        requiresArg: true,
      })
      .option('output', {
        group: groupInputOutputPaths,
        alias: 'o',
        description: 'Path to the ROM output directory',
        demandOption: false, // use the .check()
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .check((checkArgv) => {
        if (checkArgv.help) {
          return true;
        }
        const needOutput = ['copy', 'move', 'zip', 'clean'].filter((command) => checkArgv._.indexOf(command) !== -1);
        if ((!checkArgv.output || !checkArgv.output.length) && needOutput.length) {
          throw new Error(`Missing required option for commands ${needOutput.join(', ')}: output`);
        }
        return true;
      })

      .option('header', {
        group: groupInput,
        alias: 'H',
        description: 'Glob pattern of files to force header processing for',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })

      .option('dir-mirror', {
        group: groupOutput,
        description: 'Use the input subdirectory structure for output subdirectories',
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
      .option('single', {
        group: groupOutput,
        alias: 's',
        description: 'Output only a single game per parent (1G1R) (requires parent-clone DAT files)',
        type: 'boolean',
      })
      .option('zip-exclude', {
        group: groupOutput,
        alias: 'Z',
        description: 'Glob pattern of files to exclude from zipping',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('overwrite', {
        group: groupOutput,
        alias: 'O',
        description: 'Overwrite any ROMs in the output directory',
        type: 'boolean',
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
        description: 'Prefer parent ROMs over clones (requires parent-clone DAT files)',
        type: 'boolean',
        implies: ['dat', 'single'],
      })

      .option('language-filter', {
        group: groupFiltering,
        alias: 'L',
        description: `List of comma-separated languages to limit to (supported: ${ReleaseCandidate.getLanguages().join(', ')})`,
        type: 'string',
        coerce: (val: string) => val.split(','),
        requiresArg: true,
      })
      .option('region-filter', {
        group: groupFiltering,
        alias: 'R',
        description: `List of comma-separated regions to limit to (supported: ${ReleaseCandidate.getRegions().join(', ')})`,
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
        description: 'Filter to only retail releases, enabling all the following flags',
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
      .option('no-bad', {
        group: groupFiltering,
        description: 'Filter out bad ROM dumps',
        type: 'boolean',
      })

      .option('verbose', {
        group: groupHelp,
        alias: 'v',
        description: 'Enable verbose logging, can specify twice (-vv)',
        type: 'count',
      })

      .wrap(ArgumentsParser.getHelpWidth(argv))
      .version(false)
      .example([
        ['$0 copy -i **/*.zip -o 1G1R/ -D -s -l EN -r USA,EUR,JPN', 'Produce a 1G1R set per console, preferring English from USA>EUR>JPN'],
        [''], // https://github.com/yargs/yargs/issues/1640
        ['$0 copy report -i **/*.zip -i ROMs/ -o ROMs/', 'Merge new ROMs into an existing ROM collection and generate a report'],
        [''], // https://github.com/yargs/yargs/issues/1640
        ['$0 move zip -i ROMs/ -o ROMs/', 'Organize and zip an existing ROM collection'],
        [''], // https://github.com/yargs/yargs/issues/1640
        ['$0 copy -i **/*.zip -o BIOS/ --only-bios', 'Collate all BIOS files'],
        [''], // https://github.com/yargs/yargs/issues/1640
        ['$0 copy -i ROMs/ -o /media/SDCard/ROMs/ -D --dir-letter -t', 'Copy ROMs to a flash cart and test them'],
      ])

      // Colorize help output
      .option('help', {
        group: groupHelp,
        alias: 'h',
        description: 'Show help',
        type: 'boolean',
      })
      .fail((msg, err, _yargs) => {
        if (err) {
          throw err;
        }
        this.logger.colorizeYargs(`${_yargs.help()}\n`);
        throw new Error(msg);
      });

    const yargsArgv = yargsParser
      .strictOptions(true)
      .parse(argv, {}, (err, parsedArgv, output) => {
        if (output) {
          this.logger.colorizeYargs(output);
        }
      });

    const options = Options.fromObject(yargsArgv);
    this.logger.info(`Parsed options: ${options.toString()}`);

    return options;
  }
}
