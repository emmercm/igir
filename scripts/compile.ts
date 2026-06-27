/// <reference types="@types/bun" />

import child_process from 'node:child_process';
import fs from 'node:fs';
import module from 'node:module';
import path from 'node:path';

import fg from 'fast-glob';
import yargs from 'yargs';

import Timer from '../src/async/timer.js';
import { logger } from '../src/console/logger.js';
import IgirException from '../src/exceptions/igirException.js';
import Package from '../src/globals/package.js';
import Temp from '../src/globals/temp.js';
import FsUtil from '../src/utils/fsUtil.js';

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
      icon: path.join(import.meta.dirname, '..', 'static', 'windows.ico'),
      title: Package.NAME,
      publisher: Package.AUTHOR,
      version: Package.VERSION,
      description: Package.DESCRIPTION.replaceAll(/[^\u{0}-\u{7F}]/gu, '').trim(),
      copyright: Package.HOMEPAGE,
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
        build.onLoad({ filter: /\.ts$/ }, async (args) => {
          let source = await Bun.file(args.path).text();

          // Dedupe imports by their resolved specifier so multiple `require()`
          // calls to the same file share a single bundled import. Each entry
          // remembers the syntactic kind so the emission step below knows
          // whether to add a `with { type: ... }` attribute and whether to use
          // `import * as` (for ESM) or a default import (for native/JSON).
          type ImportKind = 'native' | 'json' | 'esm';
          const imports = new Map<string, { id: string; kind: ImportKind }>();
          const allocate = (specifier: string, kind: ImportKind): string => {
            let entry = imports.get(specifier);
            if (entry === undefined) {
              entry = { id: `__bundledRequire_${imports.size}`, kind };
              imports.set(specifier, entry);
            }
            return entry.id;
          };

          // Rewrite prebuilt-addon `require('...node')` calls into static
          // imports so Bun embeds the binary into the executable. The negative
          // lookahead skips `build/Release/...` paths, which are the local
          // fallback that node-gyp builds emit and shouldn't be bundled.
          source = source.replaceAll(
            /require\(\s*[`'"]((?!.*build[/\\]Release).+?\.node)[`'"],?\s*\)/g,
            (_match, spec: string) => {
              const resolved = spec
                .replace('${os.platform()}', argv.platform)
                .replace('${os.arch()}', argv.arch);
              return allocate(resolved, 'native');
            },
          );

          // Detect `const NAME = path.dirname(require.resolve('PKG/package.json'))`
          // declarations, resolve each PKG to its on-disk root directory, and
          // strip the declaration from the source. Source files use this pattern
          // when they need to reach internal files that the package's `exports`
          // map doesn't expose; the next pass uses these roots to statically
          // rewrite `require(`${NAME}/...`)` calls into bundled imports, so the
          // declaration has no runtime purpose once those calls are rewritten.
          // It MUST be removed: a surviving `require.resolve('PKG/package.json')`
          // throws `Cannot find module` whenever the compiled binary runs from a
          // directory tree that doesn't contain the package on disk (see #2282).
          const fileRequire = module.createRequire(args.path);
          const packageRoots = new Map<string, string>();
          source = source.replaceAll(
            /const\s+(\w+)\s*=\s*path\.dirname\(\s*require\.resolve\(\s*['"`]([^'"`]+)\/package\.json['"`]\s*\)\s*\)\s*;?/g,
            (_match, varName: string, pkg: string) => {
              packageRoots.set(varName, path.dirname(fileRequire.resolve(`${pkg}/package.json`)));
              return '';
            },
          );

          // Rewrite ``require(`${ROOT}/subpath`)`` template literals whose
          // ROOT was discovered above. Other dynamic requires (unknown var,
          // arbitrary expressions) are left untouched and will fail to bundle
          // — that's intentional, since we can't safely resolve them.
          source = source.replaceAll(
            /require\(\s*`\$\{(\w+)\}([^`]+)`\s*\)/g,
            (match, varName: string, subpath: string) => {
              const rootPath = packageRoots.get(varName);
              if (rootPath === undefined) {
                return match;
              }
              const specifier = path.join(rootPath, subpath);
              return allocate(specifier, specifier.endsWith('.json') ? 'json' : 'esm');
            },
          );

          // Rewrite plain `require('...json')` literals into static JSON
          // imports so Bun inlines the JSON contents instead of leaving a
          // runtime `require` that would need the file on disk.
          source = source.replaceAll(
            /require\(\s*[`'"]([^`'"]+\.json)[`'"]\s*\)/g,
            (_match, specifier: string) => allocate(specifier, 'json'),
          );

          // Nothing rewritten: hand the source back unchanged so other plugins
          // (and Bun's default loader) see the file as it was on disk.
          if (imports.size === 0) {
            return { contents: source, loader: 'ts' };
          }

          // Emit the collected imports. ESM modules required via Node's
          // `require()` yield the module namespace, so we mirror that with
          // `import * as` to keep destructuring shapes (`{ default: x }`,
          // `{ NamedExport: y }`) working unchanged in the rewritten source.
          // Native/JSON imports use default-import syntax with the
          // corresponding `with { type: ... }` import attribute.
          const attribute: Record<ImportKind, string> = {
            native: ' with { type: "native" }',
            json: ' with { type: "json" }',
            esm: '',
          };
          const importLines = [...imports].map(([specifier, { id, kind }]) =>
            kind === 'esm'
              ? `import * as ${id} from ${JSON.stringify(specifier)};`
              : `import ${id} from ${JSON.stringify(specifier)}${attribute[kind]};`,
          );
          return { contents: `${importLines.join('\n')}\n${source}`, loader: 'ts' };
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

// Run from an isolated directory that contains no source files
const testDirectory = await FsUtil.mkdtemp(path.join(Temp.getTempDir(), 'compile'));
try {
  const testFile = path.join(testDirectory, path.basename(output));
  logger.info(`Copying: '${output}' -> '${testFile}' ...`);
  await FsUtil.copyFile(output, testFile);
  await fs.promises.chmod(testFile, 0o755); // chmod +x

  logger.info(`Testing: '${testFile}' ...`);
  const procOutput = await new Promise<string>((resolve, reject) => {
    const proc = child_process.spawn(testFile, ['--help'], {
      cwd: path.dirname(testFile),
      windowsHide: true,
    });
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
        reject(new Error(`${testFile} exited with code ${code}, output:\n${procOutput}`));
      }
    });
    proc.on('error', reject);
  });
  logger.trace(procOutput);
} finally {
  await FsUtil.rm(testDirectory, { recursive: true, force: true });
}

Timer.cancelAll();
logger.info('Finished!');
