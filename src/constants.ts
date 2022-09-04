export default class Constants {
  static readonly COMMAND_NAME = 'igir';

  static readonly ZIP_EXTENSIONS = ['.zip'];

  static readonly RAR_EXTENSIONS = ['.rar'];

  // p7zip `7za i`
  static readonly SEVENZIP_EXTENSIONS = [
    '.7z', // 7z
    '.bz2', '.bzip2', '.tbz2', '.tbz', // bzip2
    '.cab', // cab
    '.gz', '.gzip', '.tgz', '.tpz', // gzip
    '.lzma', // lzma
    '.lzma86', // lzma86
    '.pmd', // ppmd
    '.001', // split
    '.tar', '.ova', // tar
    '.xz', '.txz', // xz
    '.z', '.taz', // z
    '.zip', '.z01', '.zipx', // zip
    '.zst', '.tzstd', // zstd
    '.lz4', '.tlz4', // lz4
    '.lz5', '.tlz5', // lz5
    '.liz', '.tliz', // lizard
  ];

  static readonly DAT_THREADS = 3;

  static readonly ROM_SCANNER_THREADS = 25;

  static readonly ROM_WRITER_THREADS = Math.ceil(
    Constants.ROM_SCANNER_THREADS / Constants.DAT_THREADS,
  );
}
