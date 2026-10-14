import fs from 'node:fs';
import path from 'node:path';

import Defaults from '../../../src/globals/defaults.js';
import Temp from '../../../src/globals/temp.js';
import IOFile from '../../../src/models/files/ioFile.js';
import FsUtil from '../../../src/utils/fsUtil.js';

if (!(await FsUtil.exists(Temp.getTempDir()))) {
  await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
}

/** Bytes that differ from their neighbors, so misplaced reads and copies are caught */
const patterned = (size: number): Buffer =>
  Buffer.from(Array.from({ length: size }, (_value, idx) => (idx * 7 + 3) & 0xff));

describe('fileOfSize', () => {
  it('should delete an existing file', async () => {
    const size = 8080;

    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.touch(tempFile);
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(true);

    try {
      const file = await IOFile.fileOfSize(tempFile, 'r', size);
      await file.close();
      expect(file.getPathLike()).toEqual(tempFile);
      await expect(FsUtil.size(tempFile)).resolves.toEqual(size);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  test.each([1, 42, 226, 1337, 8_675_309])('should create a file of size: %s', async (size) => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(false);

    try {
      const file = await IOFile.fileOfSize(tempFile, 'r', size);
      await file.close();
      expect(file.getPathLike()).toEqual(tempFile);
      await expect(FsUtil.size(tempFile)).resolves.toEqual(size);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should close the file handle even if sizing fails', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    vi.spyOn(IOFile.prototype, 'truncate').mockRejectedValue(new Error('truncate failed'));
    const closeSpy = vi.spyOn(IOFile.prototype, 'close');

    try {
      await expect(IOFile.fileOfSize(tempFile, 'r', 16)).rejects.toThrow('truncate failed');
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(tempFile, { force: true });
    }
  });
});

describe('getSize', () => {
  const filesWithSizes = [
    [path.join('test', 'fixtures', 'roms', 'raw', 'empty.rom'), 0],
    [path.join('test', 'fixtures', 'roms', 'raw', 'fizzbuzz.nes'), 9],
    [path.join('test', 'fixtures', 'roms', 'raw', 'foobar.lnx'), 7],
    [path.join('test', 'fixtures', 'roms', 'raw', 'loremipsum.rom'), 11],
  ] satisfies [string, number][];

  test.each(filesWithSizes)('should get size of raw file: %s', async (filePath, expectedSize) => {
    const file = await IOFile.fileFrom(filePath, 'r');
    try {
      expect(file.getSize()).toEqual(expectedSize);
    } finally {
      await file.close();
    }
  });

  test.each(filesWithSizes)(
    'should get size of symlinked file: %s',
    async (filePath, expectedSize) => {
      const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
      await FsUtil.copyFile(filePath, tempFile);
      const tempSymlink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'symlink'));
      await FsUtil.symlink(path.resolve(tempFile), tempSymlink);

      const file = await IOFile.fileFrom(tempSymlink, 'r');
      try {
        expect(file.getSize()).toEqual(expectedSize);
      } finally {
        await file.close();
        await FsUtil.rm(tempSymlink);
        await FsUtil.rm(tempFile);
      }
    },
  );

  test.each(filesWithSizes)(
    'should get size of hard linked file: %s',
    async (filePath, expectedSize) => {
      const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
      await FsUtil.copyFile(filePath, tempFile);
      const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
      await FsUtil.hardlink(tempFile, tempLink);

      const file = await IOFile.fileFrom(tempLink, 'r');
      try {
        expect(file.getSize()).toEqual(expectedSize);
      } finally {
        await file.close();
        await FsUtil.rm(tempLink);
        await FsUtil.rm(tempFile);
      }
    },
  );
});

describe('readNext', () => {
  it('should read from the beginning', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCDEF0123456789');

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      await expect(file.readNext(2)).resolves.toEqual(Buffer.from('AB'));
      await expect(file.readNext(3)).resolves.toEqual(Buffer.from('CDE'));
      await expect(file.readNext(4)).resolves.toEqual(Buffer.from('F012'));
    } finally {
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });

  it('should respect seek', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCDEF0123456789');

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      await expect(file.readNext(2)).resolves.toEqual(Buffer.from('AB'));
      await expect(file.readNext(3)).resolves.toEqual(Buffer.from('CDE'));
      file.seek(0);
      await expect(file.readNext(4)).resolves.toEqual(Buffer.from('ABCD'));
    } finally {
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });

  it('should respect skipNext', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCDEF0123456789');

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      await expect(file.readNext(2)).resolves.toEqual(Buffer.from('AB'));
      await expect(file.readNext(3)).resolves.toEqual(Buffer.from('CDE'));
      file.skipNext(4);
      await expect(file.readNext(5)).resolves.toEqual(Buffer.from('34567'));
    } finally {
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });
});

describe('readUntil', () => {
  it('should read up to the delimiter and advance past it', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, Buffer.from([1, 2, 3, 0, 0, 4, 5]));

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      await expect(file.readUntil(0, 100)).resolves.toEqual({
        data: Buffer.from([1, 2, 3]),
        delimiterFound: true,
      });
      await expect(file.readUntil(0, 100)).resolves.toEqual({
        data: Buffer.alloc(0),
        delimiterFound: true,
      });
      await expect(file.readUntil(0, 100)).resolves.toEqual({
        data: Buffer.from([4, 5]),
        delimiterFound: false,
      });
      expect(file.getPosition()).toEqual(7);
    } finally {
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });

  it('should not read past the max size', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, Buffer.from([1, 2, 3, 0]));

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      await expect(file.readUntil(0, 2)).resolves.toEqual({
        data: Buffer.from([1, 2]),
        delimiterFound: false,
      });
      expect(file.getPosition()).toEqual(2);
    } finally {
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });

  it('should read at most a chunk at a time', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(
      tempFile,
      Buffer.concat([Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE + 10, 1), Buffer.from([0])]),
    );

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      await expect(file.readUntil(0, file.getSize())).resolves.toEqual({
        data: Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE, 1),
        delimiterFound: false,
      });
      await expect(file.readUntil(0, file.getSize())).resolves.toEqual({
        data: Buffer.alloc(10, 1),
        delimiterFound: true,
      });
      expect(file.getPosition()).toEqual(file.getSize());
    } finally {
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });
});

describe('readAt', () => {
  test.each([
    ['smaller than the cache', Defaults.MAX_IO_FILE_CACHE_SIZE - 1],
    ['larger than the cache', Defaults.MAX_IO_FILE_CACHE_SIZE * 2 + 100],
  ])('should read a file %s', async (_name, size) => {
    const contents = patterned(size);
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, contents);

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      // Read the start, then the end, which evicts the start of larger files, then the start again
      await expect(file.readAt(0, 16)).resolves.toEqual(contents.subarray(0, 16));
      await expect(file.readAt(size - 16, 16)).resolves.toEqual(contents.subarray(size - 16));
      await expect(file.readAt(0, 16)).resolves.toEqual(contents.subarray(0, 16));
    } finally {
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });

  it('should read across pages', async () => {
    const contents = patterned(Defaults.FILE_READING_CHUNK_SIZE * 3);
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, contents);

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      const position = Defaults.FILE_READING_CHUNK_SIZE - 10;
      const size = Defaults.FILE_READING_CHUNK_SIZE + 20;
      await expect(file.readAt(position, size)).resolves.toEqual(
        contents.subarray(position, position + size),
      );
    } finally {
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });

  it('should read fewer bytes at the end of the file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCDEF');

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      await expect(file.readAt(4, 16)).resolves.toEqual(Buffer.from('EF'));
      await expect(file.readAt(6, 16)).resolves.toEqual(Buffer.alloc(0));
      await expect(file.readAt(100, 16)).resolves.toEqual(Buffer.alloc(0));
    } finally {
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });

  it('should not read past the end of the file when a page extends past it', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      const ioFile = await IOFile.fileOfSize(tempFile, 'r+', 16);
      // Writing past the end allocates more of the memory buffer than was written
      await ioFile.writeAt(Buffer.from('ff', 'hex'), 16);
      await expect(ioFile.readAt(0, 64)).resolves.toEqual(
        Buffer.from(`${'00'.repeat(16)}ff`, 'hex'),
      );
      await expect(ioFile.readAt(20, 4)).resolves.toEqual(Buffer.alloc(0));
      await ioFile.close();
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });
});

describe('write', () => {
  describe('file mode: r', () => {
    it('should throw on write', async () => {
      const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));

      try {
        const file = await IOFile.fileOfSize(tempFile, 'r', 16);
        await expect(file.write(Buffer.from('ABCDEF01'))).rejects.toThrow();
        await file.close();

        const contents = await FsUtil.readFile(tempFile);
        expect(contents).toEqual(
          Buffer.from(
            '\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}',
          ),
        );
      } finally {
        await FsUtil.rm(tempFile);
      }
    });
  });

  describe.each(['r+', 'a'])('file mode: %s', (openMode) => {
    it('should overwrite contents', async () => {
      const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));

      try {
        const file = await IOFile.fileOfSize(tempFile, openMode, 16);
        await file.write(Buffer.from('ABCDEF01'));
        await file.close();

        const contents = await FsUtil.readFile(tempFile);
        expect(contents).toEqual(Buffer.from('ABCDEF01\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}'));
      } finally {
        await FsUtil.rm(tempFile);
      }
    });

    it('should extend the file size', async () => {
      const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));

      try {
        const file = await IOFile.fileOfSize(tempFile, openMode, 4);
        await file.write(Buffer.from('ABCDEF01'));
        expect(file.getSize()).toEqual(8);
        await file.close();

        const contents = await FsUtil.readFile(tempFile);
        expect(contents).toEqual(Buffer.from('ABCDEF01'));
      } finally {
        await FsUtil.rm(tempFile);
      }
    });
  });
});

describe('writeAt', () => {
  describe('file mode: r', () => {
    it('should throw on write', async () => {
      const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));

      try {
        const file = await IOFile.fileOfSize(tempFile, 'r', 16);
        await expect(file.writeAt(Buffer.from('ABCDEF01'), 4)).rejects.toThrow();
        await file.close();

        const contents = await FsUtil.readFile(tempFile);
        expect(contents).toEqual(
          Buffer.from(
            '\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}',
          ),
        );
      } finally {
        await FsUtil.rm(tempFile);
      }
    });
  });

  describe.each(['r+', 'a'])('file mode: %s', (openMode) => {
    it('should overwrite contents', async () => {
      const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));

      try {
        const file = await IOFile.fileOfSize(tempFile, openMode, 16);
        await file.writeAt(Buffer.from('ABCDEF01'), 6);
        await file.close();

        const contents = await FsUtil.readFile(tempFile);
        expect(contents).toEqual(Buffer.from('\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}ABCDEF01\u{0}\u{0}'));
      } finally {
        await FsUtil.rm(tempFile);
      }
    });

    it('should extend the file size', async () => {
      const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));

      try {
        const file = await IOFile.fileOfSize(tempFile, openMode, 4);
        await file.writeAt(Buffer.from('ABCDEF01'), 6);
        expect(file.getSize()).toEqual(14);
        await file.close();

        const contents = await FsUtil.readFile(tempFile);
        expect(contents).toEqual(Buffer.from('\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}ABCDEF01'));
      } finally {
        await FsUtil.rm(tempFile);
      }
    });
  });

  it('should grow a file by only the bytes written past its end', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      const ioFile = await IOFile.fileOfSize(tempFile, 'r+', 16);
      await ioFile.writeAt(Buffer.from('ff', 'hex'), 16);
      expect(ioFile.getSize()).toEqual(17);
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(
        Buffer.from(`${'00'.repeat(16)}ff`, 'hex'),
      );
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should grow a file larger than the cache', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      await FsUtil.writeFile(tempFile, Buffer.from('00010203', 'hex'));
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      await ioFile.writeAt(Buffer.from('ff', 'hex'), Defaults.MAX_IO_FILE_CACHE_SIZE + 1);
      expect(ioFile.getSize()).toEqual(Defaults.MAX_IO_FILE_CACHE_SIZE + 2);
      await ioFile.close();

      await expect(FsUtil.size(tempFile)).resolves.toEqual(Defaults.MAX_IO_FILE_CACHE_SIZE + 2);
      const readFile = await IOFile.fileFrom(tempFile, 'r');
      try {
        await expect(readFile.readAt(0, 8)).resolves.toEqual(
          Buffer.from('0001020300000000', 'hex'),
        );
        await expect(readFile.readAt(Defaults.MAX_IO_FILE_CACHE_SIZE - 1, 16)).resolves.toEqual(
          Buffer.from('0000ff', 'hex'),
        );
      } finally {
        await readFile.close();
      }
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should keep writes to pages evicted from the cache', async () => {
    const pageSize = Defaults.FILE_READING_CHUNK_SIZE;
    const pageCount = (Defaults.MAX_IO_FILE_CACHE_SIZE / pageSize) * 2;
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      await FsUtil.writeFile(tempFile, Buffer.alloc(pageCount * pageSize));
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      // Write the page index to the start of every page, more pages than the cache holds
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        await ioFile.writeAt(Buffer.from([pageIndex & 0xff]), pageIndex * pageSize);
      }
      // The first pages were evicted, so they're read back from disk
      await expect(ioFile.readAt(0, 1)).resolves.toEqual(Buffer.from([0]));
      await expect(ioFile.readAt(pageSize, 1)).resolves.toEqual(Buffer.from([1]));
      await ioFile.close();

      const contents = await FsUtil.readFile(tempFile);
      expect(contents.length).toEqual(pageCount * pageSize);
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        expect(contents[pageIndex * pageSize]).toEqual(pageIndex & 0xff);
      }
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should stage writes in memory until the file is closed', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE * 2));
    const open = fs.promises.open.bind(fs.promises);
    const openedHandles: fs.promises.FileHandle[] = [];
    vi.spyOn(fs.promises, 'open').mockImplementation(async (pathLike, flags) => {
      const handle = await open(pathLike, flags);
      openedHandles.push(handle);
      return handle;
    });

    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      const write = vi.spyOn(openedHandles[0], 'write');
      const writev = vi.spyOn(openedHandles[0], 'writev');
      // Many small writes across two pages
      for (let position = 0; position < Defaults.FILE_READING_CHUNK_SIZE * 2; position += 1024) {
        await ioFile.writeAt(Buffer.from([0xff]), position);
      }
      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(
        Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE * 2),
      );
      await ioFile.close();

      // Both pages were written to disk together
      expect(write).toHaveBeenCalledTimes(0);
      expect(writev).toHaveBeenCalledTimes(1);
      const expected = Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE * 2);
      for (let position = 0; position < expected.length; position += 1024) {
        expected[position] = 0xff;
      }
      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(expected);
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(tempFile);
    }
  });

  it('should not read pages from disk that are entirely overwritten', async () => {
    const pageSize = Defaults.FILE_READING_CHUNK_SIZE;
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, Buffer.alloc(pageSize * 3));
    const open = fs.promises.open.bind(fs.promises);
    const openedHandles: fs.promises.FileHandle[] = [];
    vi.spyOn(fs.promises, 'open').mockImplementation(async (pathLike, flags) => {
      const handle = await open(pathLike, flags);
      openedHandles.push(handle);
      return handle;
    });

    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      const read = vi.spyOn(openedHandles[0], 'read');
      // Overwrites the second page entirely, but only part of the first and third pages
      const contents = patterned(pageSize + 20);
      await ioFile.writeAt(contents, pageSize - 10);
      expect(read).toHaveBeenCalledTimes(2);
      await expect(ioFile.readAt(pageSize - 10, contents.length)).resolves.toEqual(contents);
      await ioFile.close();

      const written = await FsUtil.readFile(tempFile);
      expect(written.subarray(pageSize - 10, pageSize + 10 + pageSize)).toEqual(contents);
      expect(written.subarray(0, pageSize - 10)).toEqual(Buffer.alloc(pageSize - 10));
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(tempFile);
    }
  });

  it('should read and write concurrently', async () => {
    const pageSize = Defaults.FILE_READING_CHUNK_SIZE;
    const pageCount = (Defaults.MAX_IO_FILE_CACHE_SIZE / pageSize) * 2;
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, Buffer.alloc(pageCount * pageSize));

    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      // More pages than the cache holds, so pages are evicted while other operations wait
      await Promise.all(
        Array.from(
          { length: pageCount },
          async (_value, pageIndex) =>
            await ioFile.writeAt(Buffer.from([pageIndex & 0xff, 0xff]), pageIndex * pageSize + 1),
        ),
      );
      const reads = await Promise.all(
        Array.from(
          { length: pageCount },
          async (_value, pageIndex) => await ioFile.readAt(pageIndex * pageSize, 3),
        ),
      );
      for (const [pageIndex, read] of reads.entries()) {
        expect(read).toEqual(Buffer.from([0, pageIndex & 0xff, 0xff]));
      }
      await ioFile.close();
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should zero-extend a file to its expected size', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'w+', 8);
      expect(ioFile.getSize()).toEqual(8);
      await ioFile.writeAt(Buffer.from('ff', 'hex'), 2);
      await expect(ioFile.readAt(0, 16)).resolves.toEqual(Buffer.from('0000ff0000000000', 'hex'));
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(
        Buffer.from('0000ff0000000000', 'hex'),
      );
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });
});

describe('copyChunked', () => {
  /**
   * Write {@link contents} to temp files, then call {@link callback} with them opened as
   * {@link IOFile}s, returning their contents after they're closed.
   */
  const withIOFiles = async (
    contents: Buffer[],
    callback: (ioFiles: IOFile[]) => Promise<void>,
  ): Promise<Buffer[]> => {
    const tempFiles = await Promise.all(
      contents.map(async () => await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'))),
    );
    try {
      await Promise.all(
        tempFiles.map(async (tempFile, idx) => {
          await FsUtil.writeFile(tempFile, contents[idx]);
        }),
      );
      const ioFiles = await Promise.all(
        tempFiles.map(async (tempFile) => await IOFile.fileFrom(tempFile, 'r+')),
      );
      try {
        await callback(ioFiles);
      } finally {
        await Promise.all(
          ioFiles.map(async (ioFile) => {
            await ioFile.close();
          }),
        );
      }
      return await Promise.all(tempFiles.map(async (tempFile) => await FsUtil.readFile(tempFile)));
    } finally {
      await Promise.all(
        tempFiles.map(async (tempFile) => {
          await FsUtil.rm(tempFile, { force: true });
        }),
      );
    }
  };

  it('should copy a region spanning multiple chunks to another file', async () => {
    const source = patterned(Defaults.FILE_READING_CHUNK_SIZE * 2 + 100);
    const target = Buffer.alloc(source.length);

    let copied = 0;
    const [sourceAfter, targetAfter] = await withIOFiles([source, target], async (ioFiles) => {
      copied = await ioFiles[0].copyChunked(ioFiles[1], 5, 10, source.length - 20);
    });

    expect(copied).toEqual(source.length - 30);
    expect(sourceAfter).toEqual(source);
    expect(targetAfter).toEqual(
      Buffer.concat([Buffer.alloc(5), source.subarray(10, -20), Buffer.alloc(25)]),
    );
  });

  it('should copy the whole file by default', async () => {
    const source = patterned(Defaults.FILE_READING_CHUNK_SIZE + 1);

    let copied = 0;
    const [, targetAfter] = await withIOFiles([source, Buffer.alloc(0)], async (ioFiles) => {
      copied = await ioFiles[0].copyChunked(ioFiles[1]);
    });

    expect(copied).toEqual(source.length);
    expect(targetAfter).toEqual(source);
  });

  it('should stop at the end of the source', async () => {
    const source = patterned(Defaults.FILE_READING_CHUNK_SIZE + 1);

    let copied = 0;
    const [, targetAfter] = await withIOFiles([source, Buffer.alloc(0)], async (ioFiles) => {
      copied = await ioFiles[0].copyChunked(ioFiles[1], 0, 1, source.length * 3);
    });

    expect(copied).toEqual(source.length - 1);
    expect(targetAfter).toEqual(source.subarray(1));
  });

  it('should copy to an earlier region of the same file', async () => {
    const source = patterned(Defaults.FILE_READING_CHUNK_SIZE * 2 + 100);

    let copied = 0;
    const [sourceAfter] = await withIOFiles([source], async (ioFiles) => {
      copied = await ioFiles[0].copyChunked(ioFiles[0], 0, 3);
    });

    expect(copied).toEqual(source.length - 3);
    expect(sourceAfter).toEqual(Buffer.concat([source.subarray(3), source.subarray(-3)]));
  });

  it('should repeat bytes when copying forward to an overlapping region of the same file', async () => {
    const run = Buffer.from('abc');
    const source = Buffer.concat([run, Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE * 2 + 100)]);

    let copied = 0;
    const [sourceAfter] = await withIOFiles([source], async (ioFiles) => {
      copied = await ioFiles[0].copyChunked(ioFiles[0], run.length, 0, source.length - run.length);
    });

    expect(copied).toEqual(source.length - run.length);
    expect(sourceAfter).toEqual(
      Buffer.from(Array.from({ length: source.length }, (_value, idx) => run[idx % run.length])),
    );
  });

  it('should repeat a single byte a chunk at a time', async () => {
    const source = Buffer.concat([
      Buffer.from('a'),
      Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE * 3),
    ]);

    let copied = 0;
    let writes = 0;
    const [sourceAfter] = await withIOFiles([source], async (ioFiles) => {
      const writeAt = vi.spyOn(ioFiles[0], 'writeAt');
      copied = await ioFiles[0].copyChunked(ioFiles[0], 1, 0, source.length - 1);
      writes = writeAt.mock.calls.length;
    });

    expect(copied).toEqual(source.length - 1);
    expect(sourceAfter).toEqual(Buffer.alloc(source.length, 'a'));
    expect(writes).toEqual(3);
  });

  it('should repeat bytes when copying forward to a region of the same file more than a chunk later', async () => {
    const distance = Defaults.FILE_READING_CHUNK_SIZE + 3;
    const run = patterned(distance);
    const source = Buffer.concat([run, Buffer.alloc(distance * 2)]);

    let copied = 0;
    const [sourceAfter] = await withIOFiles([source], async (ioFiles) => {
      copied = await ioFiles[0].copyChunked(ioFiles[0], distance, 0, source.length - distance);
    });

    expect(copied).toEqual(source.length - distance);
    expect(sourceAfter).toEqual(Buffer.concat([run, run, run]));
  });

  it('should stop when copying forward from past the end of the same file', async () => {
    const source = patterned(10);

    let copied = 0;
    const [sourceAfter] = await withIOFiles([source], async (ioFiles) => {
      copied = await ioFiles[0].copyChunked(ioFiles[0], 20, 5, 100);
    });

    expect(copied).toEqual(5);
    expect(sourceAfter).toEqual(Buffer.concat([source, Buffer.alloc(10), source.subarray(5)]));
  });
});

describe('copyNext', () => {
  it('should copy from the read position and advance by the requested size', async () => {
    const sourceTempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(sourceTempFile, 'ABCDEF0123456789');
    const targetTempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(targetTempFile, '----------');

    try {
      const source = await IOFile.fileFrom(sourceTempFile, 'r');
      const target = await IOFile.fileFrom(targetTempFile, 'r+');
      try {
        source.seek(10);
        await expect(source.copyNext(target, 2, 4)).resolves.toEqual(4);
        expect(source.getPosition()).toEqual(14);
        await expect(source.copyNext(target, 6, 100)).resolves.toEqual(2);
        expect(source.getPosition()).toEqual(114);
      } finally {
        await source.close();
        await target.close();
      }
      await expect(FsUtil.readFile(targetTempFile)).resolves.toEqual(Buffer.from('--456789--'));
    } finally {
      await FsUtil.rm(sourceTempFile);
      await FsUtil.rm(targetTempFile);
    }
  });
});

describe('truncate', () => {
  test.each([
    // [name, initial hex, truncate size, expected hex]
    ['shrink', '00010203040506070809', 4, '00010203'],
    ['zero-extend', '00010203', 8, '0001020300000000'],
  ])('should %s a cached file', async (_name, initialHex, truncateSize, expectedHex) => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      await FsUtil.writeFile(tempFile, Buffer.from(initialHex, 'hex'));
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      await ioFile.readAt(0, 1); // cache the first page
      await ioFile.truncate(truncateSize);
      expect(ioFile.getSize()).toEqual(truncateSize);
      await expect(ioFile.readAt(0, 1024)).resolves.toEqual(Buffer.from(expectedHex, 'hex'));
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.from(expectedHex, 'hex'));
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should zero the gap when writing past a shrunk end', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      await FsUtil.writeFile(tempFile, Buffer.from('00010203040506070809', 'hex'));
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      await ioFile.readAt(0, 1); // cache the first page
      await ioFile.truncate(4);
      await ioFile.writeAt(Buffer.from('ff', 'hex'), 8);
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(
        Buffer.from('0001020300000000ff', 'hex'),
      );
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should zero-extend after a shrink', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      await FsUtil.writeFile(tempFile, Buffer.from('00010203040506070809', 'hex'));
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      await ioFile.readAt(0, 1); // cache the first page
      await ioFile.truncate(4);
      await ioFile.truncate(8);
      await expect(ioFile.readAt(0, 1024)).resolves.toEqual(Buffer.from('0001020300000000', 'hex'));
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(
        Buffer.from('0001020300000000', 'hex'),
      );
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  test.each([
    // [name, initial hex, truncate size, expected hex]
    ['shrink', '00010203040506070809', 4, '00010203'],
    ['zero-extend', '00010203', 8, '0001020300000000'],
  ])(
    'should %s a file without cached pages',
    async (_name, initialHex, truncateSize, expectedHex) => {
      const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
      try {
        await FsUtil.writeFile(tempFile, Buffer.from(initialHex, 'hex'));
        const ioFile = await IOFile.fileFrom(tempFile, 'r+');
        await ioFile.truncate(truncateSize);
        expect(ioFile.getSize()).toEqual(truncateSize);
        await ioFile.close();

        await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.from(expectedHex, 'hex'));
      } finally {
        await FsUtil.rm(tempFile, { force: true });
      }
    },
  );
});

describe('close', () => {
  it('should close the file handle even if flushing staged writes fails', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, Buffer.alloc(16));
    const open = fs.promises.open.bind(fs.promises);
    const openedHandles: fs.promises.FileHandle[] = [];
    vi.spyOn(fs.promises, 'open').mockImplementation(async (pathLike, flags) => {
      const handle = await open(pathLike, flags);
      openedHandles.push(handle);
      return handle;
    });

    try {
      const file = await IOFile.fileFrom(tempFile, 'r+');
      await file.writeAt(Buffer.from('ABCDEF01'), 0);
      vi.spyOn(openedHandles[0], 'writev').mockRejectedValue(new Error('flush failed'));

      await expect(file.close()).rejects.toThrow('flush failed');
      expect(openedHandles.map((handle) => handle.fd)).toEqual([-1]);
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(tempFile);
    }
  });
});
