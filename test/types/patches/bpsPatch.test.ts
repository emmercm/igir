import fs from 'node:fs';
import path from 'node:path';

import Temp from '../../../src/globals/temp.js';
import bufferPoly from '../../../src/polyfill/bufferPoly.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import BPSPatch from '../../../src/types/patches/bpsPatch.js';

async function writeTemp(fileName: string, contents: string | Buffer): Promise<File> {
  const temp = await FsPoly.mktemp(path.join(Temp.getTempDir(), fileName));
  await FsPoly.mkdir(path.dirname(temp), { recursive: true });
  await FsPoly.writeFile(temp, contents);
  return await File.fileOf({ filePath: temp });
}

describe('constructor', () => {
  test.each([Buffer.from(''), Buffer.from('  '), Buffer.from('foobar')])(
    'should throw on bad patch: %s',
    async (patchContents) => {
      const patchFile = await writeTemp('patch.bps', patchContents);
      await expect(BPSPatch.patchFrom(patchFile)).rejects.toThrow();
    },
  );

  test.each([
    [
      Buffer.from('425053318484808962617280a865327ee9b3a2042222711f', 'hex'),
      '7e3265a8',
      '04a2b3e9',
    ], // foo\n -> bar\n
    [
      Buffer.from('425053318686808d697073758436133a6ac346dd7cfacd6672', 'hex'),
      '6a3a1336',
      '7cdd46c3',
    ], // lorem\n -> ipsum\n
  ])(
    'should find the CRC in the patch: %s',
    async (patchContents, expectedCrcBefore, expectedCrcAfter) => {
      const patchFile = await writeTemp('patch.bps', patchContents);
      const patch = await BPSPatch.patchFrom(patchFile);
      expect(patch.getCrcBefore()).toEqual(expectedCrcBefore);
      expect(patch.getCrcAfter()).toEqual(expectedCrcAfter);
    },
  );
});

describe('apply', () => {
  test.each([
    [
      'AAAAA',
      Buffer.from('42505331858a808d41424344928081410951f819d0c41e6e3b7546b5', 'hex'),
      'ABCDAAAAAA',
    ],
    [
      'AAAAAAAAAA',
      Buffer.from('425053318a8a808d4142434494cfd08e47d0c41e6ef0540044', 'hex'),
      'ABCDAAAAAA',
    ],
    [
      'AAAAAAAAAA',
      Buffer.from('425053318a8a80a54142434445464748494acfd08e47056d1e3225e07029', 'hex'),
      'ABCDEFGHIJ',
    ],
    [
      'AAAAAAAAAAAAAAAAAAAA',
      Buffer.from('4250533194948095414243444546a48d45454545c518201d686456eb69a20342', 'hex'),
      'ABCDEFAAAAAAAAAAEEEE',
    ],
  ])('should apply the patch #%#: %s', async (baseContents, patchContents, expectedContents) => {
    const inputRom = await writeTemp('ROM', baseContents);
    const outputRom = await FsPoly.mktemp('ROM');
    const patchFile = await writeTemp('patch.bps', patchContents);

    try {
      const patch = await BPSPatch.patchFrom(patchFile);
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
