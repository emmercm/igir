import IgirException from '../../../src/exceptions/igirException.js';
import ROM from '../../../src/models/dats/rom.js';
import type { ChecksumProps } from '../../../src/models/files/fileChecksums.js';
import { ChecksumBitmask } from '../../../src/models/files/fileChecksums.js';

describe('constructor', () => {
  test.each([
    '..',
    '../evil.rom',
    '../../../../tmp/evil.rom',
    'roms/../../evil.rom',
    'roms/..',
    '..\\evil.rom',
    'roms\\..\\..\\evil.rom',
    '/etc/passwd',
    '//server/share/evil.rom',
    'C:\\Windows\\evil.rom',
    'c:/windows/evil.rom',
  ])('should throw on a name that escapes the output directory: %s', (name) => {
    expect(() => new ROM({ name, size: 0 })).toThrow(IgirException);
  });

  test.each([
    'Tetris (World).gb',
    'Nintendo - Game Boy/Tetris (World).gb',
    './Tetris (World).gb',
    // Only whole segments count, these are all legal filenames
    'Final Fantasy VII..disc1.bin',
    '..hidden.rom',
    'Game.../rom.bin',
  ])('should not throw on a legal name: %s', (name) => {
    expect(() => new ROM({ name, size: 0 })).not.toThrow();
  });
});

describe('getChecksumBitmask', () => {
  test.each([
    [{}, ChecksumBitmask.NONE],
    [{ crc32: '00000000' }, ChecksumBitmask.CRC32],
    [{ size: 4, crc32: '12345678' }, ChecksumBitmask.CRC32],
    [{ md5: 'd41d8cd98f00b204e9800998ecf8427e' }, ChecksumBitmask.MD5],
    [{ sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709' }, ChecksumBitmask.SHA1],
    [
      { sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
      ChecksumBitmask.SHA256,
    ],
    [
      {
        crc32: '00000000',
        md5: 'd41d8cd98f00b204e9800998ecf8427e',
        sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
      ChecksumBitmask.CRC32 | ChecksumBitmask.MD5 | ChecksumBitmask.SHA1 | ChecksumBitmask.SHA256,
    ],
  ] satisfies [ChecksumProps & { size?: number }, number][])(
    'should return the bitmask of the checksums present: %o',
    (checksumProps, expectedBitmask) => {
      const rom = new ROM({ name: 'rom', size: 0, ...checksumProps });
      expect(rom.getChecksumBitmask()).toEqual(expectedBitmask);
    },
  );
});
