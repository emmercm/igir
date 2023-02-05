import path from 'path';

import Constants from '../../src/constants.js';
import filePoly from '../../src/polyfill/filePoly.js';
import fsPoly from '../../src/polyfill/fsPoly.js';

describe('fileOfSize', () => {
  it('should delete an existing file', async () => {
    const size = 8080;

    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'file'));
    await fsPoly.touch(tempFile);
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(true);

    try {
      await (await filePoly.fileOfSize(tempFile, 'r', size)).close();
      await expect(fsPoly.size(tempFile)).resolves.toEqual(size);
    } finally {
      await fsPoly.rm(tempFile);
    }
  });

  test.each([1, 42, 226, 1337, 8675309])('should create a file of size: %s', async (size) => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'file'));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);

    try {
      await (await filePoly.fileOfSize(tempFile, 'r', size)).close();
      await expect(fsPoly.size(tempFile)).resolves.toEqual(size);
    } finally {
      await fsPoly.rm(tempFile);
    }
  });
});
