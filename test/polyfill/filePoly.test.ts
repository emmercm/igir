import 'disposablestack/auto';

import path from 'node:path';

import Constants from '../../src/constants.js';
import filePoly from '../../src/polyfill/filePoly.js';
import fsPoly from '../../src/polyfill/fsPoly.js';

describe('fileOfSize', () => {
  it('should delete an existing file', async () => {
    await using disposableStack = new AsyncDisposableStack();

    const size = 8080;

    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'file'));
    disposableStack.defer(async () => fsPoly.rm(tempFile));
    await fsPoly.touch(tempFile);
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(true);

    await using file = await filePoly.fileOfSize(tempFile, 'r', size);
    expect(file.getPathLike()).toEqual(tempFile);
    await expect(fsPoly.size(tempFile)).resolves.toEqual(size);
  });

  test.each([1, 42, 226, 1337, 8_675_309])('should create a file of size: %s', async (size) => {
    await using disposableStack = new AsyncDisposableStack();

    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'file'));
    disposableStack.defer(async () => fsPoly.rm(tempFile));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);

    await using file = await filePoly.fileOfSize(tempFile, 'r', size);
    expect(file.getPathLike()).toEqual(tempFile);
    await expect(fsPoly.size(tempFile)).resolves.toEqual(size);
  });
});

describe('readAt', () => {
  it('should read a small file', async () => {
    await using disposableStack = new AsyncDisposableStack();

    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'file'));
    disposableStack.defer(async () => fsPoly.rm(tempFile));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);

    await using file = await filePoly.fileOfSize(tempFile, 'r', Constants.MAX_MEMORY_FILE_SIZE - 1);
    await expect(file.readAt(0, 16)).resolves.toEqual(Buffer.alloc(16));
  });

  it('should read a large file', async () => {
    await using disposableStack = new AsyncDisposableStack();

    const tempFile = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'file'));
    disposableStack.defer(async () => fsPoly.rm(tempFile));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);

    await using file = await filePoly.fileOfSize(tempFile, 'r', Constants.MAX_MEMORY_FILE_SIZE + 1);
    await expect(file.readAt(0, 16)).resolves.toEqual(Buffer.alloc(16));
  });
});
