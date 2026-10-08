import IPSPatch from '../../../src/models/patches/ipsPatch.js';
import UPSPatch from '../../../src/models/patches/upsPatch.js';
import { withPatchFile } from './patchTestUtil.js';

const IPS_HEX = '5041544348454f46';

describe('getCrcBefore', () => {
  test.each([
    ['Game (USA) 0123ABCD.ips', '0123abcd'],
    ['0123abcd Game.ips', '0123abcd'],
    ['Game (0x0123abcd).ips', '0123abcd'],
    ['Game_0123abcd_v2.ips', '0123abcd'],
  ])('should parse the CRC from %s', async (fileName, expected) => {
    await withPatchFile(fileName, IPS_HEX, (file) => {
      expect(IPSPatch.patchFrom(file).getCrcBefore()).toEqual(expected);
    });
  });

  test.each(['Game.ips', 'Game 0123abcde.ips', 'Game x0123abcd.ips', 'Game 0123abc.ips'])(
    'should throw when %s has no CRC',
    async (fileName) => {
      await withPatchFile(fileName, IPS_HEX, (file) => {
        expect(() => IPSPatch.patchFrom(file)).toThrow(/couldn't parse base file CRC/);
      });
    },
  );
});

describe('getRomName', () => {
  test.each([
    ['Game (USA) 0123ABCD.ips', 'Game (USA)'],
    ['0123abcd Game.ips', 'Game'],
    ['Game  0123abcd  (Rev 1).ips', 'Game (Rev 1)'],
  ])('should strip the CRC from %s', async (fileName, expected) => {
    await withPatchFile(fileName, IPS_HEX, (file) => {
      expect(IPSPatch.patchFrom(file).getRomName()).toEqual(expected);
    });
  });
});

describe('toString', () => {
  it('should print an unknown CRC after and no size', async () => {
    await withPatchFile('Game 0123abcd.ips', IPS_HEX, (file) => {
      expect(IPSPatch.patchFrom(file).toString()).toEqual(
        `${file.toString()} (0123abcd → ????????)`,
      );
    });
  });

  it('should print the CRC after and the size', async () => {
    await withPatchFile(
      'patch.ups',
      '55505331909082ffff0084a90088e2cecec2109b1e863d5c67',
      async (file) => {
        expect((await UPSPatch.patchFrom(file)).toString()).toEqual(
          `${file.toString()} (cecee288 → 1e9b10c2, 16B)`,
        );
      },
    );
  });
});
