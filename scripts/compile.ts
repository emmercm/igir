/// <reference types="@types/bun" />

import child_process from 'node:child_process';
import module from 'node:module';
import path from 'node:path';

import fg from 'fast-glob';
import yargs from 'yargs';

import Timer from '../src/async/timer.js';
import Logger from '../src/console/logger.js';
import { LogLevel } from '../src/console/logLevel.js';
import IgirException from '../src/exceptions/igirException.js';
import Package from '../src/globals/package.js';
import FsUtil from '../src/utils/fsUtil.js';

const logger = new Logger(LogLevel.TRACE, process.stdout);
logger.info('========== COMPILING ==========');

const argv = await yargs([])
  .strictOptions(true)
  .option('platform', { type: 'string', default: process.platform })
  .option('arch', { type: 'string', default: process.arch })
  .positional('output', {
    description: 'output file',
    type: 'string',
    default: Package.NAME,
  })
  .middleware((middlewareArgv) => {
    if (middlewareArgv.platform === 'win32' && !middlewareArgv.output.endsWith('.exe')) {
      middlewareArgv.output += '.exe';
    }
  })
  .parse(process.argv.slice(2));

const output = path.resolve(argv.output);
logger.info(`Output: '${output}'`);
if (await FsUtil.exists(output)) {
  await FsUtil.rm(output);
}

logger.info("Bundling with 'bun build --compile' ...");
const bunBuildConfig = {
  entrypoints: [
    'index.ts',
    ...(await fg(
      `node_modules/@emmercm/dolphin-tool-${argv.platform}-${argv.arch}/dist/{DolphinTool.exe,dolphin-tool,*.dylib}`,
    )),
    ...(await fg(
      `node_modules/@emmercm/chdman-${argv.platform}-${argv.arch}/dist/{chdman*,*.dylib}`,
    )),
    ...(await fg(
      `node_modules/@emmercm/maxcso-${argv.platform}-${argv.arch}/dist/{maxcso*,*.dylib}`,
    )),
  ],
  compile: {
    outfile: output,
    target:
      `bun-${argv.platform}-${argv.arch}${argv.arch === 'x64' ? '-baseline' : ''}` as Bun.Build.CompileTarget,
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
      name: 'require-rewriter',
      setup(build: Bun.PluginBuilder): void {
        const nativeRequireRe = /require\(\s*[`'"](?!.*build[/\\]Release).+?\.node[`'"],?\s*\)/g;
        const literalRequireRe = /require\(\s*[`'"]([^`'"]+)[`'"]\s*\)/g;
        // const NAME = path.dirname(require.resolve('PKG/package.json'));
        const packageRootDeclRe =
          /const\s+(\w+)\s*=\s*path\.dirname\(\s*require\.resolve\(\s*['"`]([^'"`]+)\/package\.json['"`]\s*\)\s*\)\s*;?/g;
        // require(`${NAME}/sub/path.ext`)
        const dynamicRequireRe = /require\(\s*`\$\{(\w+)\}([^`]+)`\s*\)/g;

        build.onLoad({ filter: /\.ts$/ }, async (args) => {
          let source = await Bun.file(args.path).text();
          const prependLines: string[] = [];
          const fileRequire = module.createRequire(args.path);

          // Rewrite prebuilt-addon `require('...node')` calls to a static
          // native import so Bun embeds the binary into the executable.
          const nativeMatch = nativeRequireRe.exec(source);
          nativeRequireRe.lastIndex = 0;
          if (nativeMatch) {
            const nativePath = nativeMatch[0]
              .replace(/^require\(\s*[`'"]/, '')
              .replace(/[`'"],?\s*\)$/, '')
              .replace('${os.platform()}', argv.platform)
              .replace('${os.arch()}', argv.arch);
            source = source.replaceAll(nativeRequireRe, '__nativeAddon');
            prependLines.push(
              `import __nativeAddon from ${JSON.stringify(nativePath)} with { type: "native" };`,
            );
          }

          // Resolve `const NAME = path.dirname(require.resolve('PKG/package.json'));`
          // declarations to absolute filesystem paths, so subsequent template
          // literal `require(`${NAME}/...`)` calls can be statically rewritten.
          const packageRoots = new Map<string, string>();
          for (const match of source.matchAll(packageRootDeclRe)) {
            const [, varName, pkg] = match;
            packageRoots.set(varName, path.dirname(fileRequire.resolve(`${pkg}/package.json`)));
          }

          // Helper to allocate a unique identifier per resolved specifier.
          const requireSpecifiers = new Map<string, { id: string; isJson: boolean }>();
          const allocateSpecifier = (absSpecifier: string): string => {
            let entry = requireSpecifiers.get(absSpecifier);
            if (entry === undefined) {
              entry = {
                id: `__bundledRequire_${requireSpecifiers.size}`,
                isJson: absSpecifier.endsWith('.json'),
              };
              requireSpecifiers.set(absSpecifier, entry);
            }
            return entry.id;
          };

          // Rewrite dynamic `require(`${ROOT}/subpath`)` whose ROOT was
          // declared via require.resolve('PKG/package.json').
          source = source.replaceAll(
            dynamicRequireRe,
            (match, varName: string, subpath: string) => {
              const rootPath = packageRoots.get(varName);
              if (rootPath === undefined) {
                return match;
              }
              return allocateSpecifier(path.join(rootPath, subpath));
            },
          );

          // Rewrite literal `require('...json')` calls so Bun bundles the JSON.
          source = source.replaceAll(literalRequireRe, (match, specifier: string) => {
            if (!specifier.endsWith('.json')) {
              return match;
            }
            return allocateSpecifier(specifier);
          });

          for (const [specifier, { id, isJson }] of requireSpecifiers) {
            if (isJson) {
              prependLines.push(
                `import ${id} from ${JSON.stringify(specifier)} with { type: "json" };`,
              );
            } else {
              // ESM-as-CJS via `require()` returns the module namespace; mirror
              // that shape with a namespace import so destructuring works
              // unchanged ({ default: x }, { NamedExport: y }, etc.).
              prependLines.push(`import * as ${id} from ${JSON.stringify(specifier)};`);
            }
          }

          if (prependLines.length > 0) {
            console.log(prependLines);
          }

          return {
            contents: prependLines.length > 0 ? `${prependLines.join('\n')}\n${source}` : source,
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

if (!(await FsUtil.exists(output))) {
  throw new IgirException(`output file '${output}' doesn't exist`);
}

if (argv.platform === 'darwin') {
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

logger.info(`Output: ${FsUtil.sizeReadable(await FsUtil.size(output))}`);

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
