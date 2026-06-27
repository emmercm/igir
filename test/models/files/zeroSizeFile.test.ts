import path from 'node:path';

import Temp from '../../../src/globals/temp.js';
import ZeroSizeFile from '../../../src/models/files/zeroSizeFile.js';
import BufferUtil from '../../../src/utils/bufferUtil.js';
import FsUtil from '../../../src/utils/fsUtil.js';

describe('extractToFile', () => {
  it('should extract to specified path', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const tempFile = await FsUtil.mktemp(path.join(tempDir, 'temp'));
      await ZeroSizeFile.getInstance().extractToFile(tempFile);
      await expect(FsUtil.exists(tempFile)).resolves.toEqual(true);
      await expect(FsUtil.size(tempFile)).resolves.toEqual(0);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('extractToTempFile', () => {
  it('should extract to a random path', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const didAssert = await ZeroSizeFile.getInstance().extractToTempFile(async (tempFile) => {
        await expect(FsUtil.exists(tempFile)).resolves.toEqual(true);
        await expect(FsUtil.size(tempFile)).resolves.toEqual(0);
        return true;
      });
      expect(didAssert).toEqual(true);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('extractAndTransformToFile', () => {
  it('should extract to specified path', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const tempFile = await FsUtil.mktemp(path.join(tempDir, 'temp'));
      await ZeroSizeFile.getInstance().extractAndTransformToFile(tempFile);
      await expect(FsUtil.exists(tempFile)).resolves.toEqual(true);
      await expect(FsUtil.size(tempFile)).resolves.toEqual(0);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('createReadStream', () => {
  it('should create a readable of length zero', async () => {
    const contents = await ZeroSizeFile.getInstance().createReadStream(
      async (readable) => await BufferUtil.fromReadable(readable),
    );
    expect(contents).toBeDefined();
    expect(contents).toHaveLength(0);
  });
});

describe('createTransformedReadStream', () => {
  it('should create a readable of length zero', async () => {
    const contents = await ZeroSizeFile.getInstance().createTransformedReadStream(
      async (readable) => await BufferUtil.fromReadable(readable),
    );
    expect(contents).toBeDefined();
    expect(contents).toHaveLength(0);
  });
});
