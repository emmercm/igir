import path from 'node:path';

import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'native-addon-resolver',
      resolveId(source, importer, options): { id: string; external: boolean } | undefined {
        // Handle imports with { type: "file" } attribute
        if (options.attributes.type === 'file' && source.endsWith('.node') && importer) {
          const importerDir = path.dirname(importer);
          return { id: path.resolve(importerDir, source), external: false };
        }
        return undefined;
      },
      load(id): string | undefined {
        // For .node files imported with type: "file", return the path as a string
        if (id.endsWith('.node')) {
          return `export default ${JSON.stringify(id)};`;
        }
        return undefined;
      },
    },
  ],

  test: {
    globals: true,
    environment: 'node',
    sequence: {
      shuffle: true,
    },
    watch: false,
    passWithNoTests: true,

    // maxWorkers: process.platform === 'win32' ? 1 : '50%',
    testTimeout: 30_000 * (process.platform === 'win32' ? 2 : 1),

    // Don't run any compiled versions of the tests, if they exist
    exclude: [...configDefaults.exclude, 'dist/**'],

    coverage: {
      provider: 'v8',
      // include: ['{packages,src}/**/*.{js,cjs,mjs,ts}'],
      exclude: ['test/**'],
    },
  },
});
