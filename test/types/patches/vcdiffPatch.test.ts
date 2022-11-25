import fs, { promises as fsPromises } from 'fs';
import path from 'path';

import Constants from '../../../src/constants.js';
import bufferPoly from '../../../src/polyfill/bufferPoly.js';
import fsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import VcdiffPatch from '../../../src/types/patches/vcdiffPatch.js';

async function writeTemp(fileName: string, contents: string | Buffer): Promise<File> {
  const temp = fsPoly.mktempSync(path.join(Constants.GLOBAL_TEMP_DIR, fileName));
  await fsPromises.writeFile(temp, contents);
  return File.fileOf(temp);
}

describe('constructor', () => {
  test.each([
    // Non-existent
    'foo.xdelta',
    'fizz/buzz.xdelta',
    // Invalid
    'ABCDEFGH Blazgo.xdelta',
    'ABCD12345 Bangarang.xdelta',
    'Bepzinky 1234567.xdelta',
  ])('should throw if no CRC found: %s', async (filePath) => {
    const file = await File.fileOf(filePath, 0, '00000000');
    expect(() => VcdiffPatch.patchFrom(file)).toThrow(/couldn't parse/i);
  });

  test.each([
    // Beginning
    ['ABCD1234-Foo.xdelta', 'abcd1234'],
    ['Fizz/bcde2345_Buzz.xdelta', 'bcde2345'],
    ['One/Two/cdef3456 Three.xdelta', 'cdef3456'],
    // End
    ['Lorem+9876FEDC.xdelta', '9876fedc'],
    ['Ipsum#8765edcb.xdelta', '8765edcb'],
    ['Dolor 7654dcba.xdelta', '7654dcba'],
  ])('should find the CRC in the filename: %s', async (filePath, expectedCrc) => {
    const file = await File.fileOf(filePath, 0, '00000000');
    const patch = VcdiffPatch.patchFrom(file);
    expect(patch.getCrcBefore()).toEqual(expectedCrc);
  });
});

describe('apply', () => {
  test.each([
    // Standard vcdiff with no secondary compression (xdelta3 -S -n -A ...)
    ['AAAAA', Buffer.from('d6c3c40000000d0a000502014142434441061504', 'hex'), 'ABCDAAAAAA'],
    ['AAAAAAAAAA', Buffer.from('d6c3c40000000d0a000502014142434441061504', 'hex'), 'ABCDAAAAAA'],
    ['AAAAAAAAAA', Buffer.from('d6c3c4000000100a000a01004142434445464748494a0b', 'hex'), 'ABCDEFGHIJ'],
    ['AAAAAAAAAAAAAAAAAAAA', Buffer.from('d6c3c40000001414000b0400414243444546414545454507000a05', 'hex'), 'ABCDEFAAAAAAAAAAEEEE'],
  ])('should apply the patch #%#: %s', async (baseContents, patchContents, expectedContents) => {
    const rom = await writeTemp('ROM', baseContents);
    const patchFile = await writeTemp('00000000 patch.xdelta', patchContents);
    const patch = VcdiffPatch.patchFrom(patchFile);

    await patch.apply(rom, async (tempFile) => {
      const actualContents = (
        await bufferPoly.fromReadable(fs.createReadStream(tempFile))
      ).toString();
      expect(actualContents).toEqual(expectedContents);
    });

    await fsPoly.rm(rom.getFilePath());
    await fsPoly.rm(patch.getFile().getFilePath());
  });
});
