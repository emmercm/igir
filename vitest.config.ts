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
    testTimeout:
      60_000 *
      // macOS is consistently the fastest, with p99 test time <10sec
      (process.platform === 'darwin' && process.arch !== 'x64' ? 0.5 : 1) *
      // Ubuntu ARM frequently times out
      (process.platform === 'linux' && process.arch.startsWith('arm') ? 2 : 1),

    // Only run the committed test files
    exclude: [...configDefaults.exclude, '.*/**', 'dist/**', 'packages/*/deps/**'],

    coverage: {
      provider: 'v8',
      // include: ['{packages,src}/**/*.{js,cjs,mjs,ts}'],
      exclude: ['test/**'],
    },
  },
});
