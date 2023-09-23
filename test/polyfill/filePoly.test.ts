import path from 'node:path';

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
      const file = await filePoly.fileOfSize(tempFile, 'r', size);
      await file.close();
      expect(file.getPathLike()).toEqual(tempFile);
      await expect(fsPoly.size(tempFile)).resolves.toEqual(size);
    } finally {
      await fsPoly.rm(tempFile);
    }
  });

  test.each([1, 42, 226, 1337, 8_675_309])('should create a file of size: %s', async (size) => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'file'));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);

    try {
      const file = await filePoly.fileOfSize(tempFile, 'r', size);
      await file.close();
      expect(file.getPathLike()).toEqual(tempFile);
      await expect(fsPoly.size(tempFile)).resolves.toEqual(size);
    } finally {
      await fsPoly.rm(tempFile);
    }
  });
});

describe('readAt', () => {
  it('should read a small file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'file'));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);

    try {
      const file = await filePoly.fileOfSize(tempFile, 'r', Constants.MAX_MEMORY_FILE_SIZE - 1);
      await expect(file.readAt(0, 16)).resolves.toEqual(Buffer.alloc(16));
      await file.close();
    } finally {
      await fsPoly.rm(tempFile);
    }
  });

  it('should read a large file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'file'));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);

    try {
      const file = await filePoly.fileOfSize(tempFile, 'r', Constants.MAX_MEMORY_FILE_SIZE + 1);
      await expect(file.readAt(0, 16)).resolves.toEqual(Buffer.alloc(16));
      await file.close();
    } finally {
      await fsPoly.rm(tempFile);
    }
  });
});
