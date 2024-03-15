import path from 'node:path';

import Constants from '../../../src/constants.js';
import fsPoly from '../../../src/polyfill/fsPoly.js';
import Rar from '../../../src/types/files/archives/rar.js';
import SevenZip from '../../../src/types/files/archives/sevenZip.js';
import Tar from '../../../src/types/files/archives/tar.js';
import Zip from '../../../src/types/files/archives/zip.js';
import FileFactory from '../../../src/types/files/fileFactory.js';

describe('filesFrom', () => {
  it('should not throw when the file doesn\'t exist', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'file'));
    await expect(FileFactory.filesFrom(tempFile)).resolves.toEqual([]);
  });

  test.each([...new Set([
    ...Zip.SUPPORTED_EXTENSIONS,
    ...Tar.SUPPORTED_EXTENSIONS,
    ...Rar.SUPPORTED_EXTENSIONS,
    ...SevenZip.SUPPORTED_EXTENSIONS,
  ])])('should not throw when the archive doesn\'t exist: %s', async (extension) => {
    const tempFile = (await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'file'))) + extension;
    await expect(FileFactory.filesFrom(tempFile)).resolves.toEqual([]);
  });
});
