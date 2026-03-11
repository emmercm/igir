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

logger.info("Bundling with 'bun build --compile' ...");
const result = await Bun.build({
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
  compile: { outfile: output },
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
});

if (!result.success) {
  for (const log of result.logs) {
    logger.error(`${log.level}: ${log.message}`);
  }
  throw new IgirException("'bun build --compile' failed");
}

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
