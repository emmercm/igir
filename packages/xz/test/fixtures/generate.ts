/**
 * Regenerates this directory's xz fixtures with the xz CLI.
 *
 * Usage: npx tsx packages/xz/test/fixtures/generate.ts
 */
import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import { FIXTURES } from './fixtures.js';

const dirname = url.fileURLToPath(new URL('.', import.meta.url));

for (const [fileName, { lzma2Options, input }] of Object.entries(FIXTURES)) {
  const compressed = child_process.execFileSync(
    'xz',
    ['--format=xz', '--check=none', `--lzma2=${lzma2Options}`, '--stdout'],
    { input: input(), maxBuffer: 64 * 1024 * 1024 },
  );
  fs.writeFileSync(path.join(dirname, fileName), compressed);
}
