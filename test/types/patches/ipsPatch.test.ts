import fs from 'fs';
import path from 'path';

import Constants from '../../../src/constants.js';
import bufferPoly from '../../../src/polyfill/bufferPoly.js';
import fsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import IPSPatch from '../../../src/types/patches/ipsPatch.js';

async function writeTemp(fileName: string, contents: string | Buffer): Promise<File> {
  const temp = fsPoly.mktempSync(path.join(Constants.GLOBAL_TEMP_DIR, fileName));
  const stream = fs.createWriteStream(temp);
  stream.write(contents);
  stream.close();
  return File.fileOf(temp);
}

describe('constructor', () => {
  test.each([
    // Non-existent
    'foo.ips',
    'fizz/buzz.ips',
    // Invalid
    'ABCDEFGH Blazgo.ips',
    'ABCD12345 Bangarang.ips',
    'Bepzinky 1234567.ips',
  ])('should throw if no CRC found: %s', async (filePath) => {
    const file = await File.fileOf(filePath, 0, '00000000');
    expect(() => new IPSPatch(file)).toThrow(/couldn't parse/i);
  });

  test.each([
    // Beginning
    ['ABCD1234-Foo.ips', 'ABCD1234'],
    ['Fizz/bcde2345_Buzz.ips', 'BCDE2345'],
    ['One/Two/cdef3456 Three.ips', 'CDEF3456'],
    // End
    ['Lorem+9876FEDC.ips', '9876FEDC'],
    ['Ipsum#8765edcb.ips', '8765EDCB'],
    ['Dolor 7654dcba.ips', '7654DCBA'],
  ])('should find the CRC in the filename: %s', async (filePath, expectedCrc) => {
    const file = await File.fileOf(filePath, 0, '00000000');
    const patch = new IPSPatch(file);
    expect(patch.getCrcBefore()).toEqual(expectedCrc);
  });
});

describe('apply', () => {
  test.each([
    ['AAAAAAAAAA', 'PATCH   BCDEOF', 'ABCDAAAAAA'],
    ['AAAAAAAAAA', 'PATCH   \tBCDEFGHIJEOF', 'ABCDEFGHIJ'],
    ['AAAAAAAAAAAAAAAAAAAA', 'PATCH   BCDEF     EEOF', 'ABCDEFAAAAAAAAAAEEEE'],
  ])('should apply the patch: %s', async (baseContents, patchContents, expectedContents) => {
    const rom = await writeTemp('ROM', baseContents);
    const patch = new IPSPatch(await writeTemp('00000000 Patch', patchContents));

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
