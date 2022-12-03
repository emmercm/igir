import fs from 'fs';
import path from 'path';
import util from 'util';

import Constants from '../../../src/constants.js';
import bufferPoly from '../../../src/polyfill/bufferPoly.js';
import fsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import PPFPatch from '../../../src/types/patches/ppfPatch.js';

async function writeTemp(fileName: string, contents: string | Buffer): Promise<File> {
  const temp = fsPoly.mktempSync(path.join(Constants.GLOBAL_TEMP_DIR, fileName));
  await util.promisify(fs.writeFile)(temp, contents);
  return File.fileOf(temp);
}

describe('constructor', () => {
  test.each([
    // Non-existent
    'foo.ppf',
    'fizz/buzz.ppf',
    // Invalid
    'ABCDEFGH Blazgo.ppf',
    'ABCD12345 Bangarang.ppf',
    'Bepzinky 1234567.ppf',
  ])('should throw if no CRC found: %s', async (filePath) => {
    const file = await File.fileOf(filePath, 0, '00000000');
    expect(() => PPFPatch.patchFrom(file)).toThrow(/couldn't parse/i);
  });

  test.each([
    // Beginning
    ['ABCD1234-Foo.ppf', 'abcd1234'],
    ['Fizz/bcde2345_Buzz.ppf', 'bcde2345'],
    ['One/Two/cdef3456 Three.ppf', 'cdef3456'],
    // End
    ['Lorem+9876FEDC.ppf', '9876fedc'],
    ['Ipsum#8765edcb.ppf', '8765edcb'],
    ['Dolor 7654dcba.ppf', '7654dcba'],
  ])('should find the CRC in the filename: %s', async (filePath, expectedCrc) => {
    const file = await File.fileOf(filePath, 0, '00000000');
    const patch = PPFPatch.patchFrom(file);
    expect(patch.getCrcBefore()).toEqual(expectedCrc);
  });
});

describe('apply', () => {
  test.each([
    ['AAAAAAAAAA', Buffer.from('5050463330025061746368206465736372697074696f6e00000000000000000000000000000000000000000000000000000000000000000000000000010000000000000003424344', 'hex'), 'ABCDAAAAAA'],
    ['AAAAAAAAAA', Buffer.from('5050463330025061746368206465736372697074696f6e0000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000942434445464748494a', 'hex'), 'ABCDEFGHIJ'],
    ['AAAAAAAAAAAAAAAAAAAA', Buffer.from('5050463330025061746368206465736372697074696f6e00000000000000000000000000000000000000000000000000000000000000000000000000010000000000000005424344454610000000000000000445454545', 'hex'), 'ABCDEFAAAAAAAAAAEEEE'],
  ])('should apply the patch #%#: %s', async (baseContents, patchContents, expectedContents) => {
    const rom = await writeTemp('ROM', baseContents);
    const patch = PPFPatch.patchFrom(await writeTemp('00000000 patch.ppf', patchContents));

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
