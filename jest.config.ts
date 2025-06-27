import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import type { Config } from 'jest';

const jestConfig = async (): Promise<Config> => {
  // Fix some bad package.json files that don't play well with ts-jest
  await Promise.all(
    [
      // https://github.com/g-plane/cue/issues/1
      '@gplane/cue',
    ].map(async (moduleName) => {
      const modulePath = path.join('node_modules', moduleName);
      const packagePath = path.join(modulePath, 'package.json');
      const packageJson = JSON.parse(
        (await util.promisify(fs.readFile)(packagePath)).toString(),
      ) as {
        main: string | undefined;
        exports:
          | {
              '.': {
                import: string;
              };
            }
          | undefined;
      };

      packageJson.main =
        packageJson.main ??
        (packageJson.exports === undefined ? undefined : packageJson.exports['.'].import);
      delete packageJson.exports;

      await util.promisify(fs.writeFile)(packagePath, JSON.stringify(packageJson, undefined, 2));
    }),
  );

  return {
    preset: 'ts-jest',
    testEnvironment: 'node',
    randomize: true,
    verbose: true,

    setupFilesAfterEnv: ['jest-extended/all'],

    // Many tests are I/O-bound, and possibly contend with each other; reduce
    // the parallelism and increase the test timeout globally
    maxWorkers: '50%',
    testTimeout: 45_000,

    // BEGIN https://kulshekhar.github.io/ts-jest/docs/guides/esm-support
    extensionsToTreatAsEsm: ['.ts'],
    transform: {
      '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
    },
    moduleNameMapper: {
      '^(\\.{1,2}/.*)\\.js$': '$1',
      // END https://kulshekhar.github.io/ts-jest/docs/guides/esm-support
    },

    // Don't run any compiled versions of the tests, if they exist
    modulePathIgnorePatterns: ['<rootDir>/dist/'],
    // Don't report coverage on the test directory
    coveragePathIgnorePatterns: ['<rootDir>/test/'],

    // Report coverage on all source files, because it won't by default...
    collectCoverageFrom: ['<rootDir>/{packages,src}/**/*.{js,cjs,mjs,ts}'],
  };
};
export default jestConfig;
