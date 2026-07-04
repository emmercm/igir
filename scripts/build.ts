import child_process from 'node:child_process';
import path from 'node:path';

import type { BuildOptions } from 'esbuild';
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
const buildOptions: BuildOptions = {
  entryPoints: await fg('{,**/}!(*.test).ts', {
    ignore: [
      '.*/**',
      'node_modules/**',
      'packages/*/deps/**',
      'scripts/**',
      'test/**',
      '*.config.*',
    ],
  }),
  outdir: path.join(output),
  platform: 'node',
  bundle: false,
  sourcemap: true,
  packages: 'external',
  format: 'esm',
};
logger.info(JSON.stringify(buildOptions, undefined, 2));
await esbuild.build(buildOptions);

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
    'packages/*/addon-*/**', // prebuilds
    'packages/*/{,!(deps)/**/}*.cpp', // non-vendored .cpp files
    'packages/*/binding.gyp',
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
    'packages/dolphin-tool/deps/dolphin/Externals/bzip2/**/*',
    'packages/dolphin-tool/deps/dolphin/Externals/fmt/**/*',
    'packages/dolphin-tool/deps/dolphin/Externals/liblzma/**/*',
    'packages/dolphin-tool/deps/dolphin/Externals/mbedtls/**/*',
    'packages/dolphin-tool/deps/dolphin/Externals/zlib-ng/**/*',
    'packages/dolphin-tool/deps/dolphin/Externals/zstd/**/*',
    'packages/dolphin-tool/deps/dolphin/Source/Core/DiscIO/**/*',
    'packages/dolphin-tool/deps/dolphin/Source/Core/Common/**/*',
    'packages/dolphin-tool/deps/dolphin/LICENSES/**',
    'packages/dolphin-tool/deps/dolphin/{COPYING,LICENSE}*',
    'packages/zlib*/deps/**',
    'packages/zstd*/deps/**',
    'src/**/!(*.schema).json',
  ],
  [
    'packages/*/deps/**/(AUTHORS|BUILDING|CHANGELOG|CHANGES|CODE_OF_CONDUCT|CONTRIBUTING|FAQ|GOVERNANCE|HISTORY|INDEX|PORTING|README|RELEASE|RELEASE-NOTES|SECURITY|TESTING|TROUBLESHOOTING){,*.md,*.markdown,*.txt,*.zlib}',
    'packages/*/deps/**/*.{pdf,txt}',
    'packages/*/deps/**/*.{css,js,html,xml,xsl}',
    'packages/*/deps/**/*.{ico,jpg,svg}',
    'packages/*/deps/**/*.{com,bat,sh}',
    'packages/*/deps/**/*.empty',
    'packages/*/deps/**/appveyor.yml',
    'packages/*/deps/**/BUCK', // Buck
    'packages/*/deps/**/*.modulemap', // Clang
    'packages/*/deps/**/{CMakeLists.txt,*.cmake,*.cmakein,*.cmake.in}', // CMake
    'packages/*/deps/**/{configure,configure.ac,configure.in,Makefile.am,Makefile.in,*.h.in,*.m4}', // configure/autoconf
    'packages/*/deps/**/*.gradle', // Gradle
    'packages/*/deps/**/*.{js,ts}', // JavaScript
    'packages/*/deps/**/{Makefile*,*.mak,*.mk}', // Make
    'packages/*/deps/**/*.1{,.*}', // man page
    'packages/*/deps/**/mkdocs*', // mkdocs
    'packages/*/deps/**/{make_vms.com,*.mms}', // OpenVMS
    'packages/*/deps/**/*.pc.in', // pkg-config
    'packages/*/deps/**/*.py', // Python
    'packages/*/deps/**/Vagrantfile', // Vagrant
    'packages/*/deps/**/{*.dsp,*.dsw,*.rc,*.sln,*.vcxproj*,exports.props}', // Visual Studio
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
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/build/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/contrib/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/examples/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/doc/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/lib/deprecated/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/lib/dictBuilder/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/lib/dll/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/lib/legacy/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/programs/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/tests/**',
    'packages/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/zlibWrapper/**',
    // zlib-ng (dolphin)
    'packages/dolphin-tool/deps/dolphin/Externals/zlib-ng/zlib-ng/arch/**',
    'packages/dolphin-tool/deps/dolphin/Externals/zlib-ng/zlib-ng/cmake/**',
    'packages/dolphin-tool/deps/dolphin/Externals/zlib-ng/zlib-ng/doc/**',
    'packages/dolphin-tool/deps/dolphin/Externals/zlib-ng/zlib-ng/test/**',
    'packages/dolphin-tool/deps/dolphin/Externals/zlib-ng/zlib-ng/tools/**',
    'packages/dolphin-tool/deps/dolphin/Externals/zlib-ng/zlib-ng/win32/**',
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
