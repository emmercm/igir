import path from 'node:path';

import Temp from '../../../src/globals/temp.js';
import File from '../../../src/models/files/file.js';
import { ChecksumBitmask } from '../../../src/models/files/fileChecksums.js';
import VcdiffPatch from '../../../src/models/patches/vcdiffPatch.js';
import FsUtil from '../../../src/utils/fsUtil.js';
import { applyPatch, INPUT16, parsePatch } from './patchTestUtil.js';

const patchFrom = VcdiffPatch.patchFrom.bind(VcdiffPatch);
const FILE_NAME = 'patch 00000000.xdelta';
const SWAP = '08090a0b0c0d0e0f0001020304050607';
const LZMA_ROM = path.join('test', 'fixtures', 'roms', 'patchable', 'lzma.rom');
const LZMA_PATCHES_DIR = path.join('test', 'fixtures', 'patches', 'lzma');

describe('patchFrom', () => {
  it('should parse', async () => {
    await expect(parsePatch(patchFrom, FILE_NAME, 'd6c3c40000')).resolves.toEqual({
      crcBefore: '00000000',
      crcAfter: undefined,
      sizeAfter: undefined,
    });
  });
});

describe('createPatchedFile', () => {
  test.each([
    [
      'add',
      'd6c3c4000000161000100100a0a1a2a3a4a5a6a7a8a9aaabacadaeaf11',
      'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf',
    ],
    ['run', 'd6c3c400000110000a1000010301aa14000c00', `00010203${'aa'.repeat(12)}`],
    ['copy self', 'd6c3c4000001100009100000020218180800', SWAP],
    ['copy here', 'd6c3c4000001100009100000020228280818', SWAP],
    [
      'copy near and same',
      'd6c3c400000110000d10000004041434447404040404',
      '0405060708090a0b0c0d0e0f04050607',
    ],
    ['copy from target', 'd6c3c40000000a1000020201abcd031e00', 'abcd'.repeat(8)],
    // Addresses past the source segment are this window's own output
    [
      'copy from target with a source',
      'd6c3c400000110000b1000000402130813080810',
      '08090a0b0c0d0e0f08090a0b0c0d0e0f',
    ],
    ['run after add', 'd6c3c40000000c0600030400aabbcc01020004', 'aabbcccccccc'],
    // A RUN of 70,000 bytes, then a COPY of all of them, more than one 64 KiB chunk
    [
      'copy from target larger than a chunk',
      'd6c3c40000001188c56000010801aa0084a2701384a27000',
      'aa'.repeat(140_000),
    ],
    ['grow', 'd6c3c400000110000e1400040401aabbccdd1310010400', `${INPUT16}aabbccdd`],
    [
      'vcd_target',
      'd6c3c40000000e0800080100a0a1a2a3a4a5a6a7090208000708000001011800',
      'a0a1a2a3a4a5a6a7a0a1a2a3a4a5a6a7',
    ],
    ['app header', 'd6c3c400040361626301100009100000020218180800', SWAP],
    ['adler32', 'd6c3c400000510000d100000020204b8007918180800', SWAP],
    // LZMA named in the header, but every window stored raw
    ['lzma, no compressed sections', 'd6c3c400010201100009100000020218180800', SWAP],
    // A code table delta that copies the default table unchanged
    [
      'identity code table',
      'd6c3c40002160403d6c3c40000018c00000a8c0000000301138c000001100009100000020218180800',
      SWAP,
    ],
    // The default table with inst1[0] (RUN) and inst1[1] (ADD) swapped, and s_near=5, s_same=2
    [
      'custom code table',
      'd6c3c40002190502d6c3c40000018c00000d8c0000020401010203138b7e02011000121000050602aabbccddee0004010474140800',
      'aabbccddeeeeeeee08090a0b00010203',
    ],
    // The same table with the default s_near=4, s_same=3, so COPY mode 6 is a same-cache mode
    [
      'custom code table, default caches',
      'd6c3c40002190403d6c3c40000018c00000d8c0000020401010203138b7e02011000121000050602aabbccddee0004010474140800',
      'aabbccddeeeeeeee0001020300010203',
    ],
    // LZMA and a code table together: the compressor ID comes before the code table
    [
      'lzma and custom code table',
      'd6c3c4000302190502d6c3c40000018c00000d8c0000020401010203138b7e02011000121000050602aabbccddee0004010474140800',
      'aabbccddeeeeeeee08090a0b00010203',
    ],
    // The code table delta has its own app header, "abc"
    [
      'custom code table with an app header',
      'd6c3c400021d0502d6c3c4000403616263018c00000d8c0000020401010203138b7e02011000121000050602aabbccddee0004010474140800',
      'aabbccddeeeeeeee08090a0b00010203',
    ],
    // The identity code table delta split into two windows, each copying 768 bytes of the source
    [
      'identity code table in two windows',
      'd6c3c40002260403d6c3c40000018600000a8600000003011386000001860086000a8600000003011386000001100009100000020218180800',
      SWAP,
    ],
    ['truncate', 'd6c3c400000110000708000001011800', '0001020304050607'],
    [
      'two windows truncate',
      'd6c3c4000001040807040000010114000104000704000001011400',
      '08090a0b00010203',
    ],
  ])('should apply: %s', async (_name, patchHex, expectedHex) => {
    await expect(applyPatch(patchFrom, FILE_NAME, patchHex, INPUT16)).resolves.toEqual(
      Buffer.from(expectedHex, 'hex'),
    );
  });

  test.each([
    ['bad header', 'd6c3c50000', /Vcdiff patch header is invalid/],
    ['a patch ending after its version', 'd6c3c400', /Vcdiff patch is truncated/],
    ['a patch ending before its compressor ID', 'd6c3c40001', /Vcdiff patch is truncated/],
    // A window whose target window size is missing, so it ends before its delta indicator
    ['a window ending before its delta indicator', 'd6c3c400000005', /Vcdiff patch is truncated/],
    // A window whose delta encoding length ends partway through its integer
    ['an integer cut short', 'd6c3c400000085', /Vcdiff patch is truncated/],
    // A target window size of 64 MiB + 1
    [
      'a window larger than the hard window size',
      'd6c3c400000005a0808001',
      /Vcdiff window target size 67108865 exceeds the hard window size of 67108864/,
    ],
    [
      'a code table delta ending after its version',
      'd6c3c40002060403d6c3c400',
      /Vcdiff patch is truncated/,
    ],
    ['DJW', 'd6c3c4000101', /Vcdiff secondary compressor DJW \(static Huffman\) isn't supported:/],
    [
      'FGK',
      'd6c3c4000110',
      /Vcdiff secondary compressor FGK \(adaptive Huffman\) isn't supported:/,
    ],
    ['compressor ID 0', 'd6c3c4000100', /unknown Vcdiff secondary compressor ID 0:/],
    ['compressor ID 3', 'd6c3c4000103', /unknown Vcdiff secondary compressor ID 3:/],
    ['code table length 0', 'd6c3c4000200', /Vcdiff code table length 0 is invalid/],
    ['code table length 1', 'd6c3c4000201', /Vcdiff code table length 1 is invalid/],
    ['code table length 2', 'd6c3c4000202', /Vcdiff code table length 2 is invalid/],
    ['truncated code table', 'd6c3c400020504', /Vcdiff patch is truncated/],
    [
      'a window ending before its data section',
      'd6c3c4000000050100010000',
      /Vcdiff patch is truncated/,
    ],
    // An ADD of 1 byte with an empty data section
    [
      'a data section ending early',
      'd6c3c400000006010000010002',
      /Vcdiff window's data section ends early/,
    ],
    // A HERE-mode COPY of 4 bytes from 5 bytes before the start of the target
    [
      'a COPY address before the start of the target',
      'd6c3c40000000704000001012405',
      /negative position -5/,
    ],
    [
      'a window ending partway through its ADLER32',
      'd6c3c4000004050000000000abcd',
      /Vcdiff patch is truncated/,
    ],
    [
      'code table delta decoding to 2 bytes',
      'd6c3c40002140403d6c3c40000018c0000080200020100010203',
      /Vcdiff code table decodes to 2 bytes, expected 1536/,
    ],
    // One window whose target is a RUN of 1537 bytes, one more than the code table string holds
    [
      'code table delta writing past the code table',
      'd6c3c40002130403d6c3c40000000a8c010001030000008c01',
      /Vcdiff code table delta writes past 1536 bytes/,
    ],
    [
      'code table delta with secondary compression',
      'd6c3c40002080403d6c3c4000102',
      /Vcdiff code table delta can't use secondary compression or another code table/,
    ],
    [
      'code table delta with a code table',
      'd6c3c40002080403d6c3c4000200',
      /Vcdiff code table delta can't use secondary compression or another code table/,
    ],
    [
      'code table instruction type 4',
      'd6c3c40002190502d6c3c40000018c00000d8c0000020401040203138b7e02',
      /Vcdiff code table entry 0 has an invalid instruction type 4/,
    ],
    // With s_near=0 and s_same=0 only modes 0 and 1 exist, and entry 51 is COPY mode 2
    [
      'code table COPY mode past the caches',
      'd6c3c40002190000d6c3c40000018c00000d8c0000020401010203138b7e02',
      /Vcdiff code table entry 51 has an invalid COPY mode 2/,
    ],
    [
      'DATACOMP without a compressor',
      'd6c3c4000000050101000000',
      /Vcdiff window sets compressed-section bits but the header names no secondary compressor/,
    ],
    [
      'INSTCOMP without a compressor',
      'd6c3c4000000050102000000',
      /Vcdiff window sets compressed-section bits but the header names no secondary compressor/,
    ],
    [
      'ADDRCOMP without a compressor',
      'd6c3c4000000050104000000',
      /Vcdiff window sets compressed-section bits but the header names no secondary compressor/,
    ],
    [
      'a compressed section size of 0',
      'd6c3c40001020006010101000000',
      /can't decompress Vcdiff data section: Vcdiff secondary-compressed section has an invalid size of 0/,
    ],
    [
      'a compressed section without an xz header',
      'd6c3c40001020007010102000001ff',
      /can't decompress Vcdiff data section: xz stream header is truncated/,
    ],
    // Declares 5 bytes, but the LZMA2 data holds 3
    [
      'a compressed section size mismatch',
      'd6c3c4000102002401011f000005fd377a585a000000ff12d9410200210116000000742fe5a3010002616263',
      /can't decompress Vcdiff data section: xz decoder produced 3 bytes, expected 5/,
    ],
  ])('should throw on %s', async (_name, patchHex, expectedError) => {
    await expect(applyPatch(patchFrom, FILE_NAME, patchHex, INPUT16)).rejects.toThrow(
      expectedError,
    );
  });

  test.each(['lzma-vcdiff c61fec0e.xdelta', 'lzma-vcdiff-window16k c61fec0e.xdelta'])(
    'should apply an xdelta3 LZMA patch: %s',
    async (patchName) => {
      const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
      try {
        const patch = patchFrom(
          await File.fileOf({ filePath: path.join(LZMA_PATCHES_DIR, patchName) }),
        );
        const outputPath = path.join(tempDir, 'output.rom');
        await patch.createPatchedFile(await File.fileOf({ filePath: LZMA_ROM }), outputPath);
        // The patched size and CRC32 in test/fixtures/dats/patchable.dat
        const outputFile = await File.fileOf({ filePath: outputPath }, ChecksumBitmask.CRC32);
        expect([outputFile.getSize(), outputFile.getCrc32()]).toEqual([65_536, '0fb88b39']);
      } finally {
        await FsUtil.rm(tempDir, { recursive: true, force: true });
      }
    },
  );

  it('should throw on an xdelta3 LZMA patch truncated partway through a compressed section', async () => {
    // The first 100 bytes end 49 bytes into the 126-byte compressed data section
    const patch = await FsUtil.readFile(path.join(LZMA_PATCHES_DIR, 'lzma-vcdiff c61fec0e.xdelta'));
    await expect(
      applyPatch(patchFrom, FILE_NAME, patch.subarray(0, 100).toString('hex'), INPUT16),
    ).rejects.toThrow(/Vcdiff patch is truncated/);
  });
});
