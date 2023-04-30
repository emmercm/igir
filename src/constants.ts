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
process.once('exit', () => {
  fsPoly.rmSync(GLOBAL_TEMP_DIR, {
    force: true,
    recursive: true,
  });
});

export default class Constants {
  static readonly COMMAND_NAME = COMMAND_NAME;

  static readonly AUTHOR = PACKAGE_JSON.author;

  static readonly HOMEPAGE = PACKAGE_JSON.homepage;

  static readonly COMMAND_VERSION = PACKAGE_JSON.version;

  static readonly ENGINES_NODE = PACKAGE_JSON.engines.node || '*';

  static readonly GLOBAL_TEMP_DIR = GLOBAL_TEMP_DIR;

  /**
   * A sane max of filesystem threads for operations such as:
   * @example
   * Promise.all([].map(async (file) => fs.lstat(file));
   */
  static readonly MAX_FS_THREADS = 1_000;

  /**
   * Default max semaphore filesize of files to read (and checksum) and write (and test) at once.
   * This will be the limiting factor for consoles with large ROMs. 4.7GiB DVD+R.
   */
  static readonly MAX_READ_WRITE_CONCURRENT_KILOBYTES = Math.ceil(4_700_372_992 / 1024);

  /**
   * Max number of DAT files to parse at once during scanning.
   */
  static readonly DAT_SCANNER_THREADS = 20;

  /**
   * Max number of ROM files to parse at once during scanning.
   */
  static readonly ROM_SCANNER_THREADS = 20;

  /**
   * Max number of ROM patch files to parse at once during scanning.
   */
  static readonly PATCH_SCANNER_THREADS = 20;

  /**
   * Max number of ROMs to parse for headers at once.
   */
  static readonly ROM_HEADER_PROCESSOR_THREADS = 20;

  /**
   * Default number of DATs to process at once.
   */
  static readonly DAT_DEFAULT_THREADS = 3;

  /**
   * A sane max number of ROM release candidates to write at once. This will be the limiting factor
   * for consoles with many small ROMs.
   */
  static readonly ROM_WRITER_THREADS = 20;

  /**
   * Max number of files to recycle/delete at once.
   */
  static readonly OUTPUT_CLEANER_BATCH_SIZE = 100;

  /**
   * Max {@link fs} highWaterMark chunk size to read and write at a time.
   */
  static readonly FILE_READING_CHUNK_SIZE = fsPoly.FILE_READING_CHUNK_SIZE;

  /**
   * Max size of file contents to store in memory vs. temp files.
   */
  static readonly MAX_MEMORY_FILE_SIZE = 64 * 1024 * 1024; // 64MiB
}
