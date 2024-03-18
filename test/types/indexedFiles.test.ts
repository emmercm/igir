import ROM from '../../src/types/dats/rom.js';
import File from '../../src/types/files/file.js';
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
  ];

  it('should find files based on CRC32', async () => {
    const indexedFiles = IndexedFiles.fromFiles(await Promise.all(filePromises));
    expect(indexedFiles.findFiles(new ROM({ name: '', size: 1, crc32: '11111111' }))).toHaveLength(1);
    expect(indexedFiles.findFiles(new ROM({ name: '', size: 2, crc32: '22222222' }))).toHaveLength(1);
    expect(indexedFiles.findFiles(new ROM({ name: '', size: 999_999, crc32: '22222222' }))).toBeUndefined();
    expect(indexedFiles.findFiles(new ROM({ name: '', size: 0, crc32: 'FFFFFFFF' }))).toBeUndefined();
  });

  it('should find files based on MD5', async () => {
    const indexedFiles = IndexedFiles.fromFiles(await Promise.all(filePromises));
    expect(indexedFiles.findFiles(new ROM({ name: '', size: 0, md5: '33333333333333333333333333333333' }))).toHaveLength(1);
    expect(indexedFiles.findFiles(new ROM({ name: '', size: 0, md5: '44444444444444444444444444444444' }))).toHaveLength(1);
    expect(indexedFiles.findFiles(new ROM({ name: '', size: 0, md5: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF' }))).toBeUndefined();
  });

  it('should find files based on SHA1', async () => {
    const indexedFiles = IndexedFiles.fromFiles(await Promise.all(filePromises));
    expect(indexedFiles.findFiles(new ROM({ name: '', size: 0, sha1: '4444444444444444444444444444444444444444' }))).toHaveLength(1);
    expect(indexedFiles.findFiles(new ROM({ name: '', size: 0, sha1: '5555555555555555555555555555555555555555' }))).toHaveLength(1);
    expect(indexedFiles.findFiles(new ROM({ name: '', size: 0, sha1: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF' }))).toBeUndefined();
  });
});
