import path from 'node:path';

import Temp from '../../../src/globals/temp.js';
import ZeroSizeFile from '../../../src/models/files/zeroSizeFile.js';
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
      const result = await ZeroSizeFile.getInstance().extractToTempFile(async (tempFile) => {
        await expect(FsUtil.exists(tempFile)).resolves.toEqual(true);
        await expect(FsUtil.size(tempFile)).resolves.toEqual(0);
        return true;
      });
      expect(result).toEqual(true);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('extractAndPatchToFile', () => {
  it('should extract to specified path', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const tempFile = await FsUtil.mktemp(path.join(tempDir, 'temp'));
      await ZeroSizeFile.getInstance().extractAndPatchToFile(tempFile);
      await expect(FsUtil.exists(tempFile)).resolves.toEqual(true);
      await expect(FsUtil.size(tempFile)).resolves.toEqual(0);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('createReadStream', () => {
  it('should create a readable of length zero', async () => {
    const contents = await ZeroSizeFile.getInstance().createReadStream(async (readable) => {
      const chunks: Buffer[] = [];
      for await (const chunk of readable as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    });
    expect(contents).toBeDefined();
    expect(contents).toHaveLength(0);
  });
});

describe('createPatchedReadStream', () => {
  it('should create a readable of length zero', async () => {
    const contents = await ZeroSizeFile.getInstance().createPatchedReadStream(async (readable) => {
      const chunks: Buffer[] = [];
      for await (const chunk of readable as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    });
    expect(contents).toBeDefined();
    expect(contents).toHaveLength(0);
  });
});
