import events from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import Temp from '../../src/globals/temp.js';
import FsUtil from '../../src/utils/fsUtil.js';
import isFileOpen from './isFileOpen.js';

if (!(await FsUtil.exists(Temp.getTempDir()))) {
  await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
}

describe('isFileOpen', () => {
  it('should return false for a file with nothing open', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const filePath = path.join(tempDir, 'file');
      await FsUtil.touch(filePath);
      await expect(isFileOpen(filePath)).resolves.toEqual(false);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });

  it('should return true while a file handle is open, and false once it is closed', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const filePath = path.join(tempDir, 'file');
      await FsUtil.touch(filePath);
      const handle = await fs.promises.open(filePath, 'r');
      try {
        await expect(isFileOpen(filePath)).resolves.toEqual(true);
      } finally {
        await handle.close();
      }
      await expect(isFileOpen(filePath)).resolves.toEqual(false);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });

  it('should return true while a descriptor is open for writing, and false once it is closed', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const filePath = path.join(tempDir, 'file');
      const descriptor = fs.openSync(filePath, 'w');
      try {
        await expect(isFileOpen(filePath)).resolves.toEqual(true);
      } finally {
        fs.closeSync(descriptor);
      }
      await expect(isFileOpen(filePath)).resolves.toEqual(false);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });

  it('should return true until every handle to the file is closed', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const filePath = path.join(tempDir, 'file');
      await FsUtil.touch(filePath);
      const first = await fs.promises.open(filePath, 'r');
      const second = await fs.promises.open(filePath, 'r');
      try {
        await first.close();
        await expect(isFileOpen(filePath)).resolves.toEqual(true);
      } finally {
        await second.close();
      }
      await expect(isFileOpen(filePath)).resolves.toEqual(false);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });

  it('should return true while a read stream is reading, and false once it emits close', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const filePath = path.join(tempDir, 'file');
      await FsUtil.writeFile(filePath, Buffer.alloc(64 * 1024));
      const readable = fs.createReadStream(filePath, { highWaterMark: 1024 });
      expect((await readable[Symbol.asyncIterator]().next()).done).toEqual(false);
      await expect(isFileOpen(filePath)).resolves.toEqual(true);

      const closed = events.once(readable, 'close');
      readable.destroy();
      await closed;
      await expect(isFileOpen(filePath)).resolves.toEqual(false);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });

  it('should return false for files other than the open one, including ones it is a prefix of', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const openPath = path.join(tempDir, 'file');
      const longerPath = path.join(tempDir, 'file.bak');
      const siblingPath = path.join(tempDir, 'other');
      await FsUtil.touch(openPath);
      await FsUtil.touch(longerPath);
      await FsUtil.touch(siblingPath);
      const handle = await fs.promises.open(openPath, 'r');
      try {
        await expect(
          Promise.all([isFileOpen(openPath), isFileOpen(longerPath), isFileOpen(siblingPath)]),
        ).resolves.toEqual([true, false, false]);
      } finally {
        await handle.close();
      }
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });

  it('should return true for a symlink to an open file', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const filePath = path.join(tempDir, 'file');
      const linkPath = path.join(tempDir, 'link');
      await FsUtil.touch(filePath);
      await FsUtil.symlink(filePath, linkPath);
      const handle = await fs.promises.open(filePath, 'r');
      try {
        await expect(isFileOpen(linkPath)).resolves.toEqual(true);
      } finally {
        await handle.close();
      }
      await expect(isFileOpen(linkPath)).resolves.toEqual(false);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });

  it('should return true for a file opened through a symlink', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const filePath = path.join(tempDir, 'file');
      const linkPath = path.join(tempDir, 'link');
      await FsUtil.touch(filePath);
      await FsUtil.symlink(filePath, linkPath);
      const handle = await fs.promises.open(linkPath, 'r');
      try {
        await expect(isFileOpen(filePath)).resolves.toEqual(true);
      } finally {
        await handle.close();
      }
      await expect(isFileOpen(filePath)).resolves.toEqual(false);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });

  it('should return true for an open file whose path has spaces and non-ASCII characters', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const filePath = path.join(tempDir, 'ümlaut 日本 (1).bin');
      await FsUtil.touch(filePath);
      const handle = await fs.promises.open(filePath, 'r');
      try {
        await expect(isFileOpen(filePath)).resolves.toEqual(true);
      } finally {
        await handle.close();
      }
      await expect(isFileOpen(filePath)).resolves.toEqual(false);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });

  it('should reject for a non-existent file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(isFileOpen(tempFile)).rejects.toThrow('ENOENT');
  });
});
