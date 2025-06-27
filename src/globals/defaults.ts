/**
 * A static class of globals that are determined at startup, to be used widely.
 */
export default class Defaults {
  /**
   * A reasonable max of filesystem threads for operations such as:
   * @example
   * Promise.all([].map(async (file) => fs.lstat(file));
   */
  static readonly MAX_FS_THREADS = 100;

  /**
   * Default max semaphore filesize of files to read (and checksum) and write (and test) at once.
   * This will be the limiting factor for consoles with large ROMs. 734MiB CDs.
   */
  static readonly MAX_READ_WRITE_CONCURRENT_KILOBYTES = Math.ceil(734_003_200 / 1024);

  /**
   * Default number of DATs to process at once.
   */
  static readonly DAT_DEFAULT_THREADS = 2;

  /**
   * A reasonable max number of files to write at once.
   */
  static readonly FILE_READER_DEFAULT_THREADS = 8;

  /**
   * Max number of archive entries to process (possibly extract & MD5/SHA1/SHA256 checksum) at once.
   */
  static readonly ARCHIVE_ENTRY_SCANNER_THREADS_PER_ARCHIVE = this.FILE_READER_DEFAULT_THREADS / 2;

  /**
   * A reasonable max number of ROM release candidates to write at once. This will be the limiting
   * factor for consoles with many small ROMs.
   */
  static readonly ROM_WRITER_DEFAULT_THREADS = this.FILE_READER_DEFAULT_THREADS / 2;

  /**
   * The number of additional retry attempts to write a file if the write or test fails.
   */
  static readonly ROM_WRITER_ADDITIONAL_RETRIES = 2;

  /**
   * Max number of files to recycle/delete at once.
   */
  static readonly OUTPUT_CLEANER_BATCH_SIZE = 100;

  /**
   * Max {@link fs} highWaterMark chunk size to read and write at a time.
   */
  static readonly FILE_READING_CHUNK_SIZE = 64 * 1024; // 64KiB, Node.js v22 default

  /**
   * Max size of file contents to store in memory vs. temp files.
   */
  static readonly MAX_MEMORY_FILE_SIZE = 64 * 1024 * 1024; // 64MiB
}
