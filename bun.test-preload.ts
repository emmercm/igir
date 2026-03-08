/// <reference types="@types/bun" />

/**
 * Bun processes `import ... from ... with {type:'file'}` imports at bundle time, and it doesn't
 * use the bundler when testing. This plugin intercepts TypeScript source files that use
 * `{ type: 'file' }` imports and rewrites them to use `import.meta.resolve()` instead, which
 * works correctly in Bun's test runtime.
 */

import { readFileSync } from 'node:fs';

import { plugin } from 'bun';

plugin({
  name: 'file-import-to-resolve',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, (args) => {
      const source = readFileSync(args.path, 'utf8');
      if (!source.includes("with { type: 'file' }")) return { contents: source, loader: 'ts' };

      const contents = `import { fileURLToPath as __fileURLToPath } from 'node:url';\n${source.replaceAll(
        /^import (\w+) from ('.*?') with \{ type: 'file' \};$/gm,
        (_, name: string, path: string) =>
          `const ${name} = __fileURLToPath(import.meta.resolve(${path}));`,
      )}`;
      return { contents, loader: 'ts' };
    });
  },
});
