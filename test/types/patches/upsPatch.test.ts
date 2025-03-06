import fs from 'node:fs';
import path from 'node:path';

import Temp from '../../../src/globals/temp.js';
import bufferPoly from '../../../src/polyfill/bufferPoly.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import UPSPatch from '../../../src/types/patches/upsPatch.js';

async function writeTemp(fileName: string, contents: string | Buffer): Promise<File> {
  const temp = await FsPoly.mktemp(path.join(Temp.getTempDir(), fileName));
  await FsPoly.mkdir(path.dirname(temp), { recursive: true });
  await FsPoly.writeFile(temp, contents);
  return File.fileOf({ filePath: temp });
}

describe('constructor', () => {
  test.each([Buffer.from(''), Buffer.from('  '), Buffer.from('foobar')])(
    'should throw on bad patch: %s',
    async (patchContents) => {
      const patchFile = await writeTemp('patch.bps', patchContents);
      await expect(UPSPatch.patchFrom(patchFile)).rejects.toThrow();
    },
  );

  test.each([
    [Buffer.from('55505331848480040e1d00a865327ee9b3a2041d35304d', 'hex'), '7e3265a8', '04a2b3e9'], // foo\n -> bar\n
    [
      Buffer.from('55505331868680051f01100036133a6ac346dd7c01770b14', 'hex'),
      '6a3a1336',
      '7cdd46c3',
    ], // lorem\n -> ipsum\n
  ])(
    'should find the CRC in the patch: %s',
    async (patchContents, expectedCrcBefore, expectedCrcAfter) => {
      const patchFile = await writeTemp('patch.bps', patchContents);
      const patch = await UPSPatch.patchFrom(patchFile);
      expect(patch.getCrcBefore()).toEqual(expectedCrcBefore);
      expect(patch.getCrcAfter()).toEqual(expectedCrcAfter);
    },
  );
});

describe('apply', () => {
  test.each([
    [
      'AAAAA',
      Buffer.from('55505331858a8103020500804141414141000951f819d0c41e6e6a87f622', 'hex'),
      'ABCDAAAAAA',
    ],
    [
      'AAAAAAAAAA',
      Buffer.from('555053318a8a8103020500cfd08e47d0c41e6e697b65ac', 'hex'),
      'ABCDAAAAAA',
    ],
    [
      'AAAAAAAAAA',
      Buffer.from('555053318a8a8103020504070609080b00cfd08e47056d1e320b1badb2', 'hex'),
      'ABCDEFGHIJ',
    ],
    [
      'AAAAAAAAAAAAAAAAAAAA',
      Buffer.from('55505331949481030205040700890404040400c518201d686456eb1cb4af39', 'hex'),
      'ABCDEFAAAAAAAAAAEEEE',
    ],
  ])('should apply the patch #%#: %s', async (baseContents, patchContents, expectedContents) => {
    const inputRom = await writeTemp('ROM', baseContents);
    const outputRom = await FsPoly.mktemp('ROM');
    const patchFile = await writeTemp('patch.bps', patchContents);

    try {
      const patch = await UPSPatch.patchFrom(patchFile);
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
