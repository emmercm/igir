import { ZipReader } from '@igir/zip';

import FsPoly from '../../../src/polyfill/fsPoly.js';
import TZValidator from '../src/tzValidator.js';

const fixtures = (await FsPoly.walk('/Users/cemmer/Downloads/ROMVault_V3.7.2/RomRoot')).filter(
  (filePath) => filePath.endsWith('.zip'),
);

test.each(fixtures)('%s', async (filePath) => {
  const validated = await TZValidator.validate(new ZipReader(filePath));
  expect(validated).toEqual(true);
});
