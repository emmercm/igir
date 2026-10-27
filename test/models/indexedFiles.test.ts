import ROM from '../../src/models/dats/rom.js';
import ArchiveEntry from '../../src/models/files/archives/archiveEntry.js';
import Zip from '../../src/models/files/archives/zip.js';
import File from '../../src/models/files/file.js';
import FileSignature from '../../src/models/files/fileSignature.js';
import IndexedFiles from '../../src/models/indexedFiles.js';
import PathUtil from '../../src/utils/pathUtil.js';

describe('fromFiles', () => {
  const filePromises = ['bravo', 'alpha', 'charlie'].map(
    async (filePath) =>
      await File.fileOf({
        filePath,
        size: 1,
        crc32: '11111111',
        sha1: '1111111111111111111111111111111111111111',
      }),
  );

  it('should keep input order without a comparator', async () => {
    const indexedFiles = IndexedFiles.fromFiles(await Promise.all(filePromises));
    expect(
      indexedFiles
        .findFiles(new ROM({ name: '', size: 1, crc32: '11111111' }))
        .map((file) => file.getFilePath()),
    ).toEqual(['bravo', 'alpha', 'charlie'].map((filePath) => PathUtil.resolve(filePath)));
  });

  it('should sort files sharing a checksum with the comparator', async () => {
    const indexedFiles = IndexedFiles.fromFiles(
      await Promise.all(filePromises),
      (fileOne, fileTwo) => fileOne.getFilePath().localeCompare(fileTwo.getFilePath()),
    );
    const expected = ['alpha', 'bravo', 'charlie'].map((filePath) => PathUtil.resolve(filePath));
    expect(
      indexedFiles
        .findFiles(new ROM({ name: '', size: 1, crc32: '11111111' }))
        .map((file) => file.getFilePath()),
    ).toEqual(expected);
    expect(
      indexedFiles
        .findFiles(new ROM({ name: '', size: 1, sha1: '1111111111111111111111111111111111111111' }))
        .map((file) => file.getFilePath()),
    ).toEqual(expected);
    expect(indexedFiles.getFiles().map((file) => file.getFilePath())).toEqual(expected);
  });
});

describe('findFiles', () => {
  const filePromises = [
    File.fileOf({
      filePath: 'one',
      size: 1,
      crc32: '11111111',
    }),
    File.fileOf({
      filePath: 'two',
      size: 2,
      crc32: '22222222',
      md5: '22222222222222222222222222222222',
      fileHeader: FileSignature.romHeaderFromFilename('two.lnx'),
    }),
    File.fileOf({
      filePath: 'three',
      size: 3,
      md5: '33333333333333333333333333333333',
    }),
    File.fileOf({
      filePath: 'four',
      size: 4,
      md5: '44444444444444444444444444444444',
      sha1: '4444444444444444444444444444444444444444',
    }),
    File.fileOf({
      filePath: 'five',
      size: 5,
      sha1: '5555555555555555555555555555555555555555',
    }),
    File.fileOf({
      filePath: 'six',
      size: 6,
      sha1: '6666666666666666666666666666666666666666',
      sha256: '6666666666666666666666666666666666666666666666666666666666666666',
      fileHeader: FileSignature.romHeaderFromFilename('six.nes'),
    }),
    File.fileOf({
      filePath: 'seven',
      size: 7,
      sha256: '7777777777777777777777777777777777777777777777777777777777777777',
    }),
  ];

  it('should find files based on CRC32', async () => {
    const indexedFiles = IndexedFiles.fromFiles(await Promise.all(filePromises));
    expect(indexedFiles.findFiles(new ROM({ name: '', size: 1, crc32: '11111111' }))).toHaveLength(
      1,
    );
    expect(indexedFiles.findFiles(new ROM({ name: '', size: 2, crc32: '22222222' }))).toHaveLength(
      1,
    );
    expect(
      indexedFiles.findFiles(new ROM({ name: '', size: 999_999, crc32: '22222222' })),
    ).toHaveLength(0);
    expect(indexedFiles.findFiles(new ROM({ name: '', size: 0, crc32: 'FFFFFFFF' }))).toHaveLength(
      0,
    );
  });

  it('should find files based on MD5', async () => {
    const indexedFiles = IndexedFiles.fromFiles(await Promise.all(filePromises));
    expect(
      indexedFiles.findFiles(
        new ROM({ name: '', size: 0, md5: '33333333333333333333333333333333' }),
      ),
    ).toHaveLength(1);
    expect(
      indexedFiles.findFiles(
        new ROM({ name: '', size: 0, md5: '44444444444444444444444444444444' }),
      ),
    ).toHaveLength(1);
    expect(
      indexedFiles.findFiles(
        new ROM({ name: '', size: 0, md5: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF' }),
      ),
    ).toHaveLength(0);
  });

  it('should find files based on SHA1', async () => {
    const indexedFiles = IndexedFiles.fromFiles(await Promise.all(filePromises));
    expect(
      indexedFiles.findFiles(
        new ROM({ name: '', size: 0, sha1: '4444444444444444444444444444444444444444' }),
      ),
    ).toHaveLength(1);
    expect(
      indexedFiles.findFiles(
        new ROM({ name: '', size: 0, sha1: '5555555555555555555555555555555555555555' }),
      ),
    ).toHaveLength(1);
    expect(
      indexedFiles.findFiles(
        new ROM({ name: '', size: 0, sha1: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF' }),
      ),
    ).toHaveLength(0);
  });

  it('should deduplicate a file matched by multiple checksums', async () => {
    const indexedFiles = IndexedFiles.fromFiles(await Promise.all(filePromises));
    // 'four' is indexed by both md5 and sha1; supplying both should return it exactly once
    expect(
      indexedFiles.findFiles(
        new ROM({
          name: '',
          size: 0,
          md5: '44444444444444444444444444444444',
          sha1: '4444444444444444444444444444444444444444',
        }),
      ),
    ).toHaveLength(1);
    // 'six' is indexed by both sha1 and sha256; supplying both should return it exactly once
    expect(
      indexedFiles.findFiles(
        new ROM({
          name: '',
          size: 0,
          sha1: '6666666666666666666666666666666666666666',
          sha256: '6666666666666666666666666666666666666666666666666666666666666666',
        }),
      ),
    ).toHaveLength(1);
  });

  it('should deduplicate separate file objects at the same location', async () => {
    const indexedFiles = IndexedFiles.fromFiles(
      await Promise.all([
        File.fileOf({ filePath: 'one', size: 1, crc32: '11111111' }),
        File.fileOf({ filePath: 'one', size: 1, crc32: '11111111' }),
        ArchiveEntry.entryOf({
          archive: new Zip('two.zip'),
          entryPath: 'two.bin',
          size: 1,
          crc32: '11111111',
        }),
        ArchiveEntry.entryOf({
          archive: new Zip('two.zip'),
          entryPath: 'two.bin',
          size: 1,
          crc32: '11111111',
        }),
      ]),
    );
    const rom = new ROM({ name: '', size: 1, crc32: '11111111' });
    expect(indexedFiles.findFiles(rom)).toHaveLength(2);
    expect(indexedFiles.findFilesAtPath(rom, PathUtil.resolve('two.zip'))).toHaveLength(1);
    expect(indexedFiles.getSize()).toEqual(2);
  });

  it('should return all files when checksums match different files', async () => {
    const indexedFiles = IndexedFiles.fromFiles(await Promise.all(filePromises));
    // sha256 matches 'seven', sha1 matches 'five' — both distinct files should be returned
    expect(
      indexedFiles.findFiles(
        new ROM({
          name: '',
          size: 0,
          sha256: '7777777777777777777777777777777777777777777777777777777777777777',
          sha1: '5555555555555555555555555555555555555555',
        }),
      ),
    ).toHaveLength(2);
  });

  it('should find files based on SHA256', async () => {
    const indexedFiles = IndexedFiles.fromFiles(await Promise.all(filePromises));
    expect(
      indexedFiles.findFiles(
        new ROM({
          name: '',
          size: 0,
          sha256: '6666666666666666666666666666666666666666666666666666666666666666',
        }),
      ),
    ).toHaveLength(1);
    expect(
      indexedFiles.findFiles(
        new ROM({
          name: '',
          size: 0,
          sha256: '7777777777777777777777777777777777777777777777777777777777777777',
        }),
      ),
    ).toHaveLength(1);
    expect(
      indexedFiles.findFiles(
        new ROM({
          name: '',
          size: 0,
          sha256: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        }),
      ),
    ).toHaveLength(0);
  });
});

describe('findFilesAtPath', () => {
  it('should find what findFiles finds, at one path', async () => {
    // Several files share each checksum, as identical tracks do across many discs
    const files = await Promise.all([
      ...['alpha.zip', 'bravo.zip', 'charlie.zip'].flatMap((filePath) => [
        File.fileOf({ filePath, size: 1, crc32: '11111111' }),
        File.fileOf({
          filePath,
          size: 2,
          crc32: '22222222',
          md5: '22222222222222222222222222222222',
        }),
        File.fileOf({ filePath, size: 3, sha1: '3333333333333333333333333333333333333333' }),
      ]),
      // A single file at its path, like an extracted file or a single-file archive
      File.fileOf({ filePath: 'echo.zip', size: 1, crc32: '11111111' }),
      // Several entries in one archive sharing a checksum, as identical tracks do within one disc
      ...['one.bin', 'two.bin', 'three.bin'].map(
        async (entryPath) =>
          await ArchiveEntry.entryOf({
            archive: new Zip('foxtrot.zip'),
            entryPath,
            size: 1,
            crc32: '11111111',
          }),
      ),
      ArchiveEntry.entryOf({
        archive: new Zip('foxtrot.zip'),
        entryPath: 'four.bin',
        size: 3,
        sha1: '3333333333333333333333333333333333333333',
      }),
    ]);
    const indexedFiles = IndexedFiles.fromFiles(files);

    for (const rom of [
      new ROM({ name: 'one', size: 1, crc32: '11111111' }),
      new ROM({ name: 'two', size: 2, crc32: '22222222', md5: '22222222222222222222222222222222' }),
      new ROM({ name: 'three', size: 3, sha1: '3333333333333333333333333333333333333333' }),
      new ROM({ name: 'none', size: 9, crc32: '99999999' }),
    ]) {
      for (const filePath of [
        'alpha.zip',
        'bravo.zip',
        'charlie.zip',
        'delta.zip',
        'echo.zip',
        'foxtrot.zip',
      ]) {
        expect(indexedFiles.findFilesAtPath(rom, filePath)).toEqual(
          indexedFiles.findFiles(rom).filter((file) => file.getFilePath() === filePath),
        );
      }
    }
  });
});
