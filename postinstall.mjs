import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import util from 'node:util';

import nodeGypBuild from 'node-gyp-build';

/**
 * Unfortunately, there is a sticky situation with Node-API:
 *  - `prebuildify` can only build one target from a binding.gyp at a time
 *  - The `node-gyp-build` install script can build all targets from a binding.gyp because node-gyp
 *    can handle it, but it will only look for a single *.node prebuild file when code uses it
 *    to find prebuilds
 * So we're stuck with this `npm install` script that will run `node-gyp-build` if necessary,
 * separately for each distinct Node-API package.
 *
 * This wouldn't be a problem if we went full monorepo and published the sub-packages as scoped
 * npm packages, but that's a lot of overhead for code that is so tightly coupled together and not
 * meant for public reuse.
 */

let modulesParentDir = path.dirname(url.fileURLToPath(import.meta.url));
while (!fs.existsSync(path.join(modulesParentDir, 'node_modules'))) {
  const nextParentDir = path.dirname(modulesParentDir);
  if (nextParentDir === modulesParentDir) {
    throw new Error('failed to find node_modules directory');
  }
  modulesParentDir = nextParentDir;
}

for (let napiPackage of [
  path.join('packages', 'zlib-1.1.3'),
  path.join('packages', 'zstd-1.5.5'),
]) {
  try {
    await util.promisify(fs.stat)('dist');
    napiPackage = path.join('dist', napiPackage);
  } catch {
    /* ignored */
  }

  // Do nothing if `node-gyp-build` can find a prebuild or a full build
  const addonDirectory = path.join(napiPackage, `addon-${path.basename(napiPackage)}`);
  try {
    nodeGypBuild(addonDirectory);
    continue;
  } catch {
    /* ignored */
  }

  process.stdout.write(`${napiPackage}: building from source ...\n\n`);

  // Run a build if no prebuild was found
  await new Promise((resolve, reject) => {
    const nodeGypBuild = path.join(modulesParentDir, 'node_modules', '.bin', 'node-gyp-build');
    const proc =
      process.platform === 'win32'
        ? child_process.spawn('cmd.exe', ['/c', `${nodeGypBuild}.cmd`], {
            cwd: napiPackage,
            windowsHide: true,
          })
        : child_process.spawn(nodeGypBuild, [], { cwd: napiPackage });

    proc.stdout.on('data', (data) =>
      process.stdout.write(
        data
          .toString()
          .split('\n')
          .map((line) => `${napiPackage}: ${line}`)
          .join('\n'),
      ),
    );
    proc.stderr.on('data', (data) =>
      process.stderr.write(
        data
          .toString()
          .split('\n')
          .map((line) => `${napiPackage}: ${line}`)
          .join('\n'),
      ),
    );
    proc.on('close', resolve);
    proc.on('error', reject);
  });

  // Relocate the build output to the addon directory
  try {
    await util.promisify(fs.stat)(addonDirectory);
  } catch {
    await util.promisify(fs.mkdir)(addonDirectory);
  }
  await util.promisify(fs.rename)(
    path.join(napiPackage, 'build'),
    path.join(addonDirectory, 'build'),
  );
}

/**
 * zstd-napi uses https://www.npmjs.com/package/prebuild-install to download prebuilds from
 * https://github.com/drakedevel/zstd-napi/releases, but Homebrew has some network sandboxing
 * behavior that will prevent downloading them. Ensure the bindings are still built.
 */

const zstdNapi = path.join(modulesParentDir, 'node_modules', 'zstd-napi');
const zstdNapiBinding = path.join(zstdNapi, 'build', 'Release', 'binding.node');
if (fs.existsSync(zstdNapi) && !fs.existsSync(zstdNapiBinding)) {
  process.stdout.write(`${path.basename(zstdNapi)}: building from source ...\n\n`);

  await new Promise((resolve, reject) => {
    const proc = child_process.spawn(
      `npm${process.platform === 'win32' ? '.exe' : ''}`,
      ['run', 'build'],
      {
        cwd: zstdNapi,
        windowsHide: true,
      },
    );

    proc.stdout.on('data', (data) =>
      process.stdout.write(
        data
          .toString()
          .split('\n')
          .map((line) => `${path.basename(zstdNapi)}: ${line}`)
          .join('\n'),
      ),
    );
    proc.stderr.on('data', (data) =>
      process.stderr.write(
        data
          .toString()
          .split('\n')
          .map((line) => `${path.basename(zstdNapi)}: ${line}`)
          .join('\n'),
      ),
    );
    proc.on('close', resolve);
    proc.on('error', reject);
  });
}
