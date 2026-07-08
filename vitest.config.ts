import fs from 'node:fs';

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
      // macOS Apple Silicon is fast
      (process.platform === 'darwin' && process.arch !== 'x64' ? 0.5 : 1) *
      // Ubuntu ARM is slow
      (process.platform === 'linux' && process.arch.startsWith('arm') ? 2 : 1) *
      // QEMU (via Docker) is slow
      // https://github.com/sindresorhus/is-docker/blob/59379f14b6dda26a0167fce55d80bf546857f92d/index.js
      (process.platform === 'linux' &&
      (fs.existsSync('/.dockerenv') ||
        fs.readFileSync('/proc/self/cgroup', 'utf8').includes('docker') ||
        fs.readFileSync('/proc/self/mountinfo', 'utf8').includes('/docker/containers/'))
        ? 2
        : 1),

    // Only run the committed test files
    exclude: [...configDefaults.exclude, '.*/**', 'dist/**', 'packages/*/deps/**'],

    coverage: {
      provider: 'v8',
      // include: ['{packages,src}/**/*.{js,cjs,mjs,ts}'],
      exclude: ['test/**'],
    },
  },
});
