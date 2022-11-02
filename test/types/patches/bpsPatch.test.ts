import fs, { promises as fsPromises } from 'fs';
import path from 'path';

import Constants from '../../../src/constants.js';
import bufferPoly from '../../../src/polyfill/bufferPoly.js';
import fsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import BPSPatch from '../../../src/types/patches/bpsPatch.js';

async function writeTemp(fileName: string, contents: string | Buffer): Promise<File> {
  const temp = fsPoly.mktempSync(path.join(Constants.GLOBAL_TEMP_DIR, fileName));
  await fsPromises.writeFile(temp, contents);
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
    await expect(BPSPatch.patchFrom(file)).rejects.toThrow(/couldn't parse/i);
  });

  test.each([
    // Beginning
    ['ABCD1234-Foo.ips', 'abcd1234'],
    ['Fizz/bcde2345_Buzz.ips', 'bcde2345'],
    ['One/Two/cdef3456 Three.ips', 'cdef3456'],
    // End
    ['Lorem+9876FEDC.ips', '9876fedc'],
    ['Ipsum#8765edcb.ips', '8765edcb'],
    ['Dolor 7654dcba.ips', '7654dcba'],
  ])('should find the CRC in the filename: %s', async (filePath, expectedCrc) => {
    const file = await File.fileOf(filePath, 0, '00000000');
    const patch = await BPSPatch.patchFrom(file);
    expect(patch.getCrcBefore()).toEqual(expectedCrc);
  });
});

describe('apply', () => {
  test.each([
    ['AAAAAAAAAA', Buffer.from('425053318a8a808d4142434494cfd08e47d0c41e6ef0540044', 'hex'), 'ABCDAAAAAA'],
    ['AAAAAAAAAA', Buffer.from('425053318a8a80a54142434445464748494acfd08e47056d1e3225e07029', 'hex'), 'ABCDEFGHIJ'],
    ['AAAAAAAAAAAAAAAAAAAA', Buffer.from('4250533194948095414243444546a48d45454545c518201d686456eb69a20342', 'hex'), 'ABCDEFAAAAAAAAAAEEEE'],
  ])('should apply the patch: %s', async (baseContents, patchContents, expectedContents) => {
    const rom = await writeTemp('ROM', baseContents);
    const patch = await BPSPatch.patchFrom(await writeTemp('00000000 Patch', patchContents));

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
