import fs from 'fs';
import os from 'os';
import path from 'path';
import url from 'url';

import fsPoly from './polyfill/fsPoly.js';

function scanUpPathForFile(filePath: string, fileName: string): string | undefined {
  const fullPath = path.join(filePath, fileName);
  if (fs.existsSync(fullPath)) {
    return fullPath;
  }

  const parentPath = path.dirname(filePath);
  if (parentPath !== filePath) {
    return scanUpPathForFile(path.dirname(filePath), fileName);
  }

  return undefined;
}

const PACKAGE_JSON = JSON.parse(
  fs.readFileSync(scanUpPathForFile(
    url.fileURLToPath(new URL('.', import.meta.url)),
    'package.json',
  ) as string).toString(),
);
const COMMAND_NAME = PACKAGE_JSON.name;

const GLOBAL_TEMP_DIR = fsPoly.mkdtempSync(path.join(os.tmpdir(), COMMAND_NAME));
process.once('SIGINT', () => {
  fsPoly.rmSync(GLOBAL_TEMP_DIR, {
    force: true,
    recursive: true,
  });
});

export default class Constants {
  static readonly COMMAND_NAME = COMMAND_NAME;

  static readonly COMMAND_VERSION = PACKAGE_JSON.version;

  static readonly GLOBAL_TEMP_DIR = GLOBAL_TEMP_DIR;

  static readonly DAT_SCANNER_THREADS = 20;

  static readonly ROM_SCANNER_THREADS = 20;

  static readonly PATCH_SCANNER_THREADS = 20;

  static readonly ROM_HEADER_HASHER_THREADS = 20;

  static readonly DAT_THREADS = 3;

  static readonly ROM_WRITER_THREADS = 20;

  static readonly FILE_READING_CHUNK_SIZE = 1024 * 1024; // 1MiB

  static readonly MAX_MEMORY_FILE_SIZE = 64 * 1024 * 1024; // 64MiB
}
