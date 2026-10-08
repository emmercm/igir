import IPSPatch from '../../../src/models/patches/ipsPatch.js';
import { applyPatch, INPUT16, parsePatch } from './patchTestUtil.js';

const patchFrom = IPSPatch.patchFrom.bind(IPSPatch);
const EBP_JSON = '7b2270617463686572223a22454250617463686572227d'; // {"patcher":"EBPatcher"}

describe('patchFrom', () => {
  test.each(['patch 0123abcd.ips', 'patch 0123abcd.ips32', 'patch 0123abcd.ebp'])(
    'should parse %s',
    async (fileName) => {
      await expect(parsePatch(patchFrom, fileName, '5041544348454f46')).resolves.toEqual({
        crcBefore: '0123abcd',
        crcAfter: undefined,
        sizeAfter: undefined,
      });
    },
  );
});

describe('createPatchedFile', () => {
  test.each([
    [
      'record',
      'patch 00000000.ips',
      '50415443480000020002aabb454f46',
      '0001aabb0405060708090a0b0c0d0e0f',
    ],
    [
      'rle',
      'patch 00000000.ips',
      '504154434800000400000003cc454f46',
      '00010203cccccc0708090a0b0c0d0e0f',
    ],
    ['grow', 'patch 00000000.ips', '50415443480000100002eeff454f46', `${INPUT16}eeff`],
    [
      'no eof',
      'patch 00000000.ips',
      '50415443480000020002aabb',
      '0001aabb0405060708090a0b0c0d0e0f',
    ],
    [
      'truncate',
      'patch 00000000.ips',
      '50415443480000020002aabb454f4600000c',
      '0001aabb0405060708090a0b',
    ],
    // Like Flips, a truncation size past the end doesn't extend the output
    ['truncate past the end', 'patch 00000000.ips', '5041544348454f46000014', INPUT16],
    [
      'truncate a grown file',
      'patch 00000000.ips',
      '50415443480000100002eeff454f46000011',
      `${INPUT16}ee`,
    ],
    [
      'record past truncation',
      'patch 00000000.ips',
      '504154434800000e0004aabbccdd454f4600000c',
      '000102030405060708090a0b',
    ],
    [
      'ips32 record',
      'patch 00000000.ips32',
      '4950533332000000020002aabb45454f46',
      '0001aabb0405060708090a0b0c0d0e0f',
    ],
    [
      'ips32 rle',
      'patch 00000000.ips32',
      '49505333320000000400000003cc45454f46',
      '00010203cccccc0708090a0b0c0d0e0f',
    ],
    [
      'ebp json',
      'patch 00000000.ebp',
      `50415443480000020002aabb454f46${EBP_JSON}`,
      '0001aabb0405060708090a0b0c0d0e0f',
    ],
    [
      'ebp 3-byte json',
      'patch 00000000.ebp',
      '50415443480000020002aabb454f46226122',
      '0001aabb0405060708090a0b0c0d0e0f',
    ],
  ])('should apply: %s', async (_name, fileName, patchHex, expectedHex) => {
    await expect(applyPatch(patchFrom, fileName, patchHex, INPUT16)).resolves.toEqual(
      Buffer.from(expectedHex, 'hex'),
    );
  });

  it('should apply an ips32 record at an offset past 0xFFFFFF', async () => {
    const expected = Buffer.alloc(0x1_00_00_01);
    Buffer.from(INPUT16, 'hex').copy(expected);
    expected[0x1_00_00_00] = 0xaa;

    const actual = await applyPatch(
      patchFrom,
      'patch 00000000.ips32',
      '4950533332010000000001aa45454f46',
      INPUT16,
    );
    // Compare the buffers directly, a 16 MiB hex string is slow to build and to diff
    expect(actual.equals(expected)).toEqual(true);
  });

  test.each([['patch 00000000.ips', '5041544358454f46', /IPS patch header is invalid/]])(
    'should throw on %s',
    async (fileName, patchHex, expectedError) => {
      await expect(applyPatch(patchFrom, fileName, patchHex, INPUT16)).rejects.toThrow(
        expectedError,
      );
    },
  );
});
