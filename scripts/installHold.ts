/**
 * This script outputs dependencies that are being held back because their `engines.node` require a
 * newer version of Node.js.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import util from 'node:util';

import semver from 'semver';

interface PackageJson {
  version: string;
  versions?: string[];
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  (await util.promisify(fs.readFile)(path.join(__dirname, '..', 'package.json'))).toString(),
) as PackageJson;
const enginesNode = packageJson.engines?.node;
if (!enginesNode) {
  throw new Error('No engines.node defined in package.json');
}

const dependencyTypes = new Set([
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]);

const heldBackDependencies = Object.entries(packageJson)
  .filter(([dependencyType]) => dependencyTypes.has(dependencyType))
  .map(([dependencyType, dependencies]) => {
    const heldBackDependencies = Object.entries(dependencies as Record<string, string>)
      .map(([depPackageName, depPackageVersion]): [string, Record<string, unknown>] | undefined => {
        const depPackageNameVersion = `${depPackageName}@${depPackageVersion}`;

        process.stderr.write(`${dependencyType}: ${depPackageNameVersion} ... `);
        const depPackageJsonLatest = JSON.parse(
          spawnSync('npm', ['view', '--json', `${depPackageName}@latest`], {
            windowsHide: true,
          }).stdout.toString(),
        ) as PackageJson;

        const depPackageNewerVersions = semver
          .sort(depPackageJsonLatest.versions ?? [])
          .filter(
            (remoteVersion) =>
              semver.gt(remoteVersion, depPackageVersion) &&
              semver.parse(remoteVersion)?.prerelease.length === 0,
          );
        if (depPackageNewerVersions.length === 0) {
          process.stderr.write('✅\n');
          return undefined;
        }
        process.stderr.write('⬆️\n');

        const depPackageHeldVersions = depPackageNewerVersions
          .map((remoteVersion): [string, string] | undefined => {
            process.stderr.write(`  ${depPackageName}@${remoteVersion} ... `);
            const depPackageJson = JSON.parse(
              spawnSync('npm', ['view', '--json', `${depPackageName}@${remoteVersion}`], {
                windowsHide: true,
              }).stdout.toString(),
            ) as PackageJson;

            if (!depPackageJson.engines?.node) {
              process.stderr.write('❓\n');
              return undefined;
            }

            process.stderr.write(`${depPackageJson.engines.node} `);

            if (semver.subset(enginesNode, depPackageJson.engines.node)) {
              process.stderr.write('✅\n');
              return undefined;
            }

            process.stderr.write('✋\n');
            return [remoteVersion, depPackageJson.engines.node];
          })
          .filter((value) => value !== undefined);
        if (depPackageHeldVersions.length === 0) {
          return undefined;
        }

        return [depPackageNameVersion, Object.fromEntries(depPackageHeldVersions)];
      })
      .filter((value) => value !== undefined);
    return [dependencyType, Object.fromEntries(heldBackDependencies)] satisfies [
      string,
      Record<string, unknown>,
    ];
  });

process.stdout.write(`${JSON.stringify(Object.fromEntries(heldBackDependencies), undefined, 2)}\n`);
