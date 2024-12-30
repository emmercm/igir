import fs from 'node:fs';
import path from 'node:path';

import type { Config } from 'jest';

export default async (): Promise<Config> => {
  // Fix some bad package.json files that don't play well with ts-jest
  await Promise.all(
    [
      // https://github.com/g-plane/cue/issues/1
      '@gplane/cue',
    ].map(async (moduleName) => {
      const modulePath = path.join('node_modules', moduleName);
      const packagePath = path.join(modulePath, 'package.json');
      const packageJson = JSON.parse((await fs.promises.readFile(packagePath)).toString());

      packageJson.main = packageJson.main ?? packageJson.exports['.'].import;
      delete packageJson.exports;

      await fs.promises.writeFile(packagePath, JSON.stringify(packageJson, undefined, 2));
    }),
  );

  return {
    preset: 'ts-jest',
    testEnvironment: 'node',

    setupFilesAfterEnv: ['jest-extended/all'],

    // Most tests are I/O-bound, increase the test timeout globally
    testTimeout: 20_000,

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
    collectCoverageFrom: ['<rootDir>/src/**/*.{js,cjs,mjs,ts}'],
  };
};
