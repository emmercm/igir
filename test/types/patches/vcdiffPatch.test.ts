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
    Buffer.from(''),
    Buffer.from('  '),
    Buffer.from('foobar'),
  ])('should throw on bad patch: %s', async (patchContents) => {
    const patchFile = await writeTemp('patch.bps', patchContents);
    await expect(VcdiffPatch.patchFrom(patchFile)).rejects.toThrow(/couldn't parse/i);
  });

  test.each([
    [Buffer.from('55505331848480040e1d00a865327ee9b3a2041d35304d', 'hex'), '7e3265a8', '04a2b3e9'], // foo\n -> bar\n
    [Buffer.from('55505331868680051f01100036133a6ac346dd7c01770b14', 'hex'), '6a3a1336', '7cdd46c3'], // lorem\n -> ipsum\n
  ])('should find the CRC in the patch: %s', async (patchContents, expectedCrcBefore, expectedCrcAfter) => {
    const patchFile = await writeTemp('patch.bps', patchContents);
    const patch = VcdiffPatch.patchFrom(patchFile);
    expect(patch.getCrcBefore()).toEqual(expectedCrcBefore);
    expect(patch.getCrcAfter()).toEqual(expectedCrcAfter);
  });
});

describe('apply', () => {
  test.each([
    // Standard vcdiff with no secondary compression (xdelta3 -S -n -A ...)
    // ['AAAAA', Buffer.from('d6c3c40000000d0a000502014142434441061504', 'hex'), 'ABCDAAAAAA'],
    // ['AAAAAAAAAA', Buffer.from('d6c3c40000000d0a000502014142434441061504', 'hex'), 'ABCDAAAAAA'],
    // ['AAAAAAAAAA', Buffer.from('d6c3c4000000100a000a01004142434445464748494a0b', 'hex'), 'ABCDEFGHIJ'],
    // ['AAAAAAAAAAAAAAAAAAAA', Buffer.from('d6c3c40000001414000b0400414243444546414545454507000a05', 'hex'), 'ABCDEFAAAAAAAAAAEEEE'],
    // Secondary compression
    ['AAAAA', Buffer.from('d6c3c400050205422f2f412f04110a000502010e2f02914142434441061504', 'hex'), 'ABCDAAAAAA'],
    // ['AAAAAAAAAA', Buffer.from('d6c3c400050205422f2f412f04110a000502010e2f02914142434441061504', 'hex'), 'ABCDAAAAAA'],
    // ['AAAAAAAAAA', Buffer.from('d6c3c400050205422f2f412f04300a012601000ea602b80afd377a585a000000ff12d941020021010c0000008f98419c0100094142434445464748494a0b', 'hex'), 'ABCDEFGHIJ'],
    // ['AAAAAAAAAAAAAAAAAAAA', Buffer.from('d6c3c400050205422f2f412f04341401270400368305340bfd377a585a000000ff12d941020021010c0000008f98419c01000a414243444546414545454507000a05', 'hex'), 'ABCDEFAAAAAAAAAAEEEE'],
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
