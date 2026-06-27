/**
 * This script outputs deprecated dependencies: those that are deprecated or have not published
 * a new version in over two years.
 */

import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

interface PackageJson {
  dependencies?: Record<string, string>;
  deprecated?: string;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  time: Record<string, string>;
  version: string;
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  (await fs.promises.readFile(path.join(__dirname, '..', 'package.json'))).toString(),
) as PackageJson;

const dependencyTypes = new Set([
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]);

/**
 * Formats the age of a date as a human-readable string relative to now.
 */
function formatAge(date: Date): string {
  const totalDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (totalDays >= 365) {
    const years = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);
    const parts = [`${years} year${years === 1 ? '' : 's'}`];
    if (months > 0) {
      parts.push(`${months} month${months === 1 ? '' : 's'}`);
    }
    return `${parts.join(' ')} ago`;
  }
  if (totalDays >= 30) {
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    const parts = [`${months} month${months === 1 ? '' : 's'}`];
    if (days > 0) {
      parts.push(`${days} day${days === 1 ? '' : 's'}`);
    }
    return `${parts.join(' ')} ago`;
  }
  return `${totalDays} day${totalDays === 1 ? '' : 's'} ago`;
}

const flaggedDependencies = Object.entries(packageJson)
  .filter(([dependencyType]) => dependencyTypes.has(dependencyType))
  .map(([dependencyType, dependencies]) => {
    const flagged = Object.keys(dependencies as Record<string, string>)
      .map((depPackageName): [string, string] | undefined => {
        const depPackageVersion = 'latest';
        const depPackageNameVersion = `${depPackageName}@${depPackageVersion}`;

        process.stderr.write(`${dependencyType}: ${depPackageNameVersion} ... `);

        const depPackageJson = JSON.parse(
          child_process
            .spawnSync(
              'npm',
              [
                'view',
                '--json',
                `${depPackageName}@${depPackageVersion}`,
                'version',
                'deprecated',
                'time',
              ],
              {
                windowsHide: true,
              },
            )
            .stdout.toString(),
        ) as PackageJson;

        const publishDate = new Date(depPackageJson.time[depPackageJson.version]);
        const age = formatAge(publishDate);

        if (depPackageJson.deprecated !== undefined) {
          process.stderr.write('deprecated ☠️\n');
          return [depPackageNameVersion, `deprecated, last updated ${age}`];
        }
        // if (Date.now() - publishDate.getTime() > 2 * 365 * 24 * 60 * 60 * 1000) {
        //   process.stderr.write('abandoned 🏚️\n');
        //   return [depPackageNameVersion, `abandoned, last updated ${age}`];
        // }
        process.stderr.write('✅\n');
        return undefined;
      })
      .filter((value) => value !== undefined);
    return [dependencyType, Object.fromEntries(flagged)] satisfies [string, Record<string, string>];
  });

if (flaggedDependencies.reduce((sum, [_type, deps]) => sum + Object.keys(deps).length, 0) > 0) {
  process.stdout.write(
    `${JSON.stringify(Object.fromEntries(flaggedDependencies), undefined, 2)}\n`,
  );
}
