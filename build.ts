import child_process from 'node:child_process';
import path from 'node:path';

import fg from 'fast-glob';

import Timer from './src/async/timer.js';
import Logger from './src/console/logger.js';
import { LogLevel } from './src/console/logLevel.js';
import FsPoly from './src/polyfill/fsPoly.js';

const logger = new Logger(LogLevel.TRACE, process.stdout);

const output = 'dist';
logger.info(`Output: '${output}'`);

// Delete any previous build output
if (await FsPoly.exists(output)) {
  logger.info(`Deleting '${output}' ...`);
  await FsPoly.rm(output, { recursive: true });
}

// Transpile the TypeScript
await new Promise((resolve, reject) => {
  logger.info(`Running 'tsc' ...`);
  const tsc = child_process.spawn(
    'npm',
    ['exec', 'tsc', '--', '--declaration', 'false', '--sourceMap', 'false'],
    {
      windowsHide: true,
    },
  );
  tsc.stderr.on('data', (data: Buffer) => process.stderr.write(data));
  tsc.on('close', resolve);
  tsc.on('error', reject);
});

logger.info(`Copying additional files ...`);
/**
 * Copy some files and exclude others to an output directory.
 */
async function copyfiles(
  inputGlobs: string[],
  excludeGlobs: string[],
  outputDirectory: string,
): Promise<void> {
  const excludeFiles = new Set(
    (
      await Promise.all(excludeGlobs.map(async (glob) => fg(glob, { caseSensitiveMatch: false })))
    ).flat(),
  );

  const inputFiles = (
    await Promise.all(inputGlobs.map(async (glob) => fg(glob, { caseSensitiveMatch: false })))
  )
    .flat()
    .filter((inputFile) => !excludeFiles.has(inputFile));

  await Promise.all(
    inputFiles.map(async (inputFile) => {
      const outputPath = path.join(outputDirectory, inputFile);
      const outputDir = path.dirname(outputPath);
      if (!(await FsPoly.exists(outputDir))) {
        await FsPoly.mkdir(outputDir, { recursive: true });
      }
      await FsPoly.copyFile(inputFile, path.join(outputDirectory, inputFile));
    }),
  );
}
await copyfiles(
  [
    'packages/*/deps/**',
    'packages/*/prebuilds/**',
    'packages/*/binding.cpp',
    'packages/*/binding.gyp',
  ],
  [
    'packages/*/deps/**/(AUTHORS|BUILDING|CHANGELOG|CHANGES|CODE_OF_CONDUCT|CONTRIBUTING|FAQ|GOVERNANCE|HISTORY|INDEX|README|RELEASE|RELEASE-NOTES|SECURITY|TESTING|TROUBLESHOOTING){,*.md,*.markdown,*.txt}',
    'packages/*/deps/**/appveyor.yml',
    'packages/*/deps/**/Package.swift',
    // zlib
    'packages/zlib*/deps/**/amiga/**',
    'packages/zlib*/deps/**/contrib/**',
    'packages/zlib*/deps/**/msdos/**',
    // zstd
    'packages/zstd*/deps/**/build/meson/**',
    'packages/zstd*/deps/**/build/single_file_libs/**',
    'packages/zstd*/deps/**/build/VS2008/**',
    'packages/zstd*/deps/**/contrib/**',
    'packages/zstd*/deps/**/examples/**',
    'packages/zstd*/deps/**/doc/**',
    'packages/zstd*/deps/**/lib/deprecated/**',
    'packages/zstd*/deps/**/lib/dictBuilder/**',
    'packages/zstd*/deps/**/lib/dll/**',
    'packages/zstd*/deps/**/lib/legacy/**',
    'packages/zstd*/deps/**/programs/**',
    'packages/zstd*/deps/**/tests/**',
    'packages/zstd*/deps/**/zlibWrapper/**',
  ],
  output,
);

if (process.platform !== 'win32') {
  logger.info(`chmod +x index.js ...`);
  await new Promise((resolve, reject) => {
    const chmod = child_process.spawn('chmod', ['+x', path.join(output, 'index.js')], {
      windowsHide: true,
    });
    chmod.stderr.on('data', (data: Buffer) => process.stderr.write(data));
    chmod.on('close', resolve);
    chmod.on('error', reject);
  });
}

Timer.cancelAll();
logger.info('Finished!');
