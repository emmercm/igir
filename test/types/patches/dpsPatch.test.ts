import path from 'node:path';

import Constants from '../../../src/constants.js';
import fsPoly from '../../../src/polyfill/fsPoly.js';
import File from '../../../src/types/files/file.js';
import DPSPatch from '../../../src/types/patches/dpsPatch.js';

// TODO(cemmer): igir.test.ts test fixtures

async function writeTemp(fileName: string, contents: string | Buffer): Promise<File> {
  const temp = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, fileName));
  await fsPoly.writeFile(temp, contents);
  return File.fileOf({ filePath: temp });
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

describe('apply', () => {
  // TODO(cemmer)
});
