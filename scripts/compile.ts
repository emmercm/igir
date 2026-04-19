/// <reference types="@types/bun" />

import child_process from 'node:child_process';
import path from 'node:path';

import fg from 'fast-glob';
import yargs from 'yargs';

import Timer from '../src/async/timer.js';
import Logger from '../src/console/logger.js';
import { LogLevel } from '../src/console/logLevel.js';
import Package from '../src/globals/package.js';
import FsPoly from '../src/polyfill/fsPoly.js';
import IgirException from '../src/types/exceptions/igirException.js';

const logger = new Logger(LogLevel.TRACE, process.stdout);
logger.info('========== COMPILING ==========');

const argv = await yargs(process.argv.slice(2))
  .locale('en')
  .usage('Usage: $0 [output]')
  .positional('output', {
    description: 'output file',
    type: 'string',
    default: Package.NAME + (process.platform === 'win32' ? '.exe' : ''),
  }).argv;

const output = path.resolve(argv.output);
logger.info(`Output: '${output}'`);
if (await FsPoly.exists(output)) {
  await FsPoly.rm(output);
}

logger.info("Bundling with 'bun build --compile' ...");
const bunBuildConfig = {
  entrypoints: [
    'index.ts',
    ...(await fg(
      `node_modules/@emmercm/dolphin-tool-${process.platform}-${process.arch}/dist/{DolphinTool.exe,dolphin-tool,*.dylib}`,
    )),
    ...(await fg(
      `node_modules/@emmercm/chdman-${process.platform}-${process.arch}/dist/{chdman*,*.dylib}`,
    )),
    ...(await fg(
      `node_modules/@emmercm/maxcso-${process.platform}-${process.arch}/dist/{maxcso*,*.dylib}`,
    )),
  ],
  compile: {
    outfile: output,
    target: `bun-${process.platform}-${process.arch}` as Bun.Build.CompileTarget,
    autoloadDotenv: false,
    autoloadBunfig: false,
    windows: {
      title: Package.NAME,
      publisher: Package.AUTHOR,
      version: Package.VERSION,
      description: Package.HOMEPAGE,
    },
  },
  // TODO(cemmer): minification seems to break at least Windows, causing chdman to fail `await import` with:
  //  "ReferenceError: awaitPromise is not defined"
  // minify: true,
  // sourcemap: 'inline',
  plugins: [
    {
      name: 'native-addon-loader',
      setup(build: Bun.PluginBuilder): void {
        build.onLoad({ filter: /\.ts$/ }, async (args) => {
          const source = await Bun.file(args.path).text();

          // Find a require() call to a prebuilt .node file (excluding build/Release fallbacks)
          const requireMatch = /require\(\s*[`'"](?!.*build[/\\]Release).+?\.node[`'"],?\s*\)/.exec(
            source,
          );
          if (!requireMatch) {
            return { contents: source, loader: 'ts' };
          }

          const nativePath = requireMatch[0]
            .replace(/^require\(\s*[`'"]/, '')
            .replace(/[`'"],?\s*\)$/, '')
            .replace('${os.platform()}', process.platform)
            .replace('${os.arch()}', process.arch);

          // Replace prebuilt require() calls with the static native import
          const transformed = source.replaceAll(
            /require\(\s*[`'"](?!.*build[/\\]Release).+?\.node[`'"],?\s*\)/g,
            '__nativeAddon',
          );

          return {
            contents: `import __nativeAddon from ${JSON.stringify(nativePath)} with { type: "native" };\n${transformed}`,
            loader: 'ts',
          };
        });
      },
    },
  ],
} satisfies Bun.BuildConfig;
logger.info(JSON.stringify(bunBuildConfig, undefined, 2));
const result = await Bun.build(bunBuildConfig);

if (!result.success) {
  for (const log of result.logs) {
    logger.error(`${log.level}: ${log.message}`);
  }
  throw new IgirException("'bun build --compile' failed");
}

if (!(await FsPoly.exists(output))) {
  throw new IgirException(`output file '${output}' doesn't exist`);
}

if (process.platform === 'darwin') {
  // Remove the signature
  logger.info('Removing macOS signature ...');
  await new Promise<void>((resolve, reject) => {
    child_process
      .spawn('codesign', ['--remove-signature', output])
      .on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`exited with code ${code}`));
        }
      })
      .on('error', reject);
  });

  // Add an ad-hoc signature
  logger.info('Adding ad-hoc macOS signature ...');
  await new Promise<void>((resolve, reject) => {
    child_process
      .spawn('codesign', ['--force', '--sign', '-', output])
      .on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`exited with code ${code}`));
        }
      })
      .on('error', reject);
  });
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
  proc.on('close', (code) => {
    if (code === 0) {
      resolve(procOutput);
    } else {
      reject(new Error(`${output} exited with code ${code}`));
    }
  });
  proc.on('error', reject);
});
logger.trace(procOutput);

Timer.cancelAll();
logger.info('Finished!');
