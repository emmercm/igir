import path from 'node:path';

import Temp from '../../../src/globals/temp.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import ZeroSizeFile from '../../../src/types/files/zeroSizeFile.js';

describe('extractToFile', () => {
  it('should extract to specified path', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      const tempFile = await FsPoly.mktemp(path.join(tempDir, 'temp'));
      await ZeroSizeFile.getInstance().extractToFile(tempFile);
      await expect(FsPoly.exists(tempFile)).resolves.toEqual(true);
      await expect(FsPoly.size(tempFile)).resolves.toEqual(0);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('extractToTempFile', () => {
  it('should extract to a random path', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      const result = await ZeroSizeFile.getInstance().extractToTempFile(async (tempFile) => {
        await expect(FsPoly.exists(tempFile)).resolves.toEqual(true);
        await expect(FsPoly.size(tempFile)).resolves.toEqual(0);
        return true;
      });
      expect(result).toEqual(true);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('extractAndPatchToFile', () => {
  it('should extract to specified path', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      const tempFile = await FsPoly.mktemp(path.join(tempDir, 'temp'));
      await ZeroSizeFile.getInstance().extractAndPatchToFile(tempFile);
      await expect(FsPoly.exists(tempFile)).resolves.toEqual(true);
      await expect(FsPoly.size(tempFile)).resolves.toEqual(0);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('createReadStream', () => {
  it('should create a readable of length zero', async () => {
    const contents = await ZeroSizeFile.getInstance().createReadStream(
      async (readable) =>
        new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          readable.on('data', (chunk: Buffer) => chunks.push(chunk));
          readable.on('end', () => {
            resolve(Buffer.concat(chunks));
          });
          readable.on('error', reject);
        }),
    );
    expect(contents).toBeDefined();
    expect(contents).toHaveLength(0);
  });
});

describe('createPatchedReadStream', () => {
  it('should create a readable of length zero', async () => {
    const contents = await ZeroSizeFile.getInstance().createPatchedReadStream(
      async (readable) =>
        new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          readable.on('data', (chunk: Buffer) => chunks.push(chunk));
          readable.on('end', () => {
            resolve(Buffer.concat(chunks));
          });
          readable.on('error', reject);
        }),
    );
    expect(contents).toBeDefined();
    expect(contents).toHaveLength(0);
  });
});
