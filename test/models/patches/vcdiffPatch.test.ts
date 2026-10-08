import VcdiffPatch from '../../../src/models/patches/vcdiffPatch.js';
import { applyPatch, INPUT16, parsePatch } from './patchTestUtil.js';

const patchFrom = VcdiffPatch.patchFrom.bind(VcdiffPatch);
const FILE_NAME = 'patch 00000000.xdelta';
const SWAP = '08090a0b0c0d0e0f0001020304050607';

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
    ['grow', 'd6c3c400000110000e1400040401aabbccdd1310010400', `${INPUT16}aabbccdd`],
    [
      'vcd_target',
      'd6c3c40000000e0800080100a0a1a2a3a4a5a6a7090208000708000001011800',
      'a0a1a2a3a4a5a6a7a0a1a2a3a4a5a6a7',
    ],
    ['app header', 'd6c3c400040361626301100009100000020218180800', SWAP],
    ['adler32', 'd6c3c400000510000d100000020204b8007918180800', SWAP],
    ['empty code table', 'd6c3c40003000001100009100000020218180800', SWAP],
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
    ['secondary compression', 'd6c3c4000102', /unsupported Vcdiff secondary decompressor LZMA/],
    [
      'application-defined code table',
      'd6c3c4000201',
      /can't parse Vcdiff application-defined code table/,
    ],
    ['DATACOMP', 'd6c3c4000000050101000000', /DATACOMP/],
    ['INSTCOMP', 'd6c3c4000000050102000000', /INSTCOMP/],
    ['ADDRCOMP', 'd6c3c4000000050104000000', /ADDRCOMP/],
  ])('should throw on %s', async (_name, patchHex, expectedError) => {
    await expect(applyPatch(patchFrom, FILE_NAME, patchHex, INPUT16)).rejects.toThrow(
      expectedError,
    );
  });
});
