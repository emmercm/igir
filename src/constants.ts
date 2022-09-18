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

  static readonly DAT_THREADS = 3;

  static readonly ROM_SCANNER_THREADS = 25;

  static readonly ROM_WRITER_THREADS = Math.ceil(
    Constants.ROM_SCANNER_THREADS / Constants.DAT_THREADS,
  );
}
