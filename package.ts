import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { path7za } from '7zip-bin';
import caxa from 'caxa';
import esbuild from 'esbuild';
import fg, { Options as GlobOptions } from 'fast-glob';
import yargs from 'yargs';

import Timer from './src/async/timer.js';
import Logger from './src/console/logger.js';
import { LogLevel } from './src/console/logLevel.js';
import Package from './src/globals/package.js';
import FsPoly from './src/polyfill/fsPoly.js';
import IgirException from './src/types/exceptions/igirException.js';

interface FileFilter extends GlobOptions {
  include?: string;
  exclude?: string;
}

const fileFilter = (filters: FileFilter[]): string[] => {
  let results: string[] = [];
  filters.forEach((filter) => {
    if (filter.include) {
      const includeNormalized = filter.include.replaceAll('\\', '/');
      const include = fg.globSync(includeNormalized, filter).map((file) => path.resolve(file));
      if (include.length === 0) {
        throw new IgirException(`glob pattern '${includeNormalized}' returned no paths`);
      }
      results = [...results, ...include];
    }
    if (filter.exclude) {
      const excludeNormalized = filter.exclude.replaceAll('\\', '/');
      const exclude = new Set(
        fg.globSync(excludeNormalized, filter).map((file) => path.resolve(file)),
      );
      if (exclude.size === 0) {
        throw new IgirException(`glob pattern '${excludeNormalized}' returned no paths`);
      }
      results = results.filter((result) => !exclude.has(result));
    }
  });
  return results;
};

const logger = new Logger(LogLevel.TRACE, process.stdout);

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
      throw new IgirException(`input directory '${_argv.input}' doesn't exist`);
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

const output = path.resolve(argv.output);
logger.info(`Output: '${output}'`);

// Generate the ./dist directory
logger.info(`Bundling with 'esbuild' ...`);
await FsPoly.rm('dist', { recursive: true, force: true });
await esbuild.build({
  entryPoints: ['index.ts'],
  outfile: path.join(input, 'dist', 'bundle.js'),
  platform: 'node',
  bundle: true,
  packages: 'external',
  format: 'esm',
});

// Generate the prebuilds directory
const prebuilds = path.join('dist', 'prebuilds');
await FsPoly.rm(prebuilds, { recursive: true, force: true });
await FsPoly.copyDir(
  path.join(input, 'packages', 'zlib-1.1.3', 'prebuilds', `${process.platform}-${process.arch}`),
  path.join(prebuilds, `${process.platform}-${process.arch}`),
);
await FsPoly.copyDir(
  path.join(input, 'packages', 'zstd-1.5.5', 'prebuilds', `${process.platform}-${process.arch}`),
  path.join(prebuilds, `${process.platform}-${process.arch}`),
);

const include = new Set(
  fileFilter([
    // Start with the files we need
    { include: 'dist{,/**}', onlyFiles: false },
    { include: 'node_modules{,/**}', onlyFiles: false },
    { include: 'package*.json' },
    // Exclude unnecessary JavaScript files
    { exclude: '**/jest.config.(js|ts|mjs|cjs|json)' },
    { exclude: '**/tsconfig*' },
    { exclude: '**/*.d.ts' },
    { exclude: '**/*.(js|ts).map' },
    // Exclude unnecessary docs files
    { exclude: 'node_modules/**/docs/{**/,}*.md' },
    {
      exclude:
        'node_modules/**/(AUTHORS|BUILDING|CHANGELOG|CHANGES|CODE_OF_CONDUCT|CONTRIBUTING|FAQ|GOVERNANCE|HISTORY|INDEX|README|RELEASE|RELEASE-NOTES|SECURITY|TESTING|TROUBLESHOOTING){,*.md,*.markdown,*.txt}',
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
  `Include: found ${FsPoly.sizeReadable(includeSize)} of ${include.size.toLocaleString()} file${include.size === 1 ? '' : 's'} to include`,
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
  `Exclude: found ${FsPoly.sizeReadable(excludeSize)} of ${exclude.length.toLocaleString()} file${exclude.length === 1 ? '' : 's'} to exclude`,
);
const excludeGlobs = exclude.map((glob) => fg.convertPathToPattern(glob));

logger.info("Packaging with 'caxa' ...");
await caxa({
  input,
  output,
  exclude: excludeGlobs,
  command: [
    `{{caxa}}/node_modules/.bin/node${process.platform === 'win32' ? '.exe' : ''}`,
    '{{caxa}}/dist/bundle.js',
  ],
});
await FsPoly.rm(prebuilds, { recursive: true });

if (!(await FsPoly.exists(output))) {
  throw new IgirException(`output file '${output}' doesn't exist`);
}
logger.info(`Output: ${FsPoly.sizeReadable(await FsPoly.size(output))}`);

logger.info(`Testing: '${output}' ...`);
const procOutput = await new Promise<string>((resolve, reject) => {
  const proc = child_process.spawn(output, ['--help'], { windowsHide: true });
  let procOutput = '';
  proc.stdout.on('data', (chunk: Buffer) => {
    procOutput += chunk.toString();
  });
  proc.stderr.on('data', (chunk: Buffer) => {
    procOutput += chunk.toString();
  });
  proc.on('close', () => {
    resolve(procOutput);
  });
  proc.on('error', reject);
});
logger.trace(procOutput);

Timer.cancelAll();
logger.info('Finished!');
