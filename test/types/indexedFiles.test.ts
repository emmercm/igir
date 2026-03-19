import ROM from '../../src/types/dats/rom.js';
import File from '../../src/types/files/file.js';
import ROMHeader from '../../src/types/files/romHeader.js';
import IndexedFiles from '../../src/types/indexedFiles.js';

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
      fileHeader: ROMHeader.headerFromFilename('two.lnx'),
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
      fileHeader: ROMHeader.headerFromFilename('six.nes'),
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
    expect(
      indexedFiles.findFiles(new ROM({ name: '', size: 0, crc32: 'FFFFFFFF' })),
    ).toHaveLength(0);
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
