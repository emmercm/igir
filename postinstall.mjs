import child_process from 'node:child_process';
import path from 'node:path';

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
await Promise.all(
  [path.join('packages', 'zlib-1.1.3'), path.join('packages', 'zstd-1.5.5')].map(
    (napiPackage) =>
      new Promise((resolve, reject) => {
        const nodeGypBuild = child_process.spawn(
          path.join(
            import.meta.dirname,
            'node_modules',
            '.bin',
            'node-gyp-build' + (process.platform === 'win32' ? '.exe' : ''),
          ),
          [],
          {
            windowsHide: true,
            cwd: napiPackage,
          },
        );
        nodeGypBuild.stderr.on('data', (data) => process.stderr.write(data));
        nodeGypBuild.on('close', resolve);
        nodeGypBuild.on('error', reject);
      }),
  ),
);
