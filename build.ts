import child_process from 'node:child_process';
import path from 'node:path';

import fg from 'fast-glob';

import FsPoly from './src/polyfill/fsPoly.js';

// Delete any previous build output
if (await FsPoly.exists('dist')) {
  await FsPoly.rm('dist', { recursive: true });
}

// Transpile the TypeScript
await new Promise((resolve, reject) => {
  const tsc = child_process.spawn(
    'npm',
    ['exec', 'tsc', '--', '--declaration', 'false', '--sourceMap', 'false'],
    {
      windowsHide: true,
    },
  );
  tsc.on('close', resolve);
  tsc.on('error', reject);
});
await new Promise((resolve, reject) => {
  const tscAlias = child_process.spawn('npm', ['exec', 'tsc-alias', '--'], {
    windowsHide: true,
  });
  tscAlias.on('close', resolve);
  tscAlias.on('error', reject);
});

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
    'tsconfig.json',
    'packages/*/deps/**',
    'packages/*/prebuilds/**',
    'packages/*/binding.cpp',
    'packages/*/*.gyp',
    'packages/*/package.json',
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
    'packages/zstd*/deps/**/lib/dll/**',
    'packages/zstd*/deps/**/lib/legacy/**',
    'packages/zstd*/deps/**/programs/**',
    'packages/zstd*/deps/**/tests/**',
  ],
  'dist',
);

if (process.platform !== 'win32') {
  await new Promise((resolve, reject) => {
    const chmod = child_process.spawn('chmod', ['+x', path.join('dist', 'index.js')], {
      windowsHide: true,
    });
    chmod.on('close', resolve);
    chmod.on('error', reject);
  });
}
