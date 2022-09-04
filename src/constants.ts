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

  static readonly GLOBAL_TEMP_DIR = globalTempDir;

  static readonly ZIP_EXTENSIONS = ['.zip'];

  static readonly SEVENZIP_EXTENSIONS = ['.7z', '.bz2', '.cab', '.gz', '.lzma', '.tar', '.xz'];

  static readonly DAT_THREADS = 3;

  static readonly ROM_SCANNER_THREADS = 25;

  // TODO(cemmer): is there a way to set a global limit with only one DAT? semaphores?
  static readonly ROM_HEADER_HASHER_THREADS = Math.ceil(
      Constants.ROM_SCANNER_THREADS / Constants.DAT_THREADS,
  )

  static readonly ROM_WRITER_THREADS = Math.ceil(
    Constants.ROM_SCANNER_THREADS / Constants.DAT_THREADS,
  );

  static readonly FILE_READING_CHUNK_SIZE = 1024 * 1024; // 1MiB
}
