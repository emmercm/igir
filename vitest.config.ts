import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    sequence: {
      shuffle: true,
    },

    // Default Jest behavior
    reporters: ['verbose'],
    watch: false,
    passWithNoTests: true,

    maxWorkers: '75%',
    testTimeout: 60_000,

    // Don't run any compiled versions of the tests, if they exist
    exclude: [...configDefaults.exclude, 'dist/**'],

    coverage: {
      provider: 'v8',
      // include: ['{packages,src}/**/*.{js,cjs,mjs,ts}'],
      exclude: ['test/**'],
    },
  },
});
