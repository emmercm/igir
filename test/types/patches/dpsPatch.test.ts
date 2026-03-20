import fs from 'node:fs';
import path from 'node:path';

import Temp from '../../../src/globals/temp.js';
import bufferPoly from '../../../src/polyfill/bufferPoly.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import DPSPatch from '../../../src/types/patches/dpsPatch.js';

// TODO(cemmer): igir.test.ts test fixtures

async function writeTemp(fileName: string, contents: string | Buffer): Promise<File> {
  const temp = await FsPoly.mktemp(path.join(Temp.getTempDir(), fileName));
  await FsPoly.mkdir(path.dirname(temp), { recursive: true });
  await FsPoly.writeFile(temp, contents);
  return await File.fileOf({ filePath: temp });
}

function buildDpsPatch(
  romSize: number,
  records: (
    | { mode: 0; outputOffset: number; inputOffset: number; inputLength: number }
    | { mode: 1; outputOffset: number; data: Buffer }
  )[],
): Buffer {
  const header = Buffer.alloc(198);
  // name (64), author (64), version (64), flag (1), dps version (1) are all zero-filled
  header.writeUInt32LE(romSize, 194); // after 190 bytes of strings, flag, and version

  const recordBuffers: Buffer[] = records.map((record) => {
    if (record.mode === 0) {
      const buf = Buffer.alloc(13);
      buf.writeUInt8(0, 0);
      buf.writeUInt32LE(record.outputOffset, 1);
      buf.writeUInt32LE(record.inputOffset, 5);
      buf.writeUInt32LE(record.inputLength, 9);
      return buf;
    } else {
      const buf = Buffer.alloc(9 + record.data.length);
      buf.writeUInt8(1, 0);
      buf.writeUInt32LE(record.outputOffset, 1);
      buf.writeUInt32LE(record.data.length, 5);
      record.data.copy(buf, 9);
      return buf;
    }
  });

  return Buffer.concat([header, ...recordBuffers]);
}

describe('constructor', () => {
  test.each([
    // Non-existent
    'foo.dps',
    'fizz/buzz.dps',
    // Invalid
    'ABCDEFGH Blazgo.dps',
    'ABCD12345 Bangarang.dps',
    'Bepzinky 1234567.dps',
  ])('should throw if no CRC found: %s', async (filePath) => {
    const file = await File.fileOf({ filePath });
    expect(() => DPSPatch.patchFrom(file)).toThrow(/couldn't parse/i);
  });

  test.each([
    [Buffer.from('foo', 'hex'), '7e3265a8', '04a2b3e9'], // foo\n -> bar\n
    [Buffer.from('foo', 'hex'), '6a3a1336', '7cdd46c3'], // lorem\n -> ipsum\n
  ])('should find the CRC in the patch: %s', async (patchContents, expectedCrcBefore) => {
    const patchFile = await writeTemp(`patch ${expectedCrcBefore}.bps`, patchContents);
    const patch = DPSPatch.patchFrom(patchFile);
    expect(patch.getCrcBefore()).toEqual(expectedCrcBefore);
  });
});

describe('createPatchedFile', () => {
  it('should throw on invalid ROM size', async () => {
    // Given a ROM that is 5 bytes, but the patch expects 10 bytes
    const baseContents = 'AAAAA';
    const patchBuffer = buildDpsPatch(10, []);

    const inputRom = await writeTemp('ROM', baseContents);
    const outputRom = await FsPoly.mktemp('ROM');
    const patchFile = await writeTemp('patch 00000000.dps', patchBuffer);

    try {
      const patch = DPSPatch.patchFrom(patchFile);
      await expect(patch.createPatchedFile(inputRom, outputRom)).rejects.toThrow();
    } finally {
      await FsPoly.rm(inputRom.getFilePath());
      await FsPoly.rm(outputRom, { force: true });
      await FsPoly.rm(patchFile.getFilePath());
    }
  });

  it('should apply a copy-from-source record (mode 0)', async () => {
    // Given a ROM "ABCDE" (5 bytes)
    const baseContents = 'ABCDE';
    // Patch copies bytes [0..2] from the source to output offset 2
    const patchBuffer = buildDpsPatch(5, [
      { mode: 0, outputOffset: 2, inputOffset: 0, inputLength: 3 },
    ]);

    const inputRom = await writeTemp('ROM', baseContents);
    const outputRom = await FsPoly.mktemp('ROM');
    const patchFile = await writeTemp('patch 00000000.dps', patchBuffer);

    try {
      const patch = DPSPatch.patchFrom(patchFile);
      await patch.createPatchedFile(inputRom, outputRom);

      // Bytes at [2..4] are now "ABC" (copied from source [0..2])
      const actualContents = (
        await bufferPoly.fromReadable(fs.createReadStream(outputRom))
      ).toString();
      expect(actualContents).toEqual('ABABC');
    } finally {
      await FsPoly.rm(inputRom.getFilePath());
      await FsPoly.rm(outputRom, { force: true });
      await FsPoly.rm(patchFile.getFilePath());
    }
  });

  it('should apply a literal data record (mode 1)', async () => {
    // Given a ROM "AAAAA" (5 bytes)
    const baseContents = 'AAAAA';
    // Patch replaces bytes at offset 1 with "BCD" (3 bytes literal)
    const patchBuffer = buildDpsPatch(5, [{ mode: 1, outputOffset: 1, data: Buffer.from('BCD') }]);

    const inputRom = await writeTemp('ROM', baseContents);
    const outputRom = await FsPoly.mktemp('ROM');
    const patchFile = await writeTemp('patch 00000000.dps', patchBuffer);

    try {
      const patch = DPSPatch.patchFrom(patchFile);
      await patch.createPatchedFile(inputRom, outputRom);

      const actualContents = (
        await bufferPoly.fromReadable(fs.createReadStream(outputRom))
      ).toString();
      expect(actualContents).toEqual('ABCDA');
    } finally {
      await FsPoly.rm(inputRom.getFilePath());
      await FsPoly.rm(outputRom, { force: true });
      await FsPoly.rm(patchFile.getFilePath());
    }
  });
});
