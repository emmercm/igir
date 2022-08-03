const path = require('path');

/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // https://github.com/kulshekhar/ts-jest/issues/1057#issuecomment-1068342692
  globals: {
    "ts-jest": {
      useESM: true
    }
  },
  moduleNameMapper: {
    "(.+)\\.js": "$1",
    // https://github.com/facebook/jest/issues/12270#issuecomment-1111533936
    chalk: require.resolve("chalk"),
    "#ansi-styles": path.join(
        require.resolve("chalk").split("chalk")[0],
        "chalk/source/vendor/ansi-styles/index.js",
    ),
    "#supports-color": path.join(
        require.resolve("chalk").split("chalk")[0],
        "chalk/source/vendor/supports-color/index.js",
    ),
  },
  extensionsToTreatAsEsm: [".ts"],
};
