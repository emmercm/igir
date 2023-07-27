import path from 'path';

const jestConfig = {
  testEnvironment: 'node',

  // Most tests are I/O-bound, increase the test timeout globally
  testTimeout: 20_000,

  // BEGIN https://kulshekhar.github.io/ts-jest/docs/guides/esm-support
  preset: 'ts-jest/presets/default-esm-legacy',
  transform: {
    '\\.ts$': ['ts-jest', { useESM: true }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // END https://kulshekhar.github.io/ts-jest/docs/guides/esm-support

    // BEGIN https://github.com/facebook/jest/issues/12270#issuecomment-1111533936
    chalk: require.resolve('chalk'),
    '#ansi-styles': path.join(
      require.resolve('chalk').split('chalk')[0],
      'chalk/source/vendor/ansi-styles/index.js',
    ),
    '#supports-color': path.join(
      require.resolve('chalk').split('chalk')[0],
      'chalk/source/vendor/supports-color/index.js',
    ),
    // END https://github.com/facebook/jest/issues/12270#issuecomment-1111533936
  },

  // Don't run any compiled versions of the tests, if they exist
  modulePathIgnorePatterns: ['<rootDir>/build/'],
  // Don't report coverage on the test directory
  coveragePathIgnorePatterns: ['<rootDir>/test/'],

  // Report coverage on all source files, because it won't by default...
  collectCoverageFrom: ['<rootDir>/src/**/*.{js,cjs,mjs,ts}'],
};

export default jestConfig;
