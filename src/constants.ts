import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

import fsPoly from './polyfill/fsPoly.js';

/**
 * Search for a {@link fileName} in {@link filePath} or any of its parent directories.
 */
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

const PACKAGE_JSON_PATH = scanUpPathForFile(
  url.fileURLToPath(new URL('.', import.meta.url)),
  'package.json',
) as string;
const PACKAGE_JSON = JSON.parse(
  fs.readFileSync(PACKAGE_JSON_PATH).toString(),
);
const COMMAND_NAME = PACKAGE_JSON.name;

const ROOT_DIR = path.dirname(PACKAGE_JSON_PATH);

const GLOBAL_TEMP_DIR = fsPoly.mkdtempSync(path.join(os.tmpdir(), COMMAND_NAME));
process.once('beforeExit', async () => {
  // WARN: Jest won't call this: https://github.com/jestjs/jest/issues/10927
  await fsPoly.rm(GLOBAL_TEMP_DIR, {
    force: true,
    recursive: true,
  });
});

const GLOBAL_CACHE_FILE = [
  path.resolve(ROOT_DIR),
  os.homedir(),
]
  .filter((dir) => dir && !dir.startsWith(os.tmpdir()))
  .map((dir) => path.join(dir, `${COMMAND_NAME}.cache`))
  .sort((a, b) => (fs.existsSync(a) ? 1 : 0) - (fs.existsSync(b) ? 1 : 0))
  .find((file) => {
    try {
      fsPoly.touchSync(file);
      return true;
    } catch {
      return false;
    }
  });

/**
 * A static class of constants that are determined at startup, to be used widely.
 */
export default class Constants {
  static readonly COMMAND_NAME = COMMAND_NAME;

  static readonly AUTHOR = PACKAGE_JSON.author;

  static readonly HOMEPAGE = PACKAGE_JSON.homepage;

  static readonly COMMAND_VERSION = PACKAGE_JSON.version;

  static readonly ENGINES_NODE = PACKAGE_JSON.engines?.node ?? '*';

  static readonly GLOBAL_TEMP_DIR = GLOBAL_TEMP_DIR;

  static readonly GLOBAL_CACHE_FILE = GLOBAL_CACHE_FILE;

  /**
   * A reasonable max of filesystem threads for operations such as:
   * @example
   * Promise.all([].map(async (file) => fs.lstat(file));
   */
  static readonly MAX_FS_THREADS = 100;

  /**
   * Default max semaphore filesize of files to read (and checksum) and write (and test) at once.
   * This will be the limiting factor for consoles with large ROMs. 4.7GiB DVD+R.
   */
  static readonly MAX_READ_WRITE_CONCURRENT_KILOBYTES = Math.ceil(4_700_372_992 / 1024);

  /**
   * Default number of DATs to process at once.
   */
  static readonly DAT_DEFAULT_THREADS = 3;

  /**
   * A reasonable max number of files to write at once.
   */
  static readonly FILE_READER_DEFAULT_THREADS = 10;

  /**
   * Max number of archive entries to process (possibly extract & MD5/SHA1/SHA256 checksum) at once.
   */
  static readonly ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE = 5;

  /**
   * A reasonable max number of ROM release candidates to write at once. This will be the limiting
   * factor for consoles with many small ROMs.
   */
  static readonly ROM_WRITER_DEFAULT_THREADS = 10;

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
