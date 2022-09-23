import path from 'path';

import fsPoly from './polyfill/fsPoly.js';

const globalTempDir = fsPoly.mkdtempSync();
process.on('SIGINT', () => {
  fsPoly.rmSync(globalTempDir, {
    force: true,
    recursive: true,
  });
});

export default class Constants {
  static readonly COMMAND_NAME = 'igir';

  static readonly GLOBAL_TEMP_DIR = globalTempDir + path.sep;

  static readonly DAT_THREADS = 3;

  static readonly ROM_SCANNER_THREADS = 25;

  static readonly ROM_HEADER_HASHER_THREADS = 25;

  static readonly ROM_WRITER_THREADS = 25;

  static readonly FILE_READING_CHUNK_SIZE = 1024 * 1024; // 1MiB

  static readonly MAX_STREAM_EXTRACTION_SIZE = 1024 * 1024 * 100; // 100MiB
}
