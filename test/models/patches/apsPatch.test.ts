import APSGBAPatch from '../../../src/models/patches/apsGbaPatch.js';
import APSN64Patch from '../../../src/models/patches/apsN64Patch.js';
import APSPatch from '../../../src/models/patches/apsPatch.js';
import { withPatchFile } from './patchTestUtil.js';

describe('patchFrom', () => {
  test.each([
    ['n64 simple', `415053313000${'00'.repeat(51)}10000000`, APSN64Patch.name, 16],
    ['n64 n64', `415053313001${'00'.repeat(68)}14000000`, APSN64Patch.name, 20],
    ['gba', '41505331100000000c000000', APSGBAPatch.name, 12],
    // "APS10" followed by a type other than 0 or 1 isn't an N64 patch
    ['gba that starts like n64', '41505331300200000c000000', APSGBAPatch.name, 12],
  ])('should dispatch %s', async (_name, patchHex, expectedClassName, expectedSize) => {
    await withPatchFile('patch 0123abcd.aps', patchHex, async (file) => {
      const patch = await APSPatch.patchFrom(file);
      expect({
        className: patch.constructor.name,
        crcBefore: patch.getCrcBefore(),
        crcAfter: patch.getCrcAfter(),
        sizeAfter: patch.getSizeAfter(),
      }).toEqual({
        className: expectedClassName,
        crcBefore: '0123abcd',
        crcAfter: undefined,
        sizeAfter: expectedSize,
      });
    });
  });
});
