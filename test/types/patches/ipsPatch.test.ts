import fs from 'node:fs';
import path from 'node:path';

import Temp from '../../../src/globals/temp.js';
import bufferPoly from '../../../src/polyfill/bufferPoly.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import IPSPatch from '../../../src/types/patches/ipsPatch.js';

async function writeTemp(fileName: string, contents: string | Buffer): Promise<File> {
  const temp = await FsPoly.mktemp(path.join(Temp.getTempDir(), fileName));
  await FsPoly.mkdir(path.dirname(temp), { recursive: true });
  await FsPoly.writeFile(temp, contents);
  return File.fileOf({ filePath: temp });
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
    const file = await File.fileOf({ filePath });
    expect(() => IPSPatch.patchFrom(file)).toThrow(/couldn't parse/i);
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
    const file = await File.fileOf({ filePath });
    const patch = IPSPatch.patchFrom(file);
    expect(patch.getCrcBefore()).toEqual(expectedCrc);
  });
});

describe('apply', () => {
  test.each([
    // IPS
    ['AAAAAAAAAA', 'PATCH   BCDEOF', 'ABCDAAAAAA'],
    ['AAAAAAAAAA', 'PATCH   \tBCDEFGHIJEOF', 'ABCDEFGHIJ'],
    ['AAAAAAAAAAAAAAAAAAAA', 'PATCH   BCDEF     EEOF', 'ABCDEFAAAAAAAAAAEEEE'],
    // EBP
    [
      'AAAAAAAAAA',
      'PATCH   BCDEOF{"author": "", "title": "", "patcher": "EBPatcher", "description": ""}',
      'ABCDAAAAAA',
    ],
    [
      'AAAAAAAAAA',
      'PATCH   \tBCDEFGHIJEOF{"author": "", "title": "", "patcher": "EBPatcher", "description": ""}',
      'ABCDEFGHIJ',
    ],
    [
      'AAAAAAAAAAAAAAAAAAAA',
      'PATCH   BCDEF     EEOF{"author": "", "title": "", "patcher": "EBPatcher", "description": ""}',
      'ABCDEFAAAAAAAAAAEEEE',
    ],
    // IPS32
    ['AAAAAAAAAA', 'IPS32    BCDEEOF', 'ABCDAAAAAA'],
    ['AAAAAAAAAA', 'IPS32    \tBCDEFGHIJEEOF', 'ABCDEFGHIJ'],
    ['AAAAAAAAAAAAAAAAAAAA', 'IPS32    BCDEF    EEEEEEOF', 'ABCDEFAAAAAAAAAAEEEE'],
  ])('should apply the patch #%#: %s', async (baseContents, patchContents, expectedContents) => {
    const inputRom = await writeTemp('ROM', baseContents);
    const outputRom = await FsPoly.mktemp('ROM');
    const patchFile = await writeTemp('00000000 patch.ips', patchContents);

    const patch = IPSPatch.patchFrom(patchFile);
    try {
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
