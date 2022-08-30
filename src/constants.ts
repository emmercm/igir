export default class Constants {
  static readonly COMMAND_NAME = 'igir';

  static readonly ZIP_EXTENSIONS = ['.zip'];

  static readonly SEVENZIP_EXTENSIONS = ['.7z', '.bz2', '.cab', '.gz', '.lzma', '.tar', '.xz'];

  static readonly DAT_THREADS = 3;

  static readonly ROM_SCANNER_THREADS = 25;

  static readonly ROM_WRITER_THREADS = Math.ceil(
    Constants.ROM_SCANNER_THREADS / Constants.DAT_THREADS,
  );
}
