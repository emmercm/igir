import child_process from 'node:child_process';
import path from 'node:path';

import esbuild from 'esbuild';
import fg from 'fast-glob';

import Timer from '../src/async/timer.js';
import { logger } from '../src/console/logger.js';
import FsUtil from '../src/utils/fsUtil.js';

logger.info('========== BUILDING ==========');

const output = 'dist';
logger.info(`Output: '${output}'`);

// Delete any previous build output
if (await FsUtil.exists(output)) {
  logger.info(`Deleting '${output}' ...`);
  await FsUtil.rm(output, { recursive: true });
}

// Transpile the TypeScript
logger.info(`Running 'esbuild' ...`);
await esbuild.build({
  entryPoints: await fg('!(.*|node_modules|scripts|test|*.config){,/**/}!(*.test).ts'),
  outdir: path.join(output),
  platform: 'node',
  bundle: false,
  sourcemap: true,
  packages: 'external',
  format: 'esm',
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
      await Promise.all(
        excludeGlobs.map(async (glob) => await fg(glob, { caseSensitiveMatch: false })),
      )
    ).flat(),
  );

  const inputFiles = (
    await Promise.all(inputGlobs.map(async (glob) => await fg(glob, { caseSensitiveMatch: false })))
  )
    .flat()
    .filter((inputFile) => !excludeFiles.has(inputFile));

  await Promise.all(
    inputFiles.map(async (inputFile) => {
      const outputPath = path.join(outputDirectory, inputFile);
      const outputDir = path.dirname(outputPath);
      if (!(await FsUtil.exists(outputDir))) {
        await FsUtil.mkdir(outputDir, { recursive: true });
      }
      await FsUtil.copyFile(inputFile, path.join(outputDirectory, inputFile));
    }),
  );
}
await copyfiles(
  [
    'packages/chdman/deps/mame/3rdparty/flac/include/FLAC/**/*',
    'packages/chdman/deps/mame/3rdparty/flac/include/share/**/*',
    'packages/chdman/deps/mame/3rdparty/flac/src/libFLAC/**/*',
    'packages/chdman/deps/mame/3rdparty/flac/**/{COPYING,LICENSE}*',
    'packages/chdman/deps/mame/3rdparty/lzma/C/**/*',
    'packages/chdman/deps/mame/3rdparty/lzma/**/{COPYING,LICENSE}*',
    'packages/chdman/deps/mame/3rdparty/utf8proc/utf8proc.h',
    'packages/chdman/deps/mame/3rdparty/utf8proc/**/{COPYING,LICENSE}*',
    'packages/chdman/deps/mame/3rdparty/zlib/**/*',
    'packages/chdman/deps/mame/3rdparty/zlib/**/{COPYING,LICENSE}*',
    'packages/chdman/deps/mame/3rdparty/zstd/lib/**/*',
    'packages/chdman/deps/mame/3rdparty/zstd/**/{COPYING,LICENSE}*',
    'packages/chdman/deps/mame/src/emu/emucore.h',
    'packages/chdman/deps/mame/src/emu/emufwd.h',
    'packages/chdman/deps/mame/src/lib/util/**/*',
    'packages/chdman/deps/mame/src/osd/*',
    'packages/chdman/deps/mame/src/osd/modules/*',
    'packages/chdman/deps/mame/src/osd/modules/file/**/*',
    'packages/chdman/deps/mame/src/osd/modules/lib/**/*',
    'packages/chdman/deps/mame/src/osd/windows/**/*',
    'packages/chdman/deps/mame/{COPYING,LICENSE}*',
    'packages/zlib*/deps/**',
    'packages/zstd*/deps/**',
    'packages/*/addon*/**',
    'packages/*/**/*.cpp',
    'packages/*/binding.gyp',
    'src/**/*.json',
  ],
  [
    'packages/*/deps/**/(AUTHORS|BUILDING|CHANGELOG|CHANGES|CODE_OF_CONDUCT|CONTRIBUTING|FAQ|GOVERNANCE|HISTORY|INDEX|README|RELEASE|RELEASE-NOTES|SECURITY|TESTING|TROUBLESHOOTING){,*.md,*.markdown,*.txt}',
    'packages/*/deps/**/*.{ico,pdf}',
    'packages/*/deps/**/appveyor.yml',
    'packages/*/deps/**/configure',
    'packages/*/deps/**/BUCK', // Buck
    'packages/*/deps/**/*.modulemap', // Clang
    'packages/*/deps/**/{CMakeLists.txt,*.cmake,*.cmakein,*.cmake.in}', // CMake
    'packages/*/deps/**/{Makefile*,*.mak,*.mk}', // Make
    'packages/*/deps/**/*.pc.in', // pkg-config
    'packages/*/deps/**/{*.sln,*.vcxproj}', // Visual Studio
    'packages/*/deps/**/Package.swift',
    // chdman
    'packages/chdman/deps/mame/3rdparty/flac/src/libFLAC/*intrin*.c',
    'packages/chdman/deps/mame/3rdparty/flac/src/libFLAC/metadata*.c',
    'packages/chdman/deps/mame/3rdparty/flac/src/libFLAC/ogg*.c',
    // zlib
    'packages/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/amiga/**',
    'packages/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/contrib/**',
    'packages/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/doc/**',
    'packages/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/examples/**',
    'packages/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/msdos/**',
    'packages/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/old/**',
    'packages/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/os2/**',
    'packages/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/os400/**',
    'packages/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/qnx/**',
    'packages/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/test/**',
    'packages/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/watcom/**',
    // zstd
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd}/build/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd}/contrib/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd}/examples/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd}/doc/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd}/lib/deprecated/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd}/lib/dictBuilder/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd}/lib/dll/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd}/lib/legacy/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd}/programs/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd}/tests/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd}/zlibWrapper/**',
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
