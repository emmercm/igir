import fs from 'node:fs';

import type { Argv } from 'yargs';
import yargs from 'yargs';

import type Logger from '../console/logger.js';
import Defaults from '../globals/defaults.js';
import Package from '../globals/package.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import ConsolePoly from '../polyfill/consolePoly.js';
import IgirException from '../types/exceptions/igirException.js';
import { ChecksumBitmask, ChecksumBitmaskInverted } from '../types/files/fileChecksums.js';
import ROMHeader from '../types/files/romHeader.js';
import Internationalization from '../types/internationalization.js';
import Options, {
  FixExtension,
  FixExtensionInverted,
  GameSubdirMode,
  GameSubdirModeInverted,
  InputChecksumArchivesMode,
  InputChecksumArchivesModeInverted,
  LinkMode,
  LinkModeInverted,
  MergeMode,
  MergeModeInverted,
  MoveDeleteDirs,
  MoveDeleteDirsInverted,
  PreferRevision,
  TrimScanFiles,
  TrimScanFilesInverted,
  ZipFormat,
  ZipFormatInverted,
} from '../types/options.js';
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
    const groupRomInput = 'ROM input options:';
    const groupDatInput = 'DAT input options:';
    const groupPatchInput = 'Patch input options:';
    const groupRomOutputPath = 'ROM output path options (processed in order):';
    const groupRomOutput = 'ROM writing options:';
    const groupRomMove = 'move command options:';
    const groupRomClean = 'clean command options:';
    const groupRomZip = 'zip command options:';
    const groupRomLink = 'link command options:';
    const groupRomHeader = 'ROM header options:';
    const groupRomTrimmed = 'Trimmed ROM options:';
    const groupRomSet = 'ROM set options (requires DATs):';
    const groupRomFiltering = 'ROM filtering options:';
    const groupRomPriority = 'One game, one ROM (1G1R) options:';
    const groupPlaylist = 'playlist command options:';
    const groupDir2Dat = 'dir2dat command options:';
    const groupFixdat = 'fixdat command options:';
    const groupReport = 'report command options:';
    const groupHelpDebug = 'Help & debug options:';

    // Add every command to a yargs object, recursively, resulting in the ability to specify
    // multiple commands
    const commands = [
      ['copy', 'Copy ROM files from the input to output directory'],
      ['move', 'Move ROM files from the input to output directory'],
      ['link', 'Create links in the output directory to ROM files in the input directory'],
      ['extract', 'Extract ROM files in archives when copying or moving'],
      ['zip', 'Create zip archives of ROMs when copying or moving'],
      ['playlist', 'Create playlist files for multi-disc games'],
      ['test', 'Test ROMs for accuracy after writing them to the output directory'],
      ['dir2dat', 'Generate a DAT from all input files'],
      ['fixdat', 'Generate a fixdat of any missing games for every DAT processed (requires --dat)'],
      ['clean', 'Recycle unknown files in the output directory'],
      [
        'report',
        'Generate a CSV report on the known & unknown ROM files found in the input directories (requires --dat)',
      ],
    ];
    const mutuallyExclusiveCommands = [
      // Write commands
      ['copy', 'move', 'link'],
      // Archive manipulation commands
      ['link', 'extract', 'zip'],
      // DAT writing commands
      ['dir2dat', 'fixdat'],
    ];
    const addCommands = (yargsObj: Argv, previousCommands: string[] = []): Argv => {
      commands
        .filter(([command]) => {
          // Don't allow/show duplicate commands, i.e. don't give `igir copy copy` as an option
          if (previousCommands.includes(command)) {
            return false;
          }
          // Don't allow/show conflicting commands, i.e. don't give `igir copy move` as an option
          const incompatibleCommands = previousCommands.flatMap((previousCommand) =>
            mutuallyExclusiveCommands
              .filter((mutuallyExclusive) => mutuallyExclusive.includes(previousCommand))
              .flat(),
          );
          return !incompatibleCommands.includes(command);
        })
        .forEach(([command, description]) => {
          yargsObj.command(command, description, (yargsSubObj) =>
            addCommands(yargsSubObj, [...previousCommands, command]),
          );
        });

      if (previousCommands.length === 0) {
        // Only register the check function once
        return yargsObj;
      }
      return yargsObj
        .middleware((middlewareArgv) => {
          // Ignore duplicate commands
          middlewareArgv._ = middlewareArgv._.reduce(ArrayPoly.reduceUnique(), []);
        }, true)
        .check((checkArgv) => {
          ['extract', 'zip'].forEach((command) => {
            if (
              checkArgv._.includes(command) &&
              ['copy', 'move'].every((write) => !checkArgv._.includes(write))
            ) {
              throw new IgirException(
                `Command "${command}" also requires the commands copy or move`,
              );
            }
          });

          ['clean'].forEach((command) => {
            if (
              checkArgv._.includes(command) &&
              ['copy', 'move', 'link'].every((write) => !checkArgv._.includes(write))
            ) {
              throw new IgirException(
                `Command "${command}" requires one of the commands: copy, move, or link`,
              );
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
      .scriptName(Package.NAME)
      .usage('Usage: $0 [commands..] [options]')
      .updateStrings({
        'Commands:': 'Commands (can specify multiple):',
      });
    addCommands(yargsParser)
      .demandCommand(1, 'You must specify at least one command')
      .strictCommands(true);

    yargsParser
      .option('input', {
        group: groupRomInput,
        alias: 'i',
        description: 'Path(s) to ROM files or archives (supports globbing)',
        type: 'array',
        requiresArg: true,
      })
      .check((checkArgv) => {
        const needInput = ['copy', 'move', 'link', 'extract', 'zip', 'test', 'dir2dat'].filter(
          (command) => checkArgv._.includes(command),
        );
        if (!checkArgv.input && needInput.length > 0) {
          // TODO(cememr): print help message
          throw new IgirException(
            `Missing required argument for command${needInput.length === 1 ? '' : 's'} ${needInput.join(', ')}: --input <path>`,
          );
        }
        return true;
      })
      .option('input-exclude', {
        group: groupRomInput,
        alias: 'I',
        description:
          'Path(s) to ROM files or archives to exclude from processing (supports globbing)',
        type: 'array',
        requiresArg: true,
        implies: 'input',
      })
      .option('input-checksum-quick', {
        group: groupRomInput,
        description: "Only read checksums from archive headers, don't decompress to calculate",
        type: 'boolean',
      })
      .check((checkArgv) => {
        // Re-implement `conflicts: 'input-checksum-min'`, which isn't possible with a default value
        if (
          checkArgv['input-checksum-quick'] &&
          checkArgv['input-checksum-min'] !==
            ChecksumBitmaskInverted[ChecksumBitmask.CRC32].toUpperCase()
        ) {
          throw new IgirException(
            'Arguments input-checksum-quick and input-checksum-min are mutually exclusive',
          );
        }
        if (checkArgv['input-checksum-quick'] && checkArgv['input-checksum-max']) {
          throw new IgirException(
            'Arguments input-checksum-quick and input-checksum-max are mutually exclusive',
          );
        }
        return true;
      })
      .option('input-checksum-min', {
        group: groupRomInput,
        description: 'The minimum checksum level to calculate and use for matching',
        choices: Object.values(ChecksumBitmask)
          .filter((bitmask) => bitmask !== ChecksumBitmask.NONE)
          .map((bitmask) => ChecksumBitmaskInverted[bitmask].toUpperCase()),
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        default: ChecksumBitmaskInverted[ChecksumBitmask.CRC32].toUpperCase(),
      })
      .option('input-checksum-max', {
        group: groupRomInput,
        description: 'The maximum checksum level to calculate and use for matching',
        choices: Object.values(ChecksumBitmask)
          .filter((bitmask) => bitmask !== ChecksumBitmask.NONE)
          .map((bitmask) => ChecksumBitmaskInverted[bitmask].toUpperCase()),
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .check((checkArgv) => {
        const options = Options.fromObject(checkArgv);
        const inputChecksumMin = options.getInputChecksumMin();
        const inputChecksumMax = options.getInputChecksumMax();
        if (
          inputChecksumMin !== undefined &&
          inputChecksumMax !== undefined &&
          inputChecksumMin > inputChecksumMax
        ) {
          throw new IgirException(
            'Invalid --input-checksum-min & --input-checksum-max, the min must be less than the max',
          );
        }
        return true;
      })
      .option('input-checksum-archives', {
        group: groupRomInput,
        description:
          'Calculate checksums of archive files themselves, allowing them to match files in DATs',
        choices: Object.keys(InputChecksumArchivesMode).map((mode) => mode.toLowerCase()),
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        default: InputChecksumArchivesModeInverted[InputChecksumArchivesMode.AUTO].toLowerCase(),
      })

      .option('dat', {
        group: groupDatInput,
        alias: 'd',
        description: 'Path(s) to DAT files or archives (supports globbing)',
        type: 'array',
        requiresArg: true,
      })
      .check((checkArgv) => {
        if (checkArgv.help) {
          return true;
        }
        if (checkArgv.dat && checkArgv.dat.length > 0 && checkArgv._.includes('dir2dat')) {
          throw new IgirException('Argument "--dat" cannot be used with the command "dir2dat"');
        }
        return true;
      })
      .option('dat-exclude', {
        group: groupDatInput,
        description:
          'Path(s) to DAT files or archives to exclude from processing (supports globbing)',
        type: 'array',
        requiresArg: true,
        implies: 'dat',
      })
      .option('dat-name-regex', {
        group: groupDatInput,
        description: 'Regular expression of DAT names to process',
        type: 'string',
        coerce: ArgumentsParser.readRegexFile,
        requiresArg: true,
      })
      .option('dat-name-regex-exclude', {
        group: groupDatInput,
        description: 'Regular expression of DAT names to exclude from processing',
        type: 'string',
        coerce: ArgumentsParser.readRegexFile,
        requiresArg: true,
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
          throw new IgirException(
            `Missing required argument for commands ${needDat.join(', ')}: --dat`,
          );
        }
        return true;
      })

      .option('patch', {
        group: groupPatchInput,
        alias: 'p',
        description: `Path(s) to ROM patch files or archives (supports globbing) (supported: ${PatchFactory.getSupportedExtensions().join(', ')})`,
        type: 'array',
        requiresArg: true,
      })
      .option('patch-exclude', {
        group: groupPatchInput,
        alias: 'P',
        description:
          'Path(s) to ROM patch files or archives to exclude from processing (supports globbing)',
        type: 'array',
        requiresArg: true,
        implies: 'patch',
      })
      .option('patch-only', {
        group: groupPatchInput,
        description: 'Only write patched ROMs to the output directory',
        type: 'boolean',
        implies: 'patch',
      })
      .check((checkArgv) => {
        const illegalPatchCommands = ['link'].filter((command) => checkArgv._.includes(command));
        if (illegalPatchCommands.length > 0) {
          const patchOptions = ['patch', 'patch-exclude', 'patch-only'].filter(
            (option) => checkArgv[option],
          );
          if (patchOptions.length > 0) {
            throw new IgirException(
              `Argument${patchOptions.length === 1 ? '' : 's'} ${patchOptions.map((opt) => `"${opt}"`).join(', ')} cannot be used with the command${illegalPatchCommands.length === 1 ? '' : 's'} ${illegalPatchCommands.map((cmd) => `"${cmd}"`).join(', ')}`,
            );
          }
        }
        return true;
      })

      .option('output', {
        group: groupRomOutputPath,
        alias: 'o',
        description: 'Path to the ROM output directory (supports replaceable symbols, see below)',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('dir-mirror', {
        group: groupRomOutputPath,
        description: 'Use the input subdirectory structure for the output directory',
        type: 'boolean',
        conflicts: ['dir-dat-mirror'],
      })
      .option('dir-dat-mirror', {
        group: groupRomOutputPath,
        description: 'Use the DAT subdirectory structure for the output directory',
        type: 'boolean',
        implies: 'dat',
        conflicts: ['dir-mirror'],
      })
      .option('dir-dat-name', {
        group: groupRomOutputPath,
        alias: 'D',
        description: 'Use the DAT name as the output subdirectory',
        type: 'boolean',
        implies: 'dat',
      })
      .option('dir-dat-description', {
        group: groupRomOutputPath,
        description: 'Use the DAT description as the output subdirectory',
        type: 'boolean',
        implies: 'dat',
      })
      .option('dir-letter', {
        group: groupRomOutputPath,
        description:
          'Group games in an output subdirectory by the first --dir-letter-count letters in their name',
        type: 'boolean',
      })
      .option('dir-letter-count', {
        group: groupRomOutputPath,
        description: 'How many game name letters to use for the subdirectory name',
        type: 'number',
        coerce: (val: number | number[]) => Math.max(ArgumentsParser.getLastValue(val), 1),
        requiresArg: true,
        default: 1,
      })
      .check((checkArgv) => {
        // Re-implement `implies: 'dir-letter'`, which isn't possible with a default value
        if (checkArgv['dir-letter-count'] > 1 && !checkArgv['dir-letter']) {
          throw new IgirException('Missing dependent arguments:\n dir-letter-count -> dir-letter');
        }
        return true;
      })
      .option('dir-letter-limit', {
        group: groupRomOutputPath,
        description:
          'Limit the number of games in letter subdirectories, splitting into multiple subdirectories if necessary',
        type: 'number',
        coerce: (val: number | number[]) => Math.max(ArgumentsParser.getLastValue(val), 1),
        requiresArg: true,
        implies: 'dir-letter',
      })
      .option('dir-letter-group', {
        group: groupRomOutputPath,
        description:
          'Group letter subdirectories into ranges, combining multiple letters together (requires --dir-letter-limit)',
        type: 'boolean',
        implies: 'dir-letter-limit',
      })
      .option('dir-game-subdir', {
        group: groupRomOutputPath,
        description: 'Append the name of the game as an output subdirectory depending on its ROMs',
        choices: Object.keys(GameSubdirMode).map((mode) => mode.toLowerCase()),
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        default: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
      })

      .option('fix-extension', {
        group: groupRomOutput,
        description:
          'Read files for known signatures and use the correct extension (also affects dir2dat)',
        choices: Object.keys(FixExtension).map((mode) => mode.toLowerCase()),
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        default: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
      })
      .option('overwrite', {
        group: groupRomOutput,
        alias: 'O',
        description: 'Overwrite any files in the output directory',
        type: 'boolean',
        conflicts: ['overwrite-invalid'],
      })
      .option('overwrite-invalid', {
        group: groupRomOutput,
        description:
          'Overwrite files in the output directory that are the wrong filesize, checksum, or zip contents',
        type: 'boolean',
        conflicts: ['overwrite'],
      })
      .check((checkArgv) => {
        const needOutput = ['copy', 'move', 'link', 'extract', 'zip', 'clean'].filter((command) =>
          checkArgv._.includes(command),
        );
        if (!checkArgv.output && needOutput.length > 0) {
          // TODO(cememr): print help message
          throw new IgirException(
            `Missing required argument for command${needOutput.length === 1 ? '' : 's'} ${needOutput.join(', ')}: --output <path>`,
          );
        }
        return true;
      })

      .option('move-delete-dirs', {
        group: groupRomMove,
        description: 'Delete empty subdirectories from the input directories after moving ROMs',
        choices: Object.keys(MoveDeleteDirs).map((mode) => mode.toLowerCase()),
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        default: MoveDeleteDirsInverted[MoveDeleteDirs.AUTO].toLowerCase(),
      })

      .option('clean-exclude', {
        group: groupRomClean,
        alias: 'C',
        description: 'Path(s) to files to exclude from cleaning (supports globbing)',
        type: 'array',
        requiresArg: true,
      })
      .option('clean-backup', {
        group: groupRomClean,
        description: 'Directory to move cleaned files to (instead of being recycled)',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('clean-dry-run', {
        group: groupRomClean,
        description: "Don't clean any files and instead only print what files would be cleaned",
        type: 'boolean',
      })
      .check((checkArgv) => {
        const needClean = ['clean-exclude', 'clean-backup', 'clean-dry-run'].filter(
          (option) => checkArgv[option] !== undefined,
        );
        if (!checkArgv._.includes('clean') && needClean.length > 0) {
          // TODO(cememr): print help message
          throw new IgirException(
            `Missing required command for option${needClean.length === 1 ? '' : 's'} ${needClean.join(', ')}: clean`,
          );
        }
        return true;
      })

      .option('zip-format', {
        group: groupRomZip,
        description: 'The structure format to use for written zip files',
        choices: Object.keys(ZipFormat).map((format) => format.toLowerCase()),
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        default: ZipFormatInverted[ZipFormat.TORRENTZIP].toLowerCase(),
      })
      .option('zip-exclude', {
        group: groupRomZip,
        alias: 'Z',
        description: 'Glob pattern of ROM filenames to exclude from zipping',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('zip-dat-name', {
        group: groupRomZip,
        description:
          'Group all ROMs from the same DAT into the same zip archive, if not excluded from zipping (enforces --dat-threads 1)',
        type: 'boolean',
      })
      .check((checkArgv) => {
        const needZip = ['zip-exclude', 'zip-dat-name'].filter(
          (option) => checkArgv[option] !== undefined,
        );
        if (!checkArgv._.includes('zip') && needZip.length > 0) {
          throw new IgirException(
            `Missing required command for option${needZip.length === 1 ? '' : 's'} ${needZip.join(', ')}: zip`,
          );
        }
        return true;
      })

      .option('link-mode', {
        group: groupRomLink,
        description: 'File linking mode',
        choices: Object.keys(LinkMode).map((mode) => mode.toLowerCase()),
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        default: LinkModeInverted[LinkMode.HARDLINK].toLowerCase(),
      })
      .option('symlink-relative', {
        group: groupRomLink,
        description: 'Create symlinks as relative to the target path, as opposed to absolute',
        type: 'boolean',
      })
      .check((checkArgv) => {
        const needLinkCommand = ['symlink'].filter((option) => checkArgv[option] !== undefined);
        if (!checkArgv._.includes('link') && needLinkCommand.length > 0) {
          throw new IgirException(
            `Missing required command for option${needLinkCommand.length === 1 ? '' : 's'} ${needLinkCommand.join(', ')}: link`,
          );
        }
        if (
          checkArgv['symlink-relative'] &&
          (checkArgv['link-mode'] as string).toLowerCase() !==
            LinkModeInverted[LinkMode.SYMLINK].toLowerCase()
        ) {
          throw new IgirException('Missing dependent arguments:\n symlink-relative -> link-mode');
        }
        return true;
      })

      .option('header', {
        group: groupRomHeader,
        description: 'Glob pattern of input filenames to force header detection for',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('remove-headers', {
        group: groupRomHeader,
        alias: 'H',
        description: `Remove known headers from ROMs, optionally limited to a list of comma-separated file extensions (supported: ${ROMHeader.getSupportedExtensions().join(', ')})`,
        type: 'string',
        coerce: (vals: string | string[]) =>
          (Array.isArray(vals) ? vals : [vals]).flatMap((val) => {
            if (val.trim() === '') {
              // Flag was provided without any extensions
              return val;
            }
            return val.split(',').map((v) => `.${v.trim().replace(/^\.+/, '')}`);
          }),
      })

      .option('trimmed-glob', {
        group: groupRomTrimmed,
        description:
          'Glob pattern of input filenames to force trimming detection for (overriding all options below)',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        implies: 'dat',
      })
      .option('trim-scan-files', {
        group: groupRomTrimmed,
        description: 'Detect trimming for uncompressed files',
        choices: Object.keys(TrimScanFiles).map((mode) => mode.toLowerCase()),
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        default: TrimScanFilesInverted[TrimScanFiles.AUTO].toLowerCase(),
      })
      .option('trim-scan-archives', {
        group: groupRomTrimmed,
        description: 'Detect trimming for files within archives (off by default)',
        type: 'boolean',
        implies: 'dat',
      })

      .option('merge-roms', {
        group: groupRomSet,
        description: 'ROM merge/split mode (requires DATs with parent/clone information)',
        choices: Object.keys(MergeMode).map((mode) => mode.toLowerCase()),
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        default: MergeModeInverted[MergeMode.FULLNONMERGED].toLowerCase(),
      })
      .check((checkArgv) => {
        // Re-implement `implies: 'dat'`, which isn't possible with a default value
        if (
          checkArgv['merge-roms'] !== MergeModeInverted[MergeMode.FULLNONMERGED].toLowerCase() &&
          !checkArgv.dat
        ) {
          throw new IgirException('Missing dependent arguments:\n merge-roms -> dat');
        }
        return true;
      })
      .option('merge-discs', {
        group: groupRomSet,
        description: 'Merge multi-disc games into one game',
        type: 'boolean',
      })
      .option('exclude-disks', {
        group: groupRomSet,
        description: 'Exclude CHD disks in DATs from processing & writing',
        type: 'boolean',
        implies: 'dat',
      })
      .option('allow-excess-sets', {
        group: groupRomSet,
        description: 'Allow writing archives that have excess files when not extracting or zipping',
        type: 'boolean',
        implies: 'dat',
      })
      .option('allow-incomplete-sets', {
        group: groupRomSet,
        description: "Allow writing games that don't have all of their ROMs",
        type: 'boolean',
        implies: 'dat',
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
        coerce: (vals: string | string[]) =>
          (Array.isArray(vals) ? vals : [vals]).flatMap((val) => val.toUpperCase().split(',')),
        requiresArg: true,
      })
      .check((checkArgv) => {
        const invalidLangs = checkArgv['filter-language']?.filter(
          (lang) => !Internationalization.LANGUAGES.includes(lang),
        );
        if (invalidLangs !== undefined && invalidLangs.length > 0) {
          throw new IgirException(
            `Invalid --filter-language language${invalidLangs.length === 1 ? '' : 's'}: ${invalidLangs.join(', ')}`,
          );
        }
        return true;
      })
      .option('filter-region', {
        group: groupRomFiltering,
        alias: 'R',
        description: `List of comma-separated regions to filter to (supported: ${Internationalization.REGION_CODES.join(', ')})`,
        type: 'string',
        coerce: (vals: string | string[]) =>
          (Array.isArray(vals) ? vals : [vals]).flatMap((val) => val.toUpperCase().split(',')),
        requiresArg: true,
      })
      .check((checkArgv) => {
        const invalidRegions = checkArgv['filter-region']?.filter(
          (lang) => !Internationalization.REGION_CODES.includes(lang),
        );
        if (invalidRegions !== undefined && invalidRegions.length > 0) {
          throw new IgirException(
            `Invalid --filter-region region${invalidRegions.length === 1 ? '' : 's'}: ${invalidRegions.join(', ')}`,
          );
        }
        return true;
      })
      .option('filter-category-regex', {
        group: groupRomFiltering,
        description: 'Regular expression of categories to filter to',
        type: 'string',
        coerce: ArgumentsParser.readRegexFile,
        requiresArg: true,
        implies: 'dat',
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
    yargsParser.option('only-retail', {
      group: groupRomFiltering,
      description: 'Filter to only retail releases, enabling all the following "no" options',
      type: 'boolean',
    });
    [
      ['debug', 'debug ROMs'],
      ['demo', 'demo ROMs'],
      ['beta', 'beta ROMs'],
      ['sample', 'sample ROMs'],
      ['prototype', 'prototype ROMs'],
      ['program', 'program application ROMs'],
      ['aftermarket', 'aftermarket ROMs'],
      ['homebrew', 'homebrew ROMs'],
      ['unverified', 'unverified ROMs'],
      ['bad', 'bad ROM dumps'],
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
      .option('single', {
        group: groupRomPriority,
        alias: 's',
        description:
          'Output only a single game per parent (1G1R) (required for all options below, requires DATs with parent/clone information)',
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
        coerce: (vals: string | string[]) =>
          (Array.isArray(vals) ? vals : [vals]).flatMap((val) => val.toUpperCase().split(',')),
        requiresArg: true,
        implies: 'single',
      })
      .check((checkArgv) => {
        const invalidLangs = checkArgv['prefer-language']?.filter(
          (lang) => !Internationalization.LANGUAGES.includes(lang),
        );
        if (invalidLangs !== undefined && invalidLangs.length > 0) {
          throw new IgirException(
            `Invalid --prefer-language language${invalidLangs.length === 1 ? '' : 's'}: ${invalidLangs.join(', ')}`,
          );
        }
        return true;
      })
      .option('prefer-region', {
        group: groupRomPriority,
        alias: 'r',
        description: `List of comma-separated regions in priority order (supported: ${Internationalization.REGION_CODES.join(', ')})`,
        type: 'string',
        coerce: (vals: string | string[]) =>
          (Array.isArray(vals) ? vals : [vals]).flatMap((val) => val.toUpperCase().split(',')),
        requiresArg: true,
        implies: 'single',
      })
      .check((checkArgv) => {
        const invalidRegions = checkArgv['prefer-region']?.filter(
          (lang) => !Internationalization.REGION_CODES.includes(lang),
        );
        if (invalidRegions !== undefined && invalidRegions.length > 0) {
          throw new IgirException(
            `Invalid --prefer-region region${invalidRegions.length === 1 ? '' : 's'}: ${invalidRegions.join(', ')}`,
          );
        }
        return true;
      })
      .option('prefer-revision', {
        group: groupRomPriority,
        description: 'Prefer older or newer revisions, versions, or ring codes',
        choices: Object.keys(PreferRevision).map((mode) => mode.toLowerCase()),
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        implies: 'single',
      })
      .option('prefer-retail', {
        group: groupRomPriority,
        description: 'Prefer retail releases (see --only-retail)',
        type: 'boolean',
        implies: 'single',
      })
      .option('prefer-parent', {
        group: groupRomPriority,
        description: 'Prefer parent ROMs over clones',
        type: 'boolean',
        implies: 'single',
      })

      .option('playlist-extensions', {
        group: groupPlaylist,
        description: 'List of comma-separated file extensions to generate multi-disc playlists for',
        type: 'string',
        coerce: (vals: string | string[]) =>
          (Array.isArray(vals) ? vals : [vals]).flatMap((val) => {
            if (val.trim() === '') {
              return [];
            }
            return val.split(',').map((v) => `.${v.trim().replace(/^\.+/, '')}`);
          }),
        requiresArg: true,
        default: '.cue,.gdi,.mdf,.chd',
      })
      .check((checkArgv) => {
        if (checkArgv._.includes('playlist') && checkArgv['playlist-extensions'].length === 0) {
          // TODO(cememr): print help message
          throw new IgirException(
            `Missing required argument for command playlist: --playlist-extensions <exts>`,
          );
        }
        return true;
      })

      .option('dir2dat-output', {
        group: groupDir2Dat,
        description: 'dir2dat output directory',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .check((checkArgv) => {
        const needDir2Dat = ['dir2dat-output'].filter((option) => checkArgv[option] !== undefined);
        if (!checkArgv._.includes('dir2dat') && needDir2Dat.length > 0) {
          // TODO(cememr): print help message
          throw new IgirException(
            `Missing required command for option${needDir2Dat.length === 1 ? '' : 's'} ${needDir2Dat.join(', ')}: dir2dat`,
          );
        }
        return true;
      })

      .option('fixdat-output', {
        group: groupFixdat,
        description: 'Fixdat output directory',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .check((checkArgv) => {
        const needFixdat = ['fixdat-output'].filter((option) => checkArgv[option] !== undefined);
        if (!checkArgv._.includes('fixdat') && needFixdat.length > 0) {
          // TODO(cememr): print help message
          throw new IgirException(
            `Missing required command for option${needFixdat.length === 1 ? '' : 's'} ${needFixdat.join(', ')}: fixdat`,
          );
        }
        return true;
      })

      .option('report-output', {
        group: groupReport,
        description: 'Report output file location (formatted with moment.js)',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        default: `./${Package.NAME}_%YYYY-%MM-%DDT%HH:%mm:%ss.csv`,
      })

      .option('dat-threads', {
        group: groupHelpDebug,
        description: 'Number of DATs to process in parallel',
        type: 'number',
        coerce: (val: number | number[]) => Math.max(ArgumentsParser.getLastValue(val), 1),
        requiresArg: true,
        default: Defaults.DAT_DEFAULT_THREADS,
      })
      .option('reader-threads', {
        group: groupHelpDebug,
        description: 'Maximum number of ROMs to read in parallel per disk',
        type: 'number',
        coerce: (val: number | number[]) => Math.max(ArgumentsParser.getLastValue(val), 1),
        requiresArg: true,
        default: Defaults.FILE_READER_DEFAULT_THREADS,
      })
      .option('writer-threads', {
        group: groupHelpDebug,
        description: 'Maximum number of ROMs to write in parallel',
        type: 'number',
        coerce: (val: number | number[]) => Math.max(ArgumentsParser.getLastValue(val), 1),
        requiresArg: true,
        default: Defaults.ROM_WRITER_DEFAULT_THREADS,
      })
      .middleware((middlewareArgv) => {
        if (middlewareArgv.zipDatName) {
          middlewareArgv.datThreads = 1;
        }
      }, true)
      .option('write-retry', {
        group: groupHelpDebug,
        description:
          'Number of additional retries to attempt when writing a file has failed (0 disables retries)',
        type: 'number',
        coerce: (val: number | number[]) => Math.max(ArgumentsParser.getLastValue(val), 0),
        requiresArg: true,
        default: Defaults.ROM_WRITER_ADDITIONAL_RETRIES,
      })
      .options('temp-dir', {
        group: groupHelpDebug,
        description: 'Path to a directory for temporary files',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
      })
      .option('disable-cache', {
        group: groupHelpDebug,
        description: 'Disable loading or saving the cache file',
        type: 'boolean',
      })
      .option('cache-path', {
        group: groupHelpDebug,
        description: 'Location for the cache file',
        type: 'string',
        coerce: ArgumentsParser.getLastValue, // don't allow string[] values
        requiresArg: true,
        conflicts: ['disable-cache'],
      })
      .option('verbose', {
        group: groupHelpDebug,
        alias: 'v',
        description: 'Enable verbose logging, can specify up to three times (-vvv)',
        type: 'count',
      })
      .middleware((middlewareArgv) => {
        if (middlewareArgv['clean-dry-run'] === true && middlewareArgv.verbose < 1) {
          this.logger.warn(
            '--clean-dry-run prints INFO logs for files skipped, enable them with -v',
          );
        }
      })

      .check((checkArgv) => {
        if (
          (checkArgv.mergeRoms as string).toLowerCase() !==
            MergeModeInverted[MergeMode.FULLNONMERGED].toLowerCase() &&
          (checkArgv.dirMirror || checkArgv.dirLetter)
        ) {
          this.logger.warn(
            `at least one --dir-* option was provided, be careful about how you organize non-'${MergeModeInverted[MergeMode.FULLNONMERGED].toLowerCase()}' ROM sets into different subdirectories`,
          );
        }

        if (
          (checkArgv.mergeRoms as string).toLowerCase() !==
            MergeModeInverted[MergeMode.FULLNONMERGED].toLowerCase() &&
          (checkArgv.noBios || checkArgv.noDevice)
        ) {
          this.logger.warn(
            `--no-bios and --no-device may leave non-'${MergeModeInverted[MergeMode.FULLNONMERGED].toLowerCase()}' ROM sets in an unplayable state`,
          );
        }

        if (
          checkArgv.single &&
          !checkArgv.preferParent &&
          (checkArgv.mergeRoms as string).toLowerCase() ===
            MergeModeInverted[MergeMode.SPLIT].toLowerCase()
        ) {
          this.logger.warn(
            `--single may leave '${MergeModeInverted[MergeMode.SPLIT].toLowerCase()}' ROM sets in an unplayable state`,
          );
        }

        return true;
      })

      .wrap(ArgumentsParser.getHelpWidth(argv))
      .version(false)

      // NOTE(cemmer): the .epilogue() renders after .example() but I want them switched
      .epilogue(
        `${'-'.repeat(ArgumentsParser.getHelpWidth(argv))}

Advanced usage:

  Tokens that are replaced when generating the output (--output) path of a ROM:
    {datName}         The name of the DAT that contains the ROM (e.g. "Nintendo - Game Boy")
    {datDescription}  The description of the DAT that contains the ROM
    {region}          The region of the ROM release (e.g. "USA"), each ROM can have multiple
    {language}        The language of the ROM release (e.g. "En"), each ROM can have multiple
    {type}            The type of the game (e.g. "Retail", "Demo", "Prototype")
    {category}        The DAT-defined category of the game (e.g. "Games", "Demos", "Multimedia")
    {genre}           The DAT-defined genre of the game

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
    {romm}      The ROM's manager-specific /roms/* directory for 'RomM' (e.g. "gb")
    {spruce}    The ROM's emulator-specific /Roms/* directory for SpruceOS (e.g. "GB")
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

  Create playlist files for all multi-disc games in an existing collection:
    $0 playlist --input ROMs/

  Create patched copies of ROMs in an existing collection, not overwriting existing files:
    $0 copy extract --input ROMs/ --patch Patches/ --output ROMs/

  Re-build a MAME ROM set for a specific version of MAME:
    $0 copy zip --dat "MAME 0.258.dat" --input MAME/ --output MAME-0.258/ --merge-roms split

  Copy ROMs to an Analogue Pocket and test they were written correctly:
    $0 copy extract test --dat "*.dat" --input ROMs/ --output /Assets/{pocket}/common/ --dir-letter`,
      )

      // Colorize help output
      .option('help', {
        group: groupHelpDebug,
        alias: 'h',
        description: 'Show help',
        type: 'boolean',
      })
      .fail((msg, err, _yargs) => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions,@typescript-eslint/no-unnecessary-condition
        if (err) {
          throw err;
        }
        this.logger.colorizeYargs(`${_yargs.help().toString().trimEnd()}\n`);
        throw new IgirException(msg);
      });

    const yargsArgv = yargsParser
      .strictOptions(true)
      .parse(argv, {}, (_err, _parsedArgv, output) => {
        if (output) {
          this.logger.colorizeYargs(`${output.trimEnd()}\n`);
        }
      });

    return Options.fromObject(yargsArgv);
  }
}
