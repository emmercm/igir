import child_process from 'node:child_process';
import fs from 'node:fs';
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
    ignore: ['.*/**', 'addons/*/deps/**', 'node_modules/**', 'scripts/**', 'test/**', '*.config.*'],
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

  // Exclude executables
  const executableFiles = new Set(
    (
      await Promise.all(
        inputFiles
          .filter((inputFile) => !inputFile.endsWith('.node'))
          .map(async (inputFile) => {
            const handle = await fs.promises.open(inputFile, 'r');
            try {
              const { bytesRead, buffer } = await handle.read(Buffer.alloc(4), 0, 4, 0);
              const magic = bytesRead >= 4 ? buffer.readUInt32BE(0) : 0;
              const isExecutable =
                magic === 0x7f_45_4c_46 || // ELF
                magic === 0xfe_ed_fa_ce || // Mach-O 32-bit
                magic === 0xfe_ed_fa_cf || // Mach-O 64-bit
                magic === 0xce_fa_ed_fe || // Mach-O 32-bit, byte-swapped
                magic === 0xcf_fa_ed_fe || // Mach-O 64-bit, byte-swapped
                magic === 0xca_fe_ba_be || // Mach-O universal
                magic === 0xca_fe_ba_bf || // Mach-O universal, 64-bit
                (buffer[0] === 0x4d && buffer[1] === 0x5a) || // PE / DOS "MZ"
                (buffer[0] === 0x23 && buffer[1] === 0x21); // script shebang "#!"
              return isExecutable ? inputFile : undefined;
            } finally {
              await handle.close();
            }
          }),
      )
    ).filter((inputFile) => inputFile !== undefined),
  );

  await Promise.all(
    inputFiles
      .filter((inputFile) => !executableFiles.has(inputFile))
      .map(async (inputFile) => {
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
    'addons/*/addon-*/**', // prebuilds
    'addons/*/{,!(deps)/**/}*.{c,cpp,h}', // non-vendored C/C++ files
    'addons/*/binding.gyp',
    'addons/7zip/deps/7-Zip-zstd/C/*',
    'addons/7zip/deps/7-Zip-zstd/C/{zstd,hashes,brotli,lz4,lz5,lizard,zstdmt}/**/*',
    'addons/7zip/deps/7-Zip-zstd/CPP/Common/*',
    'addons/7zip/deps/7-Zip-zstd/CPP/Windows/*',
    'addons/7zip/deps/7-Zip-zstd/CPP/7zip/*',
    'addons/7zip/deps/7-Zip-zstd/CPP/7zip/Archive/*',
    'addons/7zip/deps/7-Zip-zstd/CPP/7zip/Archive/7z/*',
    'addons/7zip/deps/7-Zip-zstd/CPP/7zip/Archive/Common/*',
    'addons/7zip/deps/7-Zip-zstd/CPP/7zip/Archive/Zip/*',
    'addons/7zip/deps/7-Zip-zstd/CPP/7zip/Common/*',
    'addons/7zip/deps/7-Zip-zstd/CPP/7zip/Compress/*',
    'addons/7zip/deps/7-Zip-zstd/CPP/7zip/Crypto/*',
    'addons/7zip/deps/7-Zip-zstd/COPYING',
    'addons/7zip/deps/7-Zip-zstd/DOC/{License,copying,lzma,unRarLicense}*',
    'addons/chdman/deps/mame/3rdparty/flac/include/FLAC/**/*',
    'addons/chdman/deps/mame/3rdparty/flac/include/share/**/*',
    'addons/chdman/deps/mame/3rdparty/flac/src/libFLAC/**/*',
    'addons/chdman/deps/mame/3rdparty/flac/**/{COPYING,LICENSE}*',
    'addons/chdman/deps/mame/3rdparty/lzma/C/{7zTypes,7zWindows,Alloc,Compiler,CpuArch,LzFind,LzHash,LzmaDec,LzmaEnc,Precomp}.{c,h}',
    'addons/chdman/deps/mame/3rdparty/lzma/**/{COPYING,LICENSE}*',
    'addons/chdman/deps/mame/3rdparty/utf8proc/utf8proc.h',
    'addons/chdman/deps/mame/3rdparty/utf8proc/**/{COPYING,LICENSE}*',
    'addons/chdman/deps/mame/3rdparty/zlib/**/*',
    'addons/chdman/deps/mame/3rdparty/zlib/**/{COPYING,LICENSE}*',
    'addons/chdman/deps/mame/3rdparty/zstd/lib/**/*',
    'addons/chdman/deps/mame/3rdparty/zstd/**/{COPYING,LICENSE}*',
    'addons/chdman/deps/mame/src/emu/emucore.h',
    'addons/chdman/deps/mame/src/emu/emufwd.h',
    'addons/chdman/deps/mame/src/lib/util/**/*',
    'addons/chdman/deps/mame/src/osd/*',
    'addons/chdman/deps/mame/src/osd/modules/*',
    'addons/chdman/deps/mame/src/osd/modules/file/**/*',
    'addons/chdman/deps/mame/src/osd/modules/lib/**/*',
    'addons/chdman/deps/mame/src/osd/windows/**/*',
    'addons/chdman/deps/mame/{COPYING,LICENSE}*',
    'addons/dolphin-tool/deps/dolphin/Externals/bzip2/**/*',
    'addons/dolphin-tool/deps/dolphin/Externals/fmt/**/*',
    'addons/dolphin-tool/deps/dolphin/Externals/liblzma/**/*',
    'addons/dolphin-tool/deps/dolphin/Externals/mbedtls/**/*',
    'addons/dolphin-tool/deps/dolphin/Externals/zlib-ng/**/*',
    'addons/dolphin-tool/deps/dolphin/Externals/zstd/**/*',
    'addons/dolphin-tool/deps/dolphin/Source/Core/DiscIO/**/*',
    'addons/dolphin-tool/deps/dolphin/Source/Core/Common/**/*',
    'addons/dolphin-tool/deps/dolphin/Source/Core/Core/CoreTiming.h',
    'addons/dolphin-tool/deps/dolphin/Source/Core/Core/CPUThreadConfigCallback.h',
    'addons/dolphin-tool/deps/dolphin/Source/Core/Core/HW/SystemTimers.h',
    'addons/dolphin-tool/deps/dolphin/Source/Core/Core/IOS/Device.h',
    'addons/dolphin-tool/deps/dolphin/Source/Core/Core/IOS/IOS.h',
    'addons/dolphin-tool/deps/dolphin/Source/Core/Core/IOS/IOSC.h',
    'addons/dolphin-tool/deps/dolphin/Source/Core/Core/IOS/ES/Formats.h',
    'addons/dolphin-tool/deps/dolphin/LICENSES/**',
    'addons/dolphin-tool/deps/dolphin/{COPYING,LICENSE}*',
    'addons/maxcso/deps/maxcso/src/{cso,dax}.h',
    'addons/maxcso/deps/maxcso/lz4/lib/lz4.{c,h}',
    'addons/maxcso/deps/maxcso/libdeflate/{libdeflate.h,COPYING}',
    'addons/maxcso/deps/maxcso/libdeflate/common/**',
    'addons/maxcso/deps/maxcso/libdeflate/lib/**',
    'addons/maxcso/deps/maxcso/zlib/{adler32.c,zconf.h,zlib.h,zutil.h}',
    'addons/maxcso/deps/maxcso/{LICENSE.md,lz4/LICENSE,lz4/lib/LICENSE}',
    'addons/zlib*/deps/**',
    'addons/zstd*/deps/**',
    'src/**/!(*.schema).json',
  ],
  [
    'addons/*/deps/**/(AUTHORS|BUILDING|CHANGELOG|CHANGES|CODE_OF_CONDUCT|CONTRIBUTING|FAQ|GOVERNANCE|HISTORY|INDEX|PORTING|README|RELEASE|RELEASE-NOTES|SECURITY|TESTING|TROUBLESHOOTING){,*.md,*.markdown,*.txt,*.zlib}',
    'addons/*/deps/**/*.pdf',
    'addons/*/deps/**/*.{css,js,html,xml,xsl}',
    'addons/*/deps/**/*.{ico,jpeg,jpg,png,svg}',
    'addons/*/deps/**/*.{com,bat,pl,py,sh}',
    'addons/*/deps/**/*.empty',
    'addons/*/deps/**/appveyor.yml',
    'addons/*/deps/**/BUCK', // Buck
    'addons/*/deps/**/*.map', // C++ debug
    'addons/*/deps/**/*.modulemap', // Clang
    'addons/*/deps/**/{CMakeLists.txt,*.cmake,*.cmakein,*.cmake.in}', // CMake
    'addons/*/deps/**/{configure,configure.ac,configure.in,Makefile.am,Makefile.in,*.h.in,*.m4}', // configure/autoconf
    'addons/*/deps/**/*.gradle', // Gradle
    'addons/*/deps/**/*.{js,ts}', // JavaScript
    'addons/*/deps/**/{Makefile*,*.mak,*.mk}', // Make
    'addons/*/deps/**/*.1{,.*}', // man page
    'addons/*/deps/**/mkdocs*', // mkdocs
    'addons/*/deps/**/{make_vms.com,*.mms}', // OpenVMS
    'addons/*/deps/**/*.pc.in', // pkg-config
    'addons/*/deps/**/*.py', // Python
    'addons/*/deps/**/Vagrantfile', // Vagrant
    'addons/*/deps/**/{*.def,*.dnt,*.dsp,*.dsw,*.rc,*.sln,*.vcxproj*,exports.props}', // Visual Studio
    'addons/*/deps/**/Package.swift',
    // chdman
    'addons/chdman/deps/mame/3rdparty/flac/src/libFLAC/*intrin*.c',
    'addons/chdman/deps/mame/3rdparty/flac/src/libFLAC/metadata*.c',
    'addons/chdman/deps/mame/3rdparty/flac/src/libFLAC/ogg*.c',
    'addons/chdman/deps/mame/3rdparty/flac/include/share/grabbag/**',
    // dolphin-tool
    'addons/dolphin-tool/deps/dolphin/Externals/bzip2/bzip2/!(blocksort|bzlib|compress|crctable|decompress|huffman|randtable).c', // only these 7 .c compile
    'addons/dolphin-tool/deps/dolphin/Externals/bzip2/bzip2/{sample*,words*}',
    'addons/dolphin-tool/deps/dolphin/Externals/fmt/fmt/{doc,src,support,test}/**',
    'addons/dolphin-tool/deps/dolphin/Externals/mbedtls/library/!(aes|sha1|platform|platform_util|error).c',
    'addons/dolphin-tool/deps/dolphin/Externals/mbedtls/3rdparty/**',
    'addons/dolphin-tool/deps/dolphin/Externals/mbedtls/include/psa/**',
    'addons/dolphin-tool/deps/dolphin/Externals/mbedtls/scripts/**',
    'addons/dolphin-tool/deps/dolphin/Source/Core/Common/{GL,Assembler,Debug}/**',
    // zlib
    'addons/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/amiga/**',
    'addons/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/contrib/**',
    'addons/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/doc/**',
    'addons/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/examples/**',
    'addons/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/msdos/**',
    'addons/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/nt/**',
    'addons/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/old/**',
    'addons/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/os2/**',
    'addons/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/os400/**',
    'addons/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/qnx/**',
    'addons/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/test/**',
    'addons/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/watcom/**',
    'addons/{zlib*/deps/zlib,chdman/deps/mame/3rdparty/zlib}/win32/**',
    // zstd
    'addons/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/build/**',
    'addons/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/contrib/**',
    'addons/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/examples/**',
    'addons/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/doc/**',
    'addons/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/lib/deprecated/**',
    'addons/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/lib/dictBuilder/**',
    'addons/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/lib/dll/**',
    'addons/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/lib/legacy/**',
    'addons/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/programs/**',
    'addons/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/tests/**',
    'addons/{zstd*/deps/zstd,chdman/deps/mame/3rdparty/zstd,dolphin-tool/deps/dolphin/Externals/zstd/zstd}/zlibWrapper/**',
    'addons/zstd*/deps/zstd/lib/decompress/**',
    // zlib-ng (dolphin)
    'addons/dolphin-tool/deps/dolphin/Externals/zlib-ng/zlib-ng/arch/**',
    'addons/dolphin-tool/deps/dolphin/Externals/zlib-ng/zlib-ng/cmake/**',
    'addons/dolphin-tool/deps/dolphin/Externals/zlib-ng/zlib-ng/doc/**',
    'addons/dolphin-tool/deps/dolphin/Externals/zlib-ng/zlib-ng/test/**',
    'addons/dolphin-tool/deps/dolphin/Externals/zlib-ng/zlib-ng/tools/**',
    'addons/dolphin-tool/deps/dolphin/Externals/zlib-ng/zlib-ng/win32/**',
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
