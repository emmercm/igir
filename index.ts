#!/usr/bin/env node

import yargs from 'yargs';

import main from './src/app.js';
import Constants from './src/constants.js';
import Logger from './src/logger.js';
import Options from './src/types/options.js';

Logger.header(Constants.COMMAND_NAME);

const groupInputOutputPaths = 'Path options (inputs support globbing):';
const groupPresets = 'Presets for options commonly used together:';
const groupOutput = 'Output options:';
const groupPriority = 'Priority options:';
const groupFiltering = 'Filtering options:';

const getLastValue = (arr: unknown[]) => {
  if (Array.isArray(arr) && arr.length) {
    return arr[arr.length - 1];
  }
  return arr;
};

let cliArgv = process.argv;

const yargsParser = yargs([])
  .parserConfiguration({
    'boolean-negation': false,
  })
  .scriptName(Constants.COMMAND_NAME)
  .usage('Usage: $0 [presets] [options]')

  .option('dat', {
    group: groupInputOutputPaths,
    alias: 'd',
    description: 'Path(s) to DAT files',
    demandOption: true,
    type: 'array',
    requiresArg: true,
    default: ['*.dat'],
  })
  .option('input', {
    group: groupInputOutputPaths,
    alias: 'i',
    description: 'Path(s) to ROM files, with support for .zip and .7z archives',
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
    coerce: getLastValue,
    requiresArg: true,
    conflicts: ['dry-run'],
  })
  .option('dry-run', {
    group: groupInputOutputPaths,
    description: 'Don\'t write or move any ROMs',
    type: 'boolean',
    coerce: getLastValue,
    conflicts: ['output', 'zip', 'move', 'overwrite', 'clean'],
  })
  .check((argv) => {
    if (argv.help) {
      return true;
    }
    if ((!argv.output || !argv.output.length) && !argv.dryRun) {
      throw new Error('Missing required argument: output');
    }
    return true;
  });

// Configure presets
[
  {
    name: 'preset-1g1r',
    description: 'Build one game, one ROM set(s)',
    options: ['--single', '--test', '--clean'],
  }, {
    name: 'preset-english',
    description: 'Prefer English ROMs from USA>EUR>JPN',
    options: ['--prefer-language', 'En', '--prefer-region', 'USA,EUR,JPN'],
  }, {
    name: 'preset-retail',
    description: 'Exclude non-retail ROMs',
    options: ['--no-demo', '--no-beta', '--no-sample', '--no-prototype',
      '--no-test-roms', '--no-aftermarket', '--no-homebrew', '--no-bad'],
  }, {
    name: 'preset-flash-cart',
    description: 'Copy ROMs to a flash cart',
    options: ['--dir-letter', '--zip false', '--move false'],
  },
].forEach((preset) => {
  // Add the option to help text
  yargsParser.option(preset.name, {
    group: groupPresets,
    description: `${preset.description}: ${preset.options.join(' ')}`,
    type: 'boolean',
    coerce: getLastValue,
  });

  // Replace the preset flag with its group of flags
  const flagIndex = cliArgv.indexOf(`--${preset.name}`);
  if (flagIndex !== -1) {
    cliArgv = [
      ...cliArgv.slice(0, flagIndex - 1),
      ...preset.options,
      ...cliArgv.slice(flagIndex),
    ];
  }
});

yargsParser
  .option('dir-mirror', {
    group: groupOutput,
    description: 'Use the input subdirectory structure as the output subdirectory',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('dir-datname', {
    group: groupOutput,
    alias: 'D',
    description: 'Use the DAT name as the output subdirectory',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('dir-letter', {
    group: groupOutput,
    description: 'Append the first letter of the ROM name as an output subdirectory',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('single', {
    group: groupOutput,
    alias: 's',
    description: 'Output only a single game per parent (requires parent-clone DAT files)',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('zip', {
    group: groupOutput,
    alias: 'z',
    description: 'Zip archive ROM files',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('zip-exclude', {
    group: groupOutput,
    alias: 'Z',
    description: 'Glob pattern of files to exclude from zipping',
    type: 'string',
    coerce: getLastValue,
    requiresArg: true,
  })
  .option('move', {
    group: groupOutput,
    alias: 'm',
    description: 'Move ROMs to the output directory rather than copy',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('overwrite', {
    group: groupOutput,
    alias: 'O',
    description: 'Overwrite any ROMs in the output directory',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('test', {
    group: groupOutput,
    alias: 't',
    description: 'Test ROMs for accuracy after writing them',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('clean', {
    group: groupOutput,
    alias: 'c',
    description: 'Remove unmatched files from the ROM output directory',
    type: 'boolean',
    coerce: getLastValue,
  })

  .option('prefer-good', {
    group: groupPriority,
    description: 'Prefer good ROM dumps over bad',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('prefer-language', {
    group: groupPriority,
    alias: 'l',
    description: 'List of comma-separated languages in priority order',
    type: 'string',
    coerce: (val: string) => val.split(','),
    requiresArg: true,
  })
  .option('prefer-region', {
    group: groupPriority,
    alias: 'r',
    description: 'List of comma-separated regions in priority order',
    type: 'string',
    coerce: (val: string) => val.split(','),
    requiresArg: true,
  })
  .option('prefer-revisions-newer', {
    group: groupPriority,
    description: 'Prefer newer ROM revisions over older',
    type: 'boolean',
    coerce: getLastValue,
    conflicts: ['prefer-revisions-older'],
  })
  .option('prefer-revisions-older', {
    group: groupPriority,
    description: 'Prefer older ROM revisions over newer',
    type: 'boolean',
    coerce: getLastValue,
    conflicts: ['prefer-revisions-newer'],
  })
  .option('prefer-retail', {
    group: groupPriority,
    description: 'Prefer ROMs marked as releases',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('prefer-parent', {
    group: groupPriority,
    description: 'Prefer parent ROMs over clones (requires parent-clone DAT files)',
    type: 'boolean',
    coerce: getLastValue,
  })

  .option('language-filter', {
    group: groupFiltering,
    alias: 'L',
    description: 'List of comma-separated languages to limit to',
    type: 'string',
    coerce: (val: string) => val.split(','),
    requiresArg: true,
  })
  .option('region-filter', {
    group: groupFiltering,
    alias: 'R',
    description: 'List of comma-separated regions to limit to',
    type: 'string',
    coerce: (val: string) => val.split(','),
    requiresArg: true,
  })
  .option('only-bios', {
    group: groupFiltering,
    description: 'Filter to only BIOS files',
    type: 'boolean',
    coerce: getLastValue,
    conflicts: ['no-bios'],
  })
  .option('no-bios', {
    group: groupFiltering,
    description: 'Filter out BIOS files',
    type: 'boolean',
    coerce: getLastValue,
    conflicts: ['only-bios'],
  })
  .option('no-unlicensed', {
    group: groupFiltering,
    description: 'Filter out unlicensed ROMs',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('only-retail', {
    group: groupFiltering,
    description: 'Filter to only retail releases, enabling all the following flags',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('no-demo', {
    group: groupFiltering,
    description: 'Filter out demo ROMs',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('no-beta', {
    group: groupFiltering,
    description: 'Filter out beta ROMs',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('no-sample', {
    group: groupFiltering,
    description: 'Filter out sample ROMs',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('no-prototype', {
    group: groupFiltering,
    description: 'Filter out prototype ROMs',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('no-test-roms', {
    group: groupFiltering,
    description: 'Filter out test ROMs',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('no-aftermarket', {
    group: groupFiltering,
    description: 'Filter out aftermarket ROMs',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('no-homebrew', {
    group: groupFiltering,
    description: 'Filter out homebrew ROMs',
    type: 'boolean',
    coerce: getLastValue,
  })
  .option('no-bad', {
    group: groupFiltering,
    description: 'Filter out bad ROM dumps',
    type: 'boolean',
    coerce: getLastValue,
  })

  .wrap(Math.min(yargs([]).terminalWidth() || Number.MAX_SAFE_INTEGER, 120))
  .version(false)
  .example([
    ['$0 -i **/*.zip -o 1G1R/ -s -l En -r USA,EUR,JPN', 'Produce a 1G1R set per console, preferring English from USA>EUR>JPN'],
    [''], // https://github.com/yargs/yargs/issues/1640
    ['$0 -i **/*.zip -i 1G1R/ -o 1G1R/', 'Merge new ROMs into an existing ROM collection'],
    [''], // https://github.com/yargs/yargs/issues/1640
    ['$0 -i 1G1R/ -o 1G1R/ -m -z', 'Organize and zip an existing ROM collection'],
    [''], // https://github.com/yargs/yargs/issues/1640
    ['$0 -i **/*.zip -o bios/ --only-bios', 'Collate all BIOS files'],
    // [''], // https://github.com/yargs/yargs/issues/1640
    // ['$0 -i 1G1R/ -o bios/ -D --dir-letter -t', 'Copy ROMs to a flash cart'],
  ])

// Colorize help output
  .option('help', {
    alias: 'h',
    description: 'Show help',
    type: 'boolean',
  })
  .fail((msg, err, _yargs) => {
    if (err) {
      throw err;
    }
    Logger.colorizeYargs(`${_yargs.help()}\n`);
    Logger.error(msg);
    process.exit(1);
  });

const yargsArgv = yargsParser
  .strictOptions(true)
  .parse(cliArgv, {}, (err, argv, output) => {
    if (output) {
      Logger.colorizeYargs(output);
      process.exit(0);
    }
  });

(async () => {
  const options = Options.fromObject(yargsArgv);
  await main(options);
})();
