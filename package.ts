import * as child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { path7za } from '7zip-bin';
import caxa from 'caxa';
import fg, { Options as GlobOptions } from 'fast-glob';
import yargs from 'yargs';

import Logger from './src/console/logger.js';
import LogLevel from './src/console/logLevel.js';
import Package from './src/globals/package.js';
import FsPoly from './src/polyfill/fsPoly.js';
import ExpectedError from './src/types/expectedError.js';

interface FileFilter extends GlobOptions {
  include?: string;
  exclude?: string;
}

const fileFilter = (filters: FileFilter[]): string[] => {
  let results: string[] = [];
  filters.forEach((filter) => {
    if (filter.include) {
      const include = fg
        .globSync(filter.include.replace(/\\/g, '/'), filter)
        .map((file) => path.resolve(file));
      if (include.length === 0) {
        throw new ExpectedError(`glob pattern '${filter.include}' returned no paths`);
      }
      results = [...results, ...include];
    }
    if (filter.exclude) {
      const exclude = new Set(
        fg.globSync(filter.exclude.replace(/\\/g, '/'), filter).map((file) => path.resolve(file)),
      );
      if (exclude.size === 0) {
        throw new ExpectedError(`glob pattern '${filter.exclude}' returned no paths`);
      }
      results = results.filter((result) => !exclude.has(result));
    }
  });
  return results;
};

const logger = new Logger(LogLevel.TRACE);

const argv = await yargs(process.argv.slice(2))
  .locale('en')
  .usage('Usage: $0 <input> <output>')
  .positional('input', {
    description: 'input directory',
    type: 'string',
    default: '.',
  })
  .check((_argv) => {
    if (!_argv.input || !fs.existsSync(_argv.input)) {
      throw new ExpectedError(`input directory '${_argv.input}' doesn't exist`);
    }
    return true;
  })
  .positional('output', {
    description: 'output file',
    type: 'string',
    default: Package.NAME + (process.platform === 'win32' ? '.exe' : ''),
  }).argv;

const input = path.resolve(argv.input);
logger.info(`Input: '${input}'`);

const include = new Set(
  fileFilter([
    // Start with the files we need
    { include: 'dist{,/**}', onlyFiles: false },
    { include: 'node_modules{,/**}', onlyFiles: false },
    { include: 'package*.json' },
    // Exclude unnecessary JavaScript files
    { exclude: 'dist/test/**' },
    { exclude: 'dist/{**/,}*.test.*' },
    { exclude: '**/jest.config.(js|ts|mjs|cjs|json)' },
    { exclude: '**/tsconfig*' },
    { exclude: '**/*.d.ts' },
    { exclude: '**/*.(js|ts).map' },
    // Exclude unnecessary docs files
    { exclude: 'node_modules/**/docs/{**/,}*.md' },
    {
      exclude:
        'node_modules/**/(AUTHORS|CHANGELOG|CHANGES|CODE_OF_CONDUCT|CONTRIBUTING|GOVERNANCE|HISTORY|LICENSE|README|RELEASE|RELEASE-NOTES|SECURITY|TROUBLESHOOTING){,*.md,*.markdown,*.txt}',
      caseSensitiveMatch: false,
    },
    // Only include the exact 7zip-bin we need
    { exclude: 'node_modules/{**/,}7zip-bin/**/7z*' },
    { include: path7za },
  ]),
);
const includeSize = (
  await Promise.all(
    [...include].map(async (file) => {
      if (await FsPoly.isDirectory(file)) {
        return 0;
      }
      return FsPoly.size(file);
    }),
  )
).reduce((sum, size) => sum + size, 0);
logger.info(
  `Include: found ${FsPoly.sizeReadable(includeSize)} of ${include.size.toLocaleString()} file${include.size !== 1 ? 's' : ''} to include`,
);

const exclude = fileFilter([{ include: '*{,/**}', onlyFiles: false, dot: true }]).filter(
  (file) => !include.has(file),
);
const excludeSize = (
  await Promise.all(
    exclude.map(async (file) => {
      if (await FsPoly.isDirectory(file)) {
        return 0;
      }
      return FsPoly.size(file);
    }),
  )
).reduce((sum, size) => sum + size, 0);
logger.info(
  `Exclude: found ${FsPoly.sizeReadable(excludeSize)} of ${exclude.length.toLocaleString()} file${exclude.length !== 1 ? 's' : ''} to exclude`,
);
const excludeGlobs = exclude.map((glob) => fg.convertPathToPattern(glob));

const output = path.resolve(argv.output);
logger.info(`Output: '${input}'`);

logger.info('Building ...');
await caxa({
  input,
  output,
  exclude: excludeGlobs,
  command: [
    `{{caxa}}/node_modules/.bin/node${process.platform === 'win32' ? '.exe' : ''}`,
    '{{caxa}}/dist/index.js',
  ],
});

if (!(await FsPoly.exists(output))) {
  throw new ExpectedError(`output file '${output}' doesn't exist`);
}
logger.info(`Output: ${FsPoly.sizeReadable(await FsPoly.size(output))}`);

const proc = child_process.spawn(output, ['--help'], { windowsHide: true });
let procOutput = '';
proc.stdout.on('data', (chunk: Buffer) => {
  procOutput += chunk.toString();
});
proc.stderr.on('data', (chunk: Buffer) => {
  procOutput += chunk.toString();
});
await new Promise((resolve, reject) => {
  proc.on('close', resolve);
  proc.on('error', reject);
});
logger.trace(procOutput);
