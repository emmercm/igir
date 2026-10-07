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
    'addons/*/addon-*/**', // prebuilds and WebAssembly builds
    'src/**/!(*.schema).json',
  ],
  [],
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
