import yargs from 'yargs';

import main from './src/app.js';
import Logger from './src/logger.js';
import Options from './src/types/options.js';

Logger.header();

const groupInputs = 'Path inputs (supports globbing):';
const groupOutput = 'Output options:';
const groupPriority = 'Priority options:';
const groupFiltering = 'Filtering options:';

const { argv } = yargs(process.argv)
  .parserConfiguration({
    'boolean-negation': false,
  })
  .usage('Usage: $0 [options]')

  .option('dat', {
    group: groupInputs,
    alias: 'd',
    description: 'Path(s) to DAT files',
    type: 'array',
    default: ['*.dat'],
  })
  .option('input', {
    group: groupInputs,
    alias: 'i',
    description: 'Path(s) to ROM files',
    demandOption: true,
    type: 'array',
  })

  .option('output', {
    group: groupOutput,
    alias: 'o',
    description: 'Path to the ROM output directory',
    demandOption: true,
    type: 'string',
  })
  .option('dir-mirror', {
    group: groupOutput,
    description: 'Use the input subdirectory structure as the output subdirectory',
    type: 'boolean',
  })
  .option('dir-datname', {
    group: groupOutput,
    description: 'Use the DAT name as the output subdirectory',
    type: 'boolean',
  })
  .option('dir-letter', {
    group: groupOutput,
    description: 'Append the first letter of the ROM name as an output subdirectory',
    type: 'boolean',
  })
  .option('1g1r', {
    group: groupOutput,
    alias: '1',
    description: 'Output only one game per parent (requires parent-clone DAT files)',
    type: 'boolean',
  })
  .option('zip', {
    group: groupOutput,
    alias: 'z',
    description: 'Zip archive ROM files',
    type: 'boolean',
  })
  .option('move', {
    group: groupOutput,
    alias: 'm',
    description: 'Move ROMs to the output directory',
    type: 'boolean',
  })
  .option('overwrite', {
    group: groupOutput,
    alias: 'O',
    description: 'Overwrite any ROMs in the output directory',
    type: 'boolean',
  })
  .option('clean', {
    group: groupOutput,
    alias: 'c',
    description: 'Remove unmatched files from the ROM output directory',
    type: 'boolean',
  })

  .option('prefer-good', {
    group: groupPriority,
    description: 'Prefer good ROM dumps over bad',
    type: 'boolean',
    default: true,
  })
  .option('language-priority', {
    group: groupPriority,
    alias: 'l',
    description: 'List of comma-separated languages in priority order',
    type: 'string',
    coerce: (val: string) => val.split(','),
  })
  .option('region-priority', {
    group: groupPriority,
    alias: 'r',
    description: 'List of comma-separated regions in priority order',
    type: 'string',
    coerce: (val: string) => val.split(','),
  })
  .option('prefer-revisions-newer', {
    group: groupPriority,
    description: 'Prefer newer ROM revisions over older',
    type: 'boolean',
    conflicts: ['prefer-revisions-older'],
  })
  .option('prefer-revisions-older', {
    group: groupPriority,
    description: 'Prefer older ROM revisions over newer',
    type: 'boolean',
    conflicts: ['prefer-revisions-newer'],
  })
  .option('prefer-releases', {
    group: groupPriority,
    description: 'Prefer ROMs marked as releases',
    type: 'boolean',
  })
  .option('prefer-parents', {
    group: groupPriority,
    description: 'Prefer parent ROMs over clones (requires parent-clone DAT files)',
    type: 'boolean',
  })

  .option('language-filter', {
    group: groupFiltering,
    alias: 'L',
    description: 'List of comma-separated languages to limit to',
    type: 'string',
    coerce: (val: string) => val.split(','),
  })
  .option('region-filter', {
    group: groupFiltering,
    alias: 'R',
    description: 'List of comma-separated regions to limit to',
    type: 'string',
    coerce: (val: string) => val.split(','),
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
  .option('no-test', {
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
    default: true,
  })

  .wrap(yargs([]).terminalWidth() || 100)
  .version(false)
  .help(true)
  .example([
    ['$0 -i **/*.zip -o 1G1R/ -1 -l En -r USA,EUR,JPN', 'Produce a 1G1R set per console, preferring English from USA>EUR>JPN'],
    [''], // https://github.com/yargs/yargs/issues/1640
    ['$0 -i **/*.zip -i 1G1R/ -o 1G1R/', 'Merge new ROMs into an existing ROM collection'],
    [''], // https://github.com/yargs/yargs/issues/1640
    ['$0 -i 1G1R/ -o 1G1R/ -m -z', 'Organize and zip an existing ROM collection'],
    [''], // https://github.com/yargs/yargs/issues/1640
    ['$0 -i **/*.zip -o bios/ --only-bios', 'Collate all BIOS files'],
  ]);

(async () => {
  const options = await Options.fromObject(argv);
  await main(options);
})();
