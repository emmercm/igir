import fs from 'node:fs';
import path from 'node:path';

import Temp from '../../../src/globals/temp.js';
import File from '../../../src/models/files/file.js';
import { ChecksumBitmask } from '../../../src/models/files/fileChecksums.js';
import BSDiffPatch from '../../../src/models/patches/bsdiffPatch.js';
import bufferUtil from '../../../src/utils/bufferUtil.js';
import FsUtil from '../../../src/utils/fsUtil.js';

async function writeTemp(fileName: string, contents: string | Buffer): Promise<File> {
  const temp = await FsUtil.mktemp(path.join(Temp.getTempDir(), fileName));
  await FsUtil.mkdir(path.dirname(temp), { recursive: true });
  await FsUtil.writeFile(temp, contents);
  return await File.fileOf({ filePath: temp });
}

// 'AAAAAAAAAA' -> 'ABCDXYZAAAA'
const VALID_PATCH = Buffer.from(
  '42534449464634302e0000000000000029000000000000000b00000000000000425a6839314159265359828e02b000000ae0005c000800200030cd00c6502e64acd783c5dc914e142420a380ac00425a683931415926535934eb9ed0000002c00078002000219a68334d125cf17724538509034eb9ed00425a683931415926535973a4077700000002000070200021981984617724538509073a407770',
  'hex',
);

describe('patchFrom', () => {
  test.each([
    // Non-existent
    'foo.bdf',
    'fizz/buzz.bsdiff',
    // Invalid
    'ABCDEFGH Blazgo.bdf',
    'ABCD12345 Bangarang.bdf',
    'Bepzinky 1234567.bdf',
  ])('should throw if no CRC found: %s', async (filePath) => {
    const file = await File.fileOf({ filePath });
    await expect(BSDiffPatch.patchFrom(file)).rejects.toThrow(/couldn't parse/i);
  });

  test.each([
    // Too short
    Buffer.from(''),
    Buffer.from('BSDIFF40'),
    // Wrong magic
    Buffer.concat([Buffer.from('BSDIFF41'), VALID_PATCH.subarray(8)]),
    // Negative control block length
    Buffer.concat([
      VALID_PATCH.subarray(0, 15),
      Buffer.from([VALID_PATCH[15] | 0x80]),
      VALID_PATCH.subarray(16),
    ]),
    // Block lengths extend past the end of the patch
    Buffer.concat([
      VALID_PATCH.subarray(0, 8),
      Buffer.from('ffffff0000000000', 'hex'),
      VALID_PATCH.subarray(16),
    ]),
  ])('should throw on invalid patch header: %#', async (patchContents) => {
    const patchFile = await writeTemp('ABCD1234 patch.bdf', patchContents);
    try {
      await expect(BSDiffPatch.patchFrom(patchFile)).rejects.toThrow(/invalid/i);
    } finally {
      await FsUtil.rm(patchFile.getFilePath());
    }
  });

  test.each([
    // Beginning
    ['ABCD1234-Foo.bdf', 'abcd1234'],
    ['Fizz/bcde2345_Buzz.bsdiff', 'bcde2345'],
    ['One/Two/cdef3456 Three.bdf', 'cdef3456'],
    // End
    ['Lorem+9876FEDC.bdf', '9876fedc'],
    ['Ipsum#8765edcb.bsdiff', '8765edcb'],
    ['Dolor 7654dcba.bdf', '7654dcba'],
  ])('should find the CRC in the filename: %s', async (fileName, expectedCrc) => {
    const patchFile = await writeTemp(fileName, VALID_PATCH);
    try {
      const patch = await BSDiffPatch.patchFrom(patchFile);
      expect(patch.getCrcBefore()).toEqual(expectedCrc);
      expect(patch.getCrcAfter()).toBeUndefined();
      expect(patch.getSizeAfter()).toEqual(11);
    } finally {
      await FsUtil.rm(patchFile.getFilePath());
    }
  });

  test('should read the fixture', async () => {
    const patchFile = await File.fileOf({
      filePath: path.join('test', 'fixtures', 'patches', 'BSDiffed b1c303e4.bdf'),
    });
    const patch = await BSDiffPatch.patchFrom(patchFile);
    expect(patch.getCrcBefore()).toEqual('b1c303e4');
    expect(patch.getCrcAfter()).toBeUndefined();
    expect(patch.getSizeAfter()).toEqual(1094);
  });
});

describe('createPatchedFile', () => {
  test.each([
    [
      'write past new size',
      'AAAA',
      '4253444946463430290000000000000025000000000000000400000000000000425a6839314159265359b8ad553b000002600040400800200030cc0cf505ce2ee48a70a121715aaa76425a683931415926535996fb44a60000004000440020002100828317724538509096fb44a6425a683917724538509000000000',
    ],
    [
      'negative diff length',
      'AAAA',
      '42534449464634302b000000000000000e000000000000000400000000000000425a6839314159265359902f7b9600000440407004400020002183419a0854c88e2ee48a70a121205ef72c425a683917724538509000000000425a683917724538509000000000',
    ],
    [
      'control block too short',
      'AAAA',
      '4253444946463430290000000000000025000000000000000400000000000000425a6839314159265359a90cb8a1000002600050000800200030cc0cf505ce2ee48a70a12152197142425a6839314159265359ff489b82000000c00040002000211846c2ee48a70a121fe9137040425a683917724538509000000000',
    ],
    [
      'diff block too short',
      'AAAA',
      '4253444946463430290000000000000025000000000000000400000000000000425a68393141592653595a2ce8ba000002600044000800200030cc0cf505ce2ee48a70a120b459d174425a6839314159265359ff489b82000000c00040002000211846c2ee48a70a121fe9137040425a683917724538509000000000',
    ],
  ])('should throw on corrupt patch: %s', async (_name, baseContents, patchHex) => {
    const inputRom = await writeTemp('ROM', baseContents);
    const outputRom = await FsUtil.mktemp('ROM');
    const patchFile = await writeTemp('00000000 patch.bdf', Buffer.from(patchHex, 'hex'));

    try {
      const patch = await BSDiffPatch.patchFrom(patchFile);
      await expect(patch.createPatchedFile(inputRom, outputRom)).rejects.toThrow(/corrupt/i);
    } finally {
      await FsUtil.rm(inputRom.getFilePath());
      await FsUtil.rm(outputRom, { force: true });
      await FsUtil.rm(patchFile.getFilePath());
    }
  });

  test('should throw on corrupt bzip2 data', async () => {
    const corruptedPatch = Buffer.from(VALID_PATCH);
    corruptedPatch[32 + 20] ^= 0xff; // inside the control block's compressed data
    const inputRom = await writeTemp('ROM', 'AAAAAAAAAA');
    const outputRom = await FsUtil.mktemp('ROM');
    const patchFile = await writeTemp('00000000 patch.bdf', corruptedPatch);

    try {
      const patch = await BSDiffPatch.patchFrom(patchFile);
      await expect(patch.createPatchedFile(inputRom, outputRom)).rejects.toThrow();
    } finally {
      await FsUtil.rm(inputRom.getFilePath());
      await FsUtil.rm(outputRom, { force: true });
      await FsUtil.rm(patchFile.getFilePath());
    }
  });

  test.each([
    // Diff block, extra block, and a forward seek
    ['AAAAAAAAAA', VALID_PATCH.toString('hex'), 'ABCDXYZAAAA'],
    // Backward seek
    [
      'ABCDEFGHIJ',
      '42534449464634302f0000000000000025000000000000000a00000000000000425a6839314159265359e060176c00000760405208080040002000212460300f5c21cacb85dc914e1424381805db00425a68393141592653596e1651c7000000400041002000210082831772453850906e1651c7425a683917724538509000000000',
      'ABCDEABCDE',
    ],
    // Diff reads past the end of the old file
    [
      'ABC',
      '4253444946463430290000000000000028000000000000000500000000000000425a68393141592653590c837508000002600042000800200030cc0cf505ce2ee48a70a1201906ea10425a68393141592653599fce129a000000440040000600200021981984ec2ee48a70a1213f9c2534425a683917724538509000000000',
      'ABCDE',
    ],
    // Diff reads before the start of the old file
    [
      'ABC',
      '4253444946463430300000000000000028000000000000000400000000000000425a6839314159265359a2660d3b000000e040540408004000200021a7a980c008df250a2b85dc914e14242899834ec0425a683931415926535983aa2677000001420040000060200021981984cc2ee48a70a12107544cee425a683917724538509000000000',
      'XYAB',
    ],
  ])('should apply the patch #%#: %s', async (baseContents, patchHex, expectedContents) => {
    const inputRom = await writeTemp('ROM', baseContents);
    const outputRom = await FsUtil.mktemp('ROM');
    const patchFile = await writeTemp('00000000 patch.bdf', Buffer.from(patchHex, 'hex'));

    try {
      const patch = await BSDiffPatch.patchFrom(patchFile);
      await patch.createPatchedFile(inputRom, outputRom);
      const actualContents = (
        await bufferUtil.fromReadable(fs.createReadStream(outputRom))
      ).toString();
      expect(actualContents).toEqual(expectedContents);
    } finally {
      await FsUtil.rm(inputRom.getFilePath());
      await FsUtil.rm(outputRom);
      await FsUtil.rm(patchFile.getFilePath());
    }
  });

  test('should apply the fixture', async () => {
    const inputRom = await File.fileOf({
      filePath: path.join('test', 'fixtures', 'roms', 'patchable', 'KDULVQN.rom'),
    });
    const patchFile = await File.fileOf({
      filePath: path.join('test', 'fixtures', 'patches', 'BSDiffed b1c303e4.bdf'),
    });
    const outputRom = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'ROM'));

    try {
      const patch = await BSDiffPatch.patchFrom(patchFile);
      const progress: number[] = [];
      await patch.createPatchedFile(inputRom, outputRom, (bytes) => {
        progress.push(bytes);
      });

      const outputFile = await File.fileOf({ filePath: outputRom }, ChecksumBitmask.CRC32);
      expect(outputFile.getSize()).toEqual(1094);
      expect(outputFile.getCrc32()).toEqual('b8dcf2b0');
      expect(progress.at(-1)).toEqual(1094);
    } finally {
      await FsUtil.rm(outputRom);
    }
  });
});
