import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

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
const nodeGypBuild = path.join(import.meta.dirname, 'node_modules', '.bin', 'node-gyp-build');
await Promise.all(
  [path.join('packages', 'zlib-1.1.3'), path.join('packages', 'zstd-1.5.5')].map(
    async (napiPackage) => {
      try {
        await util.promisify(fs.stat)('dist');
        napiPackage = path.join('dist', napiPackage);
      } catch {
        /* ignored */
      }
      await new Promise((resolve, reject) => {
        const proc = child_process.spawn(
          nodeGypBuild + (process.platform === 'win32' ? '.cmd' : ''),
          [],
          {
            cwd: napiPackage,
            windowsHide: true,
          },
        );
        proc.stdout.on('data', (data) =>
          process.stdout.write(
            data
              .toString()
              .split('\n')
              .map((line) => napiPackage + ': ' + line)
              .join('\n'),
          ),
        );
        proc.stderr.on('data', (data) =>
          process.stderr.write(
            data
              .toString()
              .split('\n')
              .map((line) => napiPackage + ': ' + line)
              .join('\n'),
          ),
        );
        proc.on('close', resolve);
        proc.on('error', reject);
      });
    },
  ),
);
