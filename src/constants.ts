import fs from 'fs';
import path from 'path';
import url from 'url';

import fsPoly from './polyfill/fsPoly.js';

const globalTempDir = fsPoly.mkdtempSync();
process.on('SIGINT', () => {
  fsPoly.rmSync(globalTempDir, {
    force: true,
    recursive: true,
  });
});

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

export default class Constants {
  static readonly COMMAND_NAME = 'igir';

  static readonly COMMAND_VERSION = process.env.npm_package_version
                || JSON.parse(
                  fs.readFileSync(scanUpPathForFile(
                    url.fileURLToPath(new URL('.', import.meta.url)),
                    'package.json',
                  ) as string).toString(),
                ).version;

  static readonly GLOBAL_TEMP_DIR = globalTempDir + path.sep;

  static readonly DAT_SCANNER_THREADS = 25;

  static readonly ROM_SCANNER_THREADS = 25;

  static readonly ROM_HEADER_HASHER_THREADS = 25;

  static readonly DAT_THREADS = 3;

  static readonly ROM_WRITER_THREADS = 25;

  static readonly FILE_READING_CHUNK_SIZE = 1024 * 1024; // 1MiB

  static readonly MAX_STREAM_EXTRACTION_SIZE = 1024 * 1024 * 100; // 100MiB
}
