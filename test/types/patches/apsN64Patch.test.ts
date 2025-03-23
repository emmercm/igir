import fs from 'node:fs';
import path from 'node:path';

import Temp from '../../../src/globals/temp.js';
import bufferPoly from '../../../src/polyfill/bufferPoly.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import APSN64Patch from '../../../src/types/patches/apsN64Patch.js';
import APSPatch from '../../../src/types/patches/apsPatch.js';

async function writeTemp(fileName: string, contents: string | Buffer): Promise<File> {
  const temp = await FsPoly.mktemp(path.join(Temp.getTempDir(), fileName));
  await FsPoly.mkdir(path.dirname(temp), { recursive: true });
  await FsPoly.writeFile(temp, contents);
  return File.fileOf({ filePath: temp });
}

describe('constructor', () => {
  test.each([
    // Non-existent
    'foo.aps',
    'fizz/buzz.aps',
    // Invalid
    'ABCDEFGH Blazgo.aps',
    'ABCD12345 Bangarang.aps',
    'Bepzinky 1234567.aps',
  ])('should throw if no CRC found: %s', async (filePath) => {
    const file = await File.fileOf({ filePath });
    await expect(APSN64Patch.patchFrom(file)).rejects.toThrow(/couldn't parse/i);
  });

  test.each([
    // APSN64PatchType.SIMPLE
    [
      Buffer.from(
        '415053313000006e6f206465736372697074696f6e000000000000000000000000000000000000000000000000000000000000000000000000040000000000000003626172',
        'hex',
      ),
      '7e3265a8',
      '04a2b3e9',
    ], // foo\n -> bar\n
    [
      Buffer.from(
        '415053313000006e6f206465736372697074696f6e00000000000000000000000000000000000000000000000000000000000000000000000006000000000000000469707375',
        'hex',
      ),
      '6a3a1336',
      '7cdd46c3',
    ], // lorem\n -> ipsum\n
    // APSN64PatchType.N64
    // TODO(cemmer): test
  ])('should find the CRC in the patch: %s', async (patchContents, expectedCrcBefore) => {
    const patchFile = await writeTemp(`patch ${expectedCrcBefore}.aps`, patchContents);
    const patch = await APSPatch.patchFrom(patchFile);
    expect(patch.getCrcBefore()).toEqual(expectedCrcBefore);
  });
});

describe('apply', () => {
  test.each([
    // APSN64PatchType.SIMPLE
    [
      'AAAAA',
      Buffer.from(
        '415053313000006e6f206465736372697074696f6e0000000000000000000000000000000000000000000000000000000000000000000000000a000000010000000342434405000000004105',
        'hex',
      ),
      'ABCDAAAAAA',
    ],
    [
      'AAAAAAAAAA',
      Buffer.from(
        '415053313000006e6f206465736372697074696f6e0000000000000000000000000000000000000000000000000000000000000000000000000a0000000100000003424344',
        'hex',
      ),
      'ABCDAAAAAA',
    ],
    [
      'AAAAAAAAAA',
      Buffer.from(
        '415053313000006e6f206465736372697074696f6e0000000000000000000000000000000000000000000000000000000000000000000000000a000000010000000942434445464748494a',
        'hex',
      ),
      'ABCDEFGHIJ',
    ],
    [
      'AAAAAAAAAAAAAAAAAAAA',
      Buffer.from(
        '415053313000006e6f206465736372697074696f6e000000000000000000000000000000000000000000000000000000000000000000000000140000000100000005424344454610000000004504',
        'hex',
      ),
      'ABCDEFAAAAAAAAAAEEEE',
    ],
    // APSN64PatchType.N64
    // TODO(cemmer): test
  ])('should apply the patch #%#: %s', async (baseContents, patchContents, expectedContents) => {
    const inputRom = await writeTemp('ROM', baseContents);
    const outputRom = await FsPoly.mktemp('ROM');
    const patchFile = await writeTemp('patch 00000000.aps', patchContents);

    try {
      const patch = await APSPatch.patchFrom(patchFile);
      await patch.createPatchedFile(inputRom, outputRom);
      const actualContents = (
        await bufferPoly.fromReadable(fs.createReadStream(outputRom))
      ).toString();
      expect(actualContents).toEqual(expectedContents);
    } finally {
      await FsPoly.rm(inputRom.getFilePath());
      await FsPoly.rm(outputRom);
      await FsPoly.rm(patchFile.getFilePath());
    }
  });
});
