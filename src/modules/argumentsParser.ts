import fs from 'node:fs';

import yargs, { Argv } from 'yargs';

import Logger from '../console/logger.js';
import Constants from '../constants.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import ConsolePoly from '../polyfill/consolePoly.js';
import ROMHeader from '../types/files/romHeader.js';
import Internationalization from '../types/internationalization.js';
import Options, { GameSubdirMode, MergeMode } from '../types/options.js';
import PatchFactory from '../types/patches/patchFactory.js';

/**
 * Parse a {@link process.argv} (without its first two arguments, the Node.js executable and the
 * script name) and return a validated {@link Options} object.
 *
 * This class will not be run concurrently with any other class.
 */
export default class ArgumentsParser {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  private static getLastValue<T>(arr: T | T[]): T {
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.at(-1) as T;
    }
    return arr as T;
  }

  private static readRegexFile(value: string | string[]): string {
    const lastValue = ArgumentsParser.getLastValue(value);
    if (fs.existsSync(lastValue)) {
      return fs.readFileSync(lastValue).toString();
    }
    return lastValue;
  }

  private static getHelpWidth(argv: string[]): number {
    // Look for --help/-h with a numerical value
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i].toLowerCase() === '--help' || argv[i].toLowerCase() === '-h') {
        const helpFlagVal = Number.parseInt(argv[i + 1], 10);
        if (!Number.isNaN(helpFlagVal)) {
          return Number.parseInt(argv[i + 1], 10);
        }
      }
    }

    return Math.min(
      // Use the terminal width if it has one
      ConsolePoly.consoleWidth(),
      // Sane maximum
      110,
    );
  }

  /**
   * Parse the arguments.
   */
  parse(argv: string[]): Options {
    this.logger.trace(`Parsing CLI arguments: ${argv}`);

    const groupInput = 'Input options (supports globbing):';
    const groupDatInput = 'DAT input options:';
    const groupRomOutput = 'ROM output options (processed in order):';
    const groupRomZip = 'ROM zip command options:';
    const groupRomLink = 'ROM link command options:';
    const groupRomHeader = 'ROM header options:';
    const groupRomSet = 'ROM set options:';
    const groupRomFiltering = 'ROM filtering options:';
    const groupRomPriority = 'One game, one ROM (1G1R) options:';
    const groupReport = 'Report options:';
    const groupHelpDebug = 'Help & debug options:';

    // Add every command to a yargs object, recursively, resulting in the ability to specify
    // multiple commands
    const commands: [string, string | boolean][] = [
      ['copy', 'Copy ROM files from the input to output directory'],
      ['move', 'Move ROM files from the input to output directory'],
      ['link', 'Create links in the output directory to ROM files in the input directory'],
      ['symlink', false],
      ['extract', 'Extract ROM files in archives when copying or moving'],
      ['zip', 'Create zip archives of ROMs when copying or moving'],
      ['test', 'Test ROMs for accuracy after writing them to the output directory'],
      ['dir2dat', 'Generate a DAT from all input files'],
      ['fixdat', 'Generate a fixdat of any missing games for every DAT processed (requires --dat)'],
      ['clean', 'Recycle unknown files in the output directory'],
      ['report', 'Generate a CSV report on the known & unknown ROM files found in the input directories (requires --dat)'],
    ];
    const addCommands = (
      yargsObj: Argv,
      commandsToAdd = commands.map((command) => command[0]),
    ): Argv => {
      commands
        // Don't show duplicate commands, i.e. don't give `igir copy copy` as an option when
        // specifying `igir copy --help`.
        .filter(([command]) => commandsToAdd.includes(command))
        .forEach(([command, description]) => {
          if (typeof description === 'string') {
            yargsObj.command(command, description, (yargsSubObj) => addCommands(
              yargsSubObj,
              commandsToAdd.filter((c) => c !== command),
            ));
          } else {
            // A deprecation message should be printed elsewhere
            yargsObj.command(command, false, (yargsSubObj) => addCommands(
              yargsSubObj,
              commandsToAdd.filter((c) => c !== command),
            ));
          }
        });

      if (commandsToAdd.length === 0) {
        // Only register the check function once
        return yargsObj;
      }
      return yargsObj
        .middleware((middlewareArgv) => {
          // Ignore duplicate commands
          // eslint-disable-next-line no-param-reassign
          middlewareArgv._ = middlewareArgv._.reduce(ArrayPoly.reduceUnique(), []);
        }, true)
        .check((checkArgv) => {
          if (checkArgv.help) {
            return true;
          }

          const writeCommands = ['copy', 'move', 'link', 'symlink'].filter((command) => checkArgv._.includes(command));
          if (writeCommands.length > 1) {
            throw new Error(`Incompatible commands: ${writeCommands.join(', ')}`);
          }

          const archiveCommands = ['link', 'symlink', 'extract', 'zip'].filter((command) => checkArgv._.includes(command));
          if (archiveCommands.length > 1) {
            throw new Error(`Incompatible commands: ${archiveCommands.join(', ')}`);
          }

          const datWritingCommands = ['dir2dat', 'fixdat'].filter((command) => checkArgv._.includes(command));
          if (datWritingCommands.length > 1) {
            throw new Error(`Incompatible commands: ${datWritingCommands.join(', ')}`);
          }

          ['extract', 'zip'].forEach((command) => {
            if (checkArgv._.includes(command) && ['copy', 'move'].every((write) => !checkArgv._.includes(write))) {
              throw new Error(`Command "${command}" also requires the commands copy or move`);
            }
          });

          ['test', 'clean'].forEach((command) => {
            if (checkArgv._.includes(command) && ['copy', 'move', 'link', 'symlink'].every((write) => !checkArgv._.includes(write))) {
              throw new Error(`Command "${command}" requires one of the commands: copy, move, or link`);
            }
          });

          return true;
        });
    };

    const yargsParser = yargs([])
      .parserConfiguration({
        'boolean-negation': false,
      })
      .locale('en')
      .scriptName(Constants.COMMAND_NAME)
      .usage('Usage: $0 [commands..] [options]')
      .updateStrings({
        'Commands:': 'Commands (can specify multiple):',
      });
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
      .option('patch-exclude', {
        group: groupInput,
        alias: 'P',
        description: 'Path(s) to ROM patch files or archives to exclude from processing',
        type: 'array',
        requiresArg: true,
      })

      .option('dat', {
        group: groupDatInput,
        alias: 'd',
        description: 'Path(s) to DAT files or archives (supports globbing)',
        type: 'array',
        requiresArg: true,
      })
      .option('dat-exclude', {
        group: groupDatInput,
        description: 'Path(s) to DAT files or archives to exclude from processing (supports globbing)',
        type: 'array',
        requiresArg: true,
      })
      .option('dat-name-regex', {
        group: groupDatInput,
        description: 'Regular expression of DAT names to process',
        type: 'string',
        coerce: ArgumentsParser.readRegexFile,
        requiresArg: true,
      })
      .option('dat-regex', {
        type: 'string',
        coerce: (val) => {
          this.logger.warn('the \'--dat-regex\' option is deprecated, use \'--dat-name-regex\' instead');
          return ArgumentsParser.readRegexFile(val);
        },
        requiresArg: true,
        hidden: true,
      })
      .option('dat-name-regex-exclude', {
        group: groupDatInput,
        description: 'Regular expression of DAT names to exclude from processing',
        type: 'string',
        coerce: ArgumentsParser.readRegexFile,
        requiresArg: true,
      })
      .option('dat-regex-exclude', {
        type: 'string',
        coerce: (val) => {
          this.logger.warn('the \'--dat-regex-exclude\' option is deprecated, use \'--dat-name-regex-exclude\' instead');
          return ArgumentsParser.readRegexFile(val);
        },
        requiresArg: true,
        hidden: true,
      })
      .option('dat-description-regex', {
        group: groupDatInput,
        description: 'Regular expression of DAT descriptions to process',
        type: 'string',
        coerce: ArgumentsParser.readRegexFile,
        requiresArg: true,
      })
      .option('dat-description-regex-exclude', {
        group: groupDatInput,
        description: 'Regular expression of DAT descriptions to exclude from processing',
        type: 'string',
        coerce: ArgumentsParser.readRegexFile,
        requiresArg: true,
      })
      .option('dat-combine', {
        group: groupDatInput,
        description: 'Combine every game from every found & filtered DAT into one DAT',
        type: 'boolean',
      })
      .option('dat-ignore-parent-clone', {
        group: groupDatInput,
        description: 'Ignore any parent/clone information found in DATs',
        type: 'boolean',
        implies: 'dat',
      })
      .check((checkArgv) => {
        if (checkArgv.help) {
          return true;
        }
        const needDat = ['report'].filter((command) => checkArgv._.includes(command));
        if ((!checkArgv.dat || checkArgv.dat.length === 0) && needDat.length > 0) {
          throw new Error(`Missing required option for commands ${needDat.join(', ')}: --dat`);
        }
        return true;
      })

      .option('fixdat', {
        type: 'boolean',
        coerce: (val: boolean) => {
          this.logger.warn('the \'--fixdat\' option is deprecated, use the \'fixdat\' command instead');
          return val;
        },
        implies: 'dat',
        deprecated: true,
        hidden: true,
      })

      .option('output', {
        group: groupRomOutput,
        alias: 'o',
        description: 'Path to the ROM output directory (supports replaceable symbols, see below)',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('dir-mirror', {
        group: groupRomOutput,
        description: 'Use the input subdirectory structure for the output directory',
        type: 'boolean',
      })
      .option('dir-dat-name', {
        group: groupRomOutput,
        alias: 'D',
        description: 'Use the DAT name as the output subdirectory',
        type: 'boolean',
        implies: 'dat',
      })
      .option('dir-dat-description', {
        group: groupRomOutput,
        description: 'Use the DAT description as the output subdirectory',
        type: 'boolean',
        implies: 'dat',
      })
      .option('dir-letter', {
        group: groupRomOutput,
        description: 'Group games in an output subdirectory by the first --dir-letter-count letters in their name',
        type: 'boolean',
      })
      .option('dir-letter-count', {
        group: groupRomOutput,
        description: 'How many game name letters to use for the subdirectory name',
        type: 'number',
        coerce: (val: number) => Math.max(ArgumentsParser.getLastValue(val), 1),
        requiresArg: true,
        default: 1,
      })
      .check((checkArgv) => {
        // Re-implement `implies: 'dir-letter'`, which isn't possible with a default value
        if (checkArgv['dir-letter-count'] > 1 && !checkArgv['dir-letter']) {
          throw new Error('Missing dependent arguments:\n dir-letter-count -> dir-letter');
        }
        return true;
      })
      .option('dir-letter-limit', {
        group: groupRomOutput,
        description: 'Limit the number of games in letter subdirectories, splitting into multiple subdirectories if necessary',
        type: 'number',
        coerce: (val: number) => Math.max(ArgumentsParser.getLastValue(val), 1),
        requiresArg: true,
        implies: 'dir-letter',
      })
      .option('dir-letter-group', {
        group: groupRomOutput,
        description: 'Group letter subdirectories into ranges, combining multiple letters together (requires --dir-letter-limit)',
        type: 'boolean',
        implies: 'dir-letter-limit',
      })
      .option('dir-game-subdir', {
        group: groupRomOutput,
        description: 'Append the name of the game as an output subdirectory depending on its ROMs',
        choices: Object.keys(GameSubdirMode)
          .filter((mode) => Number.isNaN(Number(mode)))
          .map((mode) => mode.toLowerCase()),
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        default: GameSubdirMode[GameSubdirMode.MULTIPLE].toLowerCase(),
      })
      .option('overwrite', {
        group: groupRomOutput,
        alias: 'O',
        description: 'Overwrite any files in the output directory',
        type: 'boolean',
      })
      .option('overwrite-invalid', {
        group: groupRomOutput,
        description: 'Overwrite files in the output directory that are the wrong filesize, checksum, or zip contents',
        type: 'boolean',
      })
      .option('clean-exclude', {
        group: groupRomOutput,
        alias: 'C',
        description: 'Path(s) to files to exclude from cleaning (supports globbing)',
        type: 'array',
        requiresArg: true,
      })
      .option('clean-dry-run', {
        group: groupRomOutput,
        description: 'Don\'t clean any files and instead only print what files would be cleaned',
        type: 'boolean',
      })
      .check((checkArgv) => {
        if (checkArgv.help) {
          return true;
        }
        const needOutput = ['copy', 'move', 'extract', 'zip', 'clean'].filter((command) => checkArgv._.includes(command));
        if (!checkArgv.output && needOutput.length > 0) {
          throw new Error(`Missing required option for command${needOutput.length !== 1 ? 's' : ''} ${needOutput.join(', ')}: --output`);
        }
        const needClean = ['clean-exclude', 'clean-dry-run'].filter((option) => checkArgv[option]);
        if (!checkArgv._.includes('clean') && needClean.length > 0) {
          throw new Error(`Missing required command for option${needClean.length !== 1 ? 's' : ''} ${needClean.join(', ')}: clean`);
        }
        return true;
      })

      .option('zip-exclude', {
        group: groupRomZip,
        alias: 'Z',
        description: 'Glob pattern of files to exclude from zipping',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('zip-dat-name', {
        group: groupRomZip,
        description: 'Group all ROMs from the same DAT into the same zip archive, if not excluded from zipping (enforces --dat-threads 1)',
        type: 'boolean',
      })
      .check((checkArgv) => {
        if (checkArgv.help) {
          return true;
        }
        const needZip = ['zip-exclude', 'zip-dat-name'].filter((option) => checkArgv[option]);
        if (!checkArgv._.includes('zip') && needZip.length > 0) {
          throw new Error(`Missing required command for option${needZip.length !== 1 ? 's' : ''} ${needZip.join(', ')}: zip`);
        }
        return true;
      })

      .option('symlink', {
        group: groupRomLink,
        description: 'Creates symbolic links instead of hard links',
        type: 'boolean',
      })
      .middleware((middlewareArgv) => {
        if (middlewareArgv._.includes('symlink')) {
          this.logger.warn('the \'symlink\' command is deprecated, use \'link --symlink\' instead');
          if (middlewareArgv.symlink === undefined) {
            // eslint-disable-next-line no-param-reassign
            middlewareArgv.symlink = true;
          }
        }
      }, true)
      .option('symlink-relative', {
        group: groupRomLink,
        description: 'Create symlinks as relative to the target path, as opposed to absolute',
        type: 'boolean',
        implies: 'symlink',
      })
      .check((checkArgv) => {
        if (checkArgv.help) {
          return true;
        }
        const needLinkCommand = ['symlink'].filter((option) => checkArgv[option]);
        if (!checkArgv._.includes('link') && !checkArgv._.includes('symlink') && needLinkCommand.length > 0) {
          throw new Error(`Missing required command for option${needLinkCommand.length !== 1 ? 's' : ''} ${needLinkCommand.join(', ')}: link`);
        }
        return true;
      })

      .option('header', {
        group: groupRomHeader,
        description: 'Glob pattern of files to force header processing for',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('remove-headers', {
        group: groupRomHeader,
        alias: 'H',
        description: `Remove known headers from ROMs, optionally limited to a list of comma-separated file extensions (supported: ${ROMHeader.getSupportedExtensions().join(', ')})`,
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

      .option('merge-roms', {
        group: groupRomSet,
        description: 'ROM merge/split mode (requires DATs with parent/clone information)',
        choices: Object.keys(MergeMode)
          .filter((mode) => Number.isNaN(Number(mode)))
          .map((mode) => mode.toLowerCase()),
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        default: MergeMode[MergeMode.FULLNONMERGED].toLowerCase(),
      })
      .option('allow-incomplete-sets', {
        group: groupRomSet,
        description: 'Allow writing games that don\'t have all of their ROMs',
        type: 'boolean',
      })

      .option('filter-regex', {
        group: groupRomFiltering,
        alias: 'x',
        description: 'Regular expression of game names to filter to',
        type: 'string',
        coerce: ArgumentsParser.readRegexFile,
        requiresArg: true,
      })
      .option('filter-regex-exclude', {
        group: groupRomFiltering,
        alias: 'X',
        description: 'Regular expression of game names to exclude',
        type: 'string',
        coerce: ArgumentsParser.readRegexFile,
        requiresArg: true,
      })
      .option('filter-language', {
        group: groupRomFiltering,
        alias: 'L',
        description: `List of comma-separated languages to filter to (supported: ${Internationalization.LANGUAGES.join(', ')})`,
        type: 'string',
        coerce: (val: string) => val.split(','),
        requiresArg: true,
      })
      .option('language-filter', {
        type: 'string',
        coerce: (val: string) => {
          this.logger.warn('the \'--language-filter\' option is deprecated, use \'--filter-language\' instead');
          return val.split(',');
        },
        requiresArg: true,
        deprecated: true,
        hidden: true,
      })
      .option('filter-region', {
        group: groupRomFiltering,
        alias: 'R',
        description: `List of comma-separated regions to filter to (supported: ${Internationalization.REGION_CODES.join(', ')})`,
        type: 'string',
        coerce: (val: string) => val.split(','),
        requiresArg: true,
      })
      .option('region-filter', {
        type: 'string',
        coerce: (val: string) => {
          this.logger.warn('the \'--region-filter\' option is deprecated, use \'--filter-region\' instead');
          return val.split(',');
        },
        requiresArg: true,
        deprecated: true,
        hidden: true,
      });
    [
      ['bios', 'BIOS files'],
      ['device', 'MAME devies'],
      ['unlicensed', 'unlicensed ROMs'],
    ].forEach(([key, description]) => {
      yargsParser
        .option(`no-${key}`, {
          group: groupRomFiltering,
          description: `Filter out ${description}, opposite of --only-${key}`,
          type: 'boolean',
          conflicts: [`only-${key}`],
        })
        .option(`only-${key}`, {
          type: 'boolean',
          conflicts: [`no-${key}`],
          hidden: true,
        });
    });
    yargsParser
      .option('only-retail', {
        group: groupRomFiltering,
        description: 'Filter to only retail releases, enabling all the following "no" options',
        type: 'boolean',
      });
    ([
      ['debug', 'debug ROMs', false],
      ['demo', 'demo ROMs', false],
      ['beta', 'beta ROMs', false],
      ['sample', 'sample ROMs', false],
      ['prototype', 'prototype ROMs', false],
      ['test-roms', 'test ROMs', true],
      ['program', 'program application ROMs', false],
      ['aftermarket', 'aftermarket ROMs', false],
      ['homebrew', 'homebrew ROMs', false],
      ['unverified', 'unverified ROMs', false],
      ['bad', 'bad ROM dumps', false],
    ] satisfies [string, string, boolean][]).forEach(([key, description, hidden]) => {
      yargsParser
        .option(`no-${key}`, {
          group: groupRomFiltering,
          description: `Filter out ${description}, opposite of --only-${key}`,
          type: 'boolean',
          conflicts: [`only-${key}`],
          hidden,
        })
        .option(`only-${key}`, {
          type: 'boolean',
          conflicts: [`no-${key}`],
          hidden: true,
        });
    });
    yargsParser.middleware((middlewareArgv) => {
      if (middlewareArgv['no-test-roms'] === true) {
        this.logger.warn('the \'--no-test-roms\' option is deprecated, use \'--no-program\' instead');
        if (middlewareArgv.noProgram === undefined) {
          // eslint-disable-next-line no-param-reassign
          middlewareArgv.noProgram = true;
        }
      }
      if (middlewareArgv['only-test-roms'] === true) {
        this.logger.warn('the \'--only-test-roms\' option is deprecated, use \'--only-program\' instead');
        if (middlewareArgv.onlyProgram === undefined) {
          // eslint-disable-next-line no-param-reassign
          middlewareArgv.onlyProgram = true;
        }
      }
    }, true);

    yargsParser
      .option('single', {
        group: groupRomPriority,
        alias: 's',
        description: 'Output only a single game per parent (1G1R) (required for all options below, requires DATs with parent/clone information)',
        type: 'boolean',
      })
      .option('prefer-game-regex', {
        group: groupRomPriority,
        description: 'Regular expression of game names to prefer',
        type: 'string',
        coerce: ArgumentsParser.readRegexFile,
        requiresArg: true,
        implies: 'single',
      })
      .option('prefer-rom-regex', {
        group: groupRomPriority,
        description: 'Regular expression of ROM filenames to prefer',
        type: 'string',
        coerce: ArgumentsParser.readRegexFile,
        requiresArg: true,
        implies: 'single',
      })
      .option('prefer-verified', {
        group: groupRomPriority,
        description: 'Prefer verified ROM dumps over unverified',
        type: 'boolean',
        implies: 'single',
      })
      .option('prefer-good', {
        group: groupRomPriority,
        description: 'Prefer good ROM dumps over bad',
        type: 'boolean',
        implies: 'single',
      })
      .option('prefer-language', {
        group: groupRomPriority,
        alias: 'l',
        description: `List of comma-separated languages in priority order (supported: ${Internationalization.LANGUAGES.join(', ')})`,
        type: 'string',
        coerce: (val: string) => val.split(','),
        requiresArg: true,
        implies: 'single',
      })
      .option('prefer-region', {
        group: groupRomPriority,
        alias: 'r',
        description: `List of comma-separated regions in priority order (supported: ${Internationalization.REGION_CODES.join(', ')})`,
        type: 'string',
        coerce: (val: string) => val.split(','),
        requiresArg: true,
        implies: 'single',
      })
      .option('prefer-revision-newer', {
        group: groupRomPriority,
        description: 'Prefer newer ROM revisions over older',
        type: 'boolean',
        conflicts: ['prefer-revision-older'],
        implies: 'single',
      })
      .option('prefer-revision-older', {
        group: groupRomPriority,
        description: 'Prefer older ROM revisions over newer',
        type: 'boolean',
        conflicts: ['prefer-revision-newer'],
        implies: 'single',
      })
      .option('prefer-retail', {
        group: groupRomPriority,
        description: 'Prefer retail releases (see --only-retail)',
        type: 'boolean',
        implies: 'single',
      })
      .option('prefer-ntsc', {
        group: groupRomPriority,
        description: 'Prefer NTSC ROMs over others',
        type: 'boolean',
        conflicts: 'prefer-pal',
        implies: 'single',
      })
      .option('prefer-pal', {
        group: groupRomPriority,
        description: 'Prefer PAL ROMs over others',
        type: 'boolean',
        conflicts: 'prefer-ntsc',
        implies: 'single',
      })
      .option('prefer-parent', {
        group: groupRomPriority,
        description: 'Prefer parent ROMs over clones',
        type: 'boolean',
        implies: 'single',
      })

      .option('report-output', {
        group: groupReport,
        description: 'Report output location (formatted with moment.js)',
        type: 'string',
        requiresArg: true,
        default: `./${Constants.COMMAND_NAME}_%YYYY-%MM-%DDT%HH:%mm:%ss.csv`,
      })

      .option('dat-threads', {
        group: groupHelpDebug,
        description: 'Number of DATs to process in parallel',
        type: 'number',
        coerce: (val: number) => Math.max(val, 1),
        requiresArg: true,
        default: Constants.DAT_DEFAULT_THREADS,
      })
      .option('reader-threads', {
        group: groupHelpDebug,
        description: 'Maximum number of ROMs to read in parallel per disk',
        type: 'number',
        coerce: (val: number) => Math.max(val, 1),
        requiresArg: true,
        default: Constants.FILE_READER_DEFAULT_THREADS,
      })
      .option('writer-threads', {
        group: groupHelpDebug,
        description: 'Maximum number of ROMs to write in parallel',
        type: 'number',
        coerce: (val: number) => Math.max(val, 1),
        requiresArg: true,
        default: Constants.ROM_WRITER_DEFAULT_THREADS,
      })
      .middleware((middlewareArgv) => {
        if (middlewareArgv.zipDatName) {
          // eslint-disable-next-line no-param-reassign
          middlewareArgv.datThreads = 1;
        }
      }, true)
      .option('verbose', {
        group: groupHelpDebug,
        alias: 'v',
        description: 'Enable verbose logging, can specify up to three times (-vvv)',
        type: 'count',
      })

      .check((checkArgv) => {
        if (checkArgv.mergeRoms !== MergeMode[MergeMode.FULLNONMERGED].toLowerCase() && (
          checkArgv.dirMirror
          || checkArgv.dirLetter
        )) {
          this.logger.warn(`at least one --dir-* option was provided, be careful about how you organize non-'${MergeMode[MergeMode.FULLNONMERGED].toLowerCase()}' ROM sets into different subdirectories`);
        }

        if (checkArgv.mergeRoms !== MergeMode[MergeMode.FULLNONMERGED].toLowerCase() && (
          checkArgv.noBios
          || checkArgv.noDevice
        )) {
          this.logger.warn(`--no-bios and --no-device may leave non-'${MergeMode[MergeMode.FULLNONMERGED].toLowerCase()}' ROM sets in an unplayable state`);
        }

        if ((checkArgv.single && !checkArgv.preferParent)
          && checkArgv.mergeRoms === MergeMode[MergeMode.SPLIT].toLowerCase()
        ) {
          this.logger.warn(`--single may leave '${MergeMode[MergeMode.SPLIT].toLowerCase()}' ROM sets in an unplayable state`);
        }

        return true;
      })

      .wrap(ArgumentsParser.getHelpWidth(argv))
      .version(false)

      // NOTE(cemmer): the .epilogue() renders after .example() but I want them switched
      .epilogue(`${'-'.repeat(ArgumentsParser.getHelpWidth(argv))}

Advanced usage:

  Tokens that are replaced when generating the output (--output) path of a ROM:
    {datName}         The name of the DAT that contains the ROM (e.g. "Nintendo - Game Boy")
    {datDescription}  The description of the DAT that contains the ROM
    {gameRegion}      The region of the ROM release (e.g. "USA"), each ROM can have multiple
    {gameLanguage}    The language of the ROM release (e.g. "En"), each ROM can have multiple
    {gameType}        The type of the game (e.g. "Retail", "Demo", "Prototype")

    {inputDirname}    The input file's dirname
    {outputBasename}  Equivalent to "{outputName}.{outputExt}"
    {outputName}      The output file's filename without extension
    {outputExt}       The output file's extension

    {adam}      The ROM's emulator-specific /ROMS/* directory for the 'Adam' image (e.g. "GB")
    {batocera}  The ROM's emulator-specific /roms/* directory for Batocera (e.g. "gb")
    {es}        The ROM's emulator-specific /roms/* directory for the 'EmulationStation' image (e.g. "gb")
    {funkeyos}  The ROM's emulator-specific /* directory for FunKey OS (e.g. "Game Boy")
    {jelos}     The ROM's emulator-specific /roms/* directory for JELOS (e.g. "gb")
    {minui}     The ROM's emulator-specific /Roms/* directory for MinUI (e.g. "Game Boy (GB)")
    {mister}    The ROM's core-specific /games/* directory for the MiSTer FPGA (e.g. "Gameboy")
    {miyoocfw}  The ROM's emulator-specific /roms/* directory for MiyooCFW (e.g. "GB")
    {onion}     The ROM's emulator-specific /Roms/* directory for OnionOS/GarlicOS (e.g. "GB")
    {pocket}    The ROM's core-specific /Assets/* directory for the Analogue Pocket (e.g. "gb")
    {retrodeck} The ROM's emulator-specific /roms/* directory for the 'RetroDECK' image (e.g. "gb")
    {twmenu}    The ROM's emulator-specific /roms/* directory for TWiLightMenu++ on the DSi/3DS (e.g. "gb")

Example use cases:

  Merge new ROMs into an existing ROM collection and delete any unrecognized files:
    $0 copy clean --dat "*.dat" --input New-ROMs/ --input ROMs/ --output ROMs/

  Organize and zip an existing ROM collection:
    $0 move zip --dat "*.dat" --input ROMs/ --output ROMs/

  Generate a report on an existing ROM collection, without copying or moving ROMs (read only):
    $0 report --dat "*.dat" --input ROMs/

  Produce a 1G1R set per console, preferring English ROMs from USA>WORLD>EUR>JPN:
    $0 copy --dat "*.dat" --input "**/*.zip" --output 1G1R/ --dir-dat-name --single --prefer-language EN --prefer-region USA,WORLD,EUR,JPN

  Copy all Mario, Metroid, and Zelda games to one directory:
    $0 copy --input ROMs/ --output Nintendo/ --filter-regex "/(Mario|Metroid|Zelda)/i"

  Copy all BIOS files into one directory, extracting if necessary:
    $0 copy extract --dat "*.dat" --input "**/*.zip" --output BIOS/ --only-bios

  Create patched copies of ROMs in an existing collection, not overwriting existing files:
    $0 copy extract --input ROMs/ --patch Patches/ --output ROMs/

  Re-build a MAME ROM set for a specific version of MAME:
    $0 copy zip --dat "MAME 0.258.dat" --input MAME/ --output MAME-0.258/ --merge-roms split

  Copy ROMs to an Analogue Pocket and test they were written correctly:
    $0 copy extract test --dat "*.dat" --input ROMs/ --output /Assets/{pocket}/common/ --dir-letter`)

      // Colorize help output
      .option('help', {
        group: groupHelpDebug,
        alias: 'h',
        description: 'Show help',
        type: 'boolean',
      })
      .fail((msg, err, _yargs) => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
    this.logger.trace(`Parsed options: ${options.toString()}`);

    return options;
  }
}
