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

describe('fileFrom', () => {
  test.each([
    // [mode, writable, expected contents after writing 0xff at 1]
    ['r', false, '41424344'],
    ['rs', false, '41424344'],
    ['sr', false, '41424344'],
    ['r+', true, '41ff4344'],
    ['sr+', true, '41ff4344'],
    ['as', true, '41424344ff'],
    ['sa+', true, '41424344ff'],
    ['w', true, '00ff'],
    ['xw+', true, '00ff'],
    ['xa', true, 'ff'],
  ])('should open a file with mode: %s', async (mode, writable, expectedHex) => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    if (!mode.includes('x')) {
      await FsUtil.writeFile(tempFile, 'ABCD');
    }
    try {
      const file = await IOFile.fileFrom(tempFile, mode);
      try {
        const written = await file.writeAt(Buffer.from('ff', 'hex'), 1).catch(() => undefined);
        expect(written).toEqual(writable ? 1 : undefined);
      } finally {
        await file.close();
      }
      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.from(expectedHex, 'hex'));
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  test.each(['rw', 'R', 'r++', ''])('should throw on the invalid mode: %s', async (mode) => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCD');
    try {
      await expect(IOFile.fileFrom(tempFile, mode)).rejects.toThrow('invalid');
      // The file wasn't opened, so it wasn't truncated
      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.from('ABCD'));
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should zero-extend a writable file to its expected size, even without writes', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      const file = await IOFile.fileFrom(tempFile, 'w+', 8);
      expect(file.getSize()).toEqual(8);
      await file.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.alloc(8));
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should not extend a read-only file to its expected size', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCD');
    try {
      const file = await IOFile.fileFrom(tempFile, 'r', 8);
      expect(file.getSize()).toEqual(8);
      await expect(file.readAt(0, 16)).resolves.toEqual(Buffer.from('ABCD\u{0}\u{0}\u{0}\u{0}'));
      await file.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.from('ABCD'));
    } finally {
      await FsUtil.rm(tempFile);
    }
  });
  test.each([1.5, 2 ** 40])('should throw on the invalid numeric flags: %s', async (flags) => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCD');
    try {
      await expect(IOFile.fileFrom(tempFile, flags)).rejects.toThrow(RangeError);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });
});

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

  it('should not read the new file from disk', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    const open = fs.promises.open.bind(fs.promises);
    const openedHandles: fs.promises.FileHandle[] = [];
    vi.spyOn(fs.promises, 'open').mockImplementation(async (pathLike, flags) => {
      const handle = await open(pathLike, flags);
      openedHandles.push(handle);
      return handle;
    });

    try {
      const size = Defaults.IO_FILE_PAGE_SIZE * 3;
      const ioFile = await IOFile.fileOfSize(tempFile, 'r+', size);
      expect(openedHandles).toHaveLength(1);
      const read = vi.spyOn(openedHandles[0], 'read');
      const readv = vi.spyOn(openedHandles[0], 'readv');
      await expect(ioFile.readAt(0, size)).resolves.toEqual(Buffer.alloc(size));
      expect(read).toHaveBeenCalledTimes(0);
      expect(readv).toHaveBeenCalledTimes(0);
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.alloc(size));
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should not resize the file again when closing it', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    const open = fs.promises.open.bind(fs.promises);
    const openedHandles: fs.promises.FileHandle[] = [];
    vi.spyOn(fs.promises, 'open').mockImplementation(async (pathLike, flags) => {
      const handle = await open(pathLike, flags);
      openedHandles.push(handle);
      return handle;
    });

    try {
      const ioFile = await IOFile.fileOfSize(tempFile, 'r+', 16);
      const truncate = vi.spyOn(openedHandles[0], 'truncate');
      await ioFile.writeAt(Buffer.from('ff', 'hex'), 1);
      await ioFile.close();

      expect(truncate).toHaveBeenCalledTimes(0);
      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(
        Buffer.from(`00ff${'00'.repeat(14)}`, 'hex'),
      );
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should close the file handle and delete the file if sizing fails', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    const open = fs.promises.open.bind(fs.promises);
    const openedHandles: fs.promises.FileHandle[] = [];
    vi.spyOn(fs.promises, 'open').mockImplementation(async (pathLike, flags) => {
      const handle = await open(pathLike, flags);
      vi.spyOn(handle, 'truncate').mockRejectedValue(new Error('truncate failed'));
      openedHandles.push(handle);
      return handle;
    });

    try {
      await expect(IOFile.fileOfSize(tempFile, 'r', 16)).rejects.toThrow('truncate failed');
      expect(openedHandles.map((handle) => handle.fd)).toEqual([-1]);
      await expect(FsUtil.exists(tempFile)).resolves.toEqual(false);
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
        isDelimiterFound: true,
      });
      await expect(file.readUntil(0, 100)).resolves.toEqual({
        data: Buffer.alloc(0),
        isDelimiterFound: true,
      });
      await expect(file.readUntil(0, 100)).resolves.toEqual({
        data: Buffer.from([4, 5]),
        isDelimiterFound: false,
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
        isDelimiterFound: false,
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
        isDelimiterFound: false,
      });
      await expect(file.readUntil(0, file.getSize())).resolves.toEqual({
        data: Buffer.alloc(10, 1),
        isDelimiterFound: true,
      });
      expect(file.getPosition()).toEqual(file.getSize());
    } finally {
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });

  it('should only copy the bytes before the delimiter', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(
      tempFile,
      Buffer.concat([
        Buffer.from('ABCDE'),
        Buffer.from([0]),
        Buffer.alloc(Defaults.IO_FILE_PAGE_SIZE * 2, 1),
      ]),
    );

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      await expect(file.readUntil(0, file.getSize())).resolves.toEqual({
        data: Buffer.from('ABCDE'),
        isDelimiterFound: true,
      });
      expect(file.getPosition()).toEqual(6);
    } finally {
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });

  it('should find a delimiter at the end of the chunk', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    // When chunks are larger than pages, the delimiter is in a later page
    const delimiterPosition = Defaults.FILE_READING_CHUNK_SIZE - 5;
    await FsUtil.writeFile(
      tempFile,
      Buffer.concat([Buffer.alloc(delimiterPosition, 1), Buffer.from([0]), Buffer.alloc(10, 1)]),
    );

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      await expect(file.readUntil(0, file.getSize())).resolves.toEqual({
        data: Buffer.alloc(delimiterPosition, 1),
        isDelimiterFound: true,
      });
      expect(file.getPosition()).toEqual(delimiterPosition + 1);
    } finally {
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });

  it('should not read past maxSize', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, Buffer.from('ABCDEF\u{0}'));

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      await expect(file.readUntil(0, 3)).resolves.toEqual({
        data: Buffer.from('ABC'),
        isDelimiterFound: false,
      });
      expect(file.getPosition()).toEqual(3);
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
    const contents = patterned(Defaults.IO_FILE_PAGE_SIZE * 3);
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, contents);

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      const position = Defaults.IO_FILE_PAGE_SIZE - 10;
      const size = Defaults.IO_FILE_PAGE_SIZE + 20;
      await expect(file.readAt(position, size)).resolves.toEqual(
        contents.subarray(position, position + size),
      );
    } finally {
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });

  it('should read consecutive missing pages from disk together, at most a chunk at a time', async () => {
    const contents = patterned(Defaults.IO_FILE_PAGE_SIZE * 4);
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, contents);
    const open = fs.promises.open.bind(fs.promises);
    const openedHandles: fs.promises.FileHandle[] = [];
    vi.spyOn(fs.promises, 'open').mockImplementation(async (pathLike, flags) => {
      const handle = await open(pathLike, flags);
      openedHandles.push(handle);
      return handle;
    });

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      const read = vi.spyOn(openedHandles[0], 'read');
      const readv = vi.spyOn(openedHandles[0], 'readv');
      await expect(file.readAt(10, contents.length - 20)).resolves.toEqual(
        contents.subarray(10, -10),
      );
      expect(read).toHaveBeenCalledTimes(0);
      const readSizes = readv.mock.calls.map(([buffers]) =>
        buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0),
      );
      expect(readSizes).toEqual(
        Array.from(
          { length: Math.ceil(contents.length / Defaults.FILE_READING_CHUNK_SIZE) },
          (_value, idx) =>
            Math.min(
              Defaults.FILE_READING_CHUNK_SIZE,
              contents.length - idx * Defaults.FILE_READING_CHUNK_SIZE,
            ),
        ),
      );
    } finally {
      vi.restoreAllMocks();
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });

  it('should read ahead as many uncached pages as were read', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    const contents = patterned(pageSize * 5);
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, contents);
    const open = fs.promises.open.bind(fs.promises);
    const openedHandles: fs.promises.FileHandle[] = [];
    vi.spyOn(fs.promises, 'open').mockImplementation(async (pathLike, flags) => {
      const handle = await open(pathLike, flags);
      openedHandles.push(handle);
      return handle;
    });

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      const readv = vi.spyOn(openedHandles[0], 'readv');
      const bytesRead = (): number =>
        readv.mock.calls
          .flatMap(([buffers]) => buffers)
          .reduce((sum, buffer) => sum + buffer.byteLength, 0);

      // Reads the second page, and reads ahead the third
      await expect(file.readAt(pageSize, 1)).resolves.toEqual(
        contents.subarray(pageSize, pageSize + 1),
      );
      expect(bytesRead()).toEqual(pageSize * 2);
      // Doesn't read ahead the cached second page
      await expect(file.readAt(0, 1)).resolves.toEqual(contents.subarray(0, 1));
      expect(bytesRead()).toEqual(pageSize * 3);
      // Reads the fourth and fifth pages, but not past the end of the file
      await expect(file.readAt(pageSize * 3, pageSize * 2)).resolves.toEqual(
        contents.subarray(pageSize * 3),
      );
      expect(bytesRead()).toEqual(pageSize * 5);
      await expect(file.readAt(0, contents.length)).resolves.toEqual(contents);
      expect(bytesRead()).toEqual(pageSize * 5);
    } finally {
      vi.restoreAllMocks();
      await file.close();
      await FsUtil.rm(tempFile);
    }
  });

  it('should evict read ahead pages before the pages that were read', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    const maxPages = Defaults.MAX_IO_FILE_CACHE_SIZE / pageSize;
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, Buffer.alloc((maxPages + 2) * pageSize));
    const open = fs.promises.open.bind(fs.promises);
    const openedHandles: fs.promises.FileHandle[] = [];
    vi.spyOn(fs.promises, 'open').mockImplementation(async (pathLike, flags) => {
      const handle = await open(pathLike, flags);
      openedHandles.push(handle);
      return handle;
    });

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      const readv = vi.spyOn(openedHandles[0], 'readv');
      const bytesRead = (): number =>
        readv.mock.calls
          .flatMap(([buffers]) => buffers)
          .reduce((sum, buffer) => sum + buffer.byteLength, 0);

      // Reads the first half of the cache, and reads ahead the second half, filling it
      await file.readAt(0, (maxPages / 2) * pageSize);
      expect(bytesRead()).toEqual(maxPages * pageSize);
      // Evicts two of the read ahead pages, rather than the first page
      await file.readAt(maxPages * pageSize, 1);
      expect(bytesRead()).toEqual((maxPages + 2) * pageSize);
      await file.readAt(0, 1);
      expect(bytesRead()).toEqual((maxPages + 2) * pageSize);
    } finally {
      vi.restoreAllMocks();
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

  describe.each(['r+', 'rs+', 'w', 'wx', fs.constants.O_RDWR, fs.constants.O_WRONLY])(
    'file mode: %s',
    (openMode) => {
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
    },
  );
  describe.each(['a', 'ax', 'as+', fs.constants.O_WRONLY | fs.constants.O_APPEND])(
    'file mode: %s',
    (openMode) => {
      it('should write to the end of the file', async () => {
        const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));

        try {
          const file = await IOFile.fileOfSize(tempFile, openMode, 4);
          await file.write(Buffer.from('ABCDEF01'));
          expect(file.getPosition()).toEqual(12);
          file.seek(0);
          await file.write(Buffer.from('23'));
          expect(file.getPosition()).toEqual(14);
          await file.close();

          await expect(FsUtil.readFile(tempFile)).resolves.toEqual(
            Buffer.from('\u{0}\u{0}\u{0}\u{0}ABCDEF0123'),
          );
        } finally {
          await FsUtil.rm(tempFile);
        }
      });
    },
  );
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

  describe.each(['r+', 'rs+', 'w', 'wx', fs.constants.O_RDWR, fs.constants.O_WRONLY])(
    'file mode: %s',
    (openMode) => {
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
    },
  );

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

  it('should not grow a file when writing nothing past its end', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCD');
    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      await expect(ioFile.writeAt(Buffer.alloc(0), 1000)).resolves.toEqual(0);
      expect(ioFile.getSize()).toEqual(4);
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.from('ABCD'));
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should not grow a file when the write fails', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCD');
    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      // The write needs the lock to load its page, which the close holds
      const closing = ioFile.close();
      await expect(ioFile.writeAt(Buffer.from('ff', 'hex'), 1000)).rejects.toThrow('closed');
      await closing;

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.from('ABCD'));
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should keep the bytes between the end of a cached page and a write past it zeros', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    const contents = patterned(10);
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, contents);
    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      await ioFile.readAt(0, 1); // cache the first page
      await ioFile.writeAt(Buffer.from('ff', 'hex'), pageSize * 2);
      const expected = Buffer.concat([
        contents,
        Buffer.alloc(pageSize * 2 - contents.length),
        Buffer.from('ff', 'hex'),
      ]);
      await expect(ioFile.readAt(0, expected.length)).resolves.toEqual(expected);
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(expected);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should append to a file many bytes at a time', async () => {
    const contents = patterned(Defaults.IO_FILE_PAGE_SIZE + 1000);
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'w+');
      for (let position = 0; position < contents.length; position += 100) {
        await ioFile.write(contents.subarray(position, position + 100));
      }
      await expect(ioFile.readAt(0, contents.length)).resolves.toEqual(contents);
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(contents);
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
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
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

  test.each(['w', 'w+'])(
    'should read pages evicted from the cache of a file opened with mode: %s',
    async (openMode) => {
      const pageSize = Defaults.IO_FILE_PAGE_SIZE;
      const pageCount = (Defaults.MAX_IO_FILE_CACHE_SIZE / pageSize) * 2;
      const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
      try {
        const ioFile = await IOFile.fileFrom(tempFile, openMode);
        // More pages than the cache holds, so the first pages are written to disk and evicted
        for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
          await ioFile.writeAt(Buffer.from([pageIndex & 0xff]), pageIndex * pageSize);
        }
        // The first page is read back from disk
        await ioFile.writeAt(Buffer.from([0xff]), 1);
        await expect(ioFile.readAt(0, 2)).resolves.toEqual(Buffer.from([0, 0xff]));
        await ioFile.close();

        const contents = await FsUtil.readFile(tempFile);
        expect(contents.length).toEqual((pageCount - 1) * pageSize + 1);
        expect(contents.subarray(0, 2)).toEqual(Buffer.from([0, 0xff]));
        expect(contents[pageSize]).toEqual(1);
      } finally {
        await FsUtil.rm(tempFile, { force: true });
      }
    },
  );

  it('should stage writes in memory until the file is closed', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, Buffer.alloc(Defaults.IO_FILE_PAGE_SIZE * 2));
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
      for (let position = 0; position < Defaults.IO_FILE_PAGE_SIZE * 2; position += 1024) {
        await ioFile.writeAt(Buffer.from([0xff]), position);
      }
      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(
        Buffer.alloc(Defaults.IO_FILE_PAGE_SIZE * 2),
      );
      await ioFile.close();

      // Both pages were written to disk together, a chunk at a time
      expect(write).toHaveBeenCalledTimes(0);
      expect(writev).toHaveBeenCalledTimes(
        Math.ceil((Defaults.IO_FILE_PAGE_SIZE * 2) / Defaults.FILE_READING_CHUNK_SIZE),
      );
      const expected = Buffer.alloc(Defaults.IO_FILE_PAGE_SIZE * 2);
      for (let position = 0; position < expected.length; position += 1024) {
        expected[position] = 0xff;
      }
      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(expected);
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(tempFile);
    }
  });

  it('should write each byte to disk once, at most a chunk at a time', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    const pageCount = (Defaults.MAX_IO_FILE_CACHE_SIZE / pageSize) * 2;
    const contents = patterned(pageCount * pageSize);
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, Buffer.alloc(contents.length));
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
      // More pages than the cache holds, so dirty pages are evicted, then the rest are flushed
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        await ioFile.writeAt(
          contents.subarray(pageIndex * pageSize, (pageIndex + 1) * pageSize),
          pageIndex * pageSize,
        );
      }
      await ioFile.close();

      expect(write).toHaveBeenCalledTimes(0);
      const writeSizes = writev.mock.calls.map(([buffers]) =>
        buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0),
      );
      expect(
        writeSizes.every((writeSize) => writeSize <= Defaults.FILE_READING_CHUNK_SIZE),
      ).toEqual(true);
      expect(writeSizes.reduce((sum, writeSize) => sum + writeSize, 0)).toEqual(contents.length);
      // Deep-comparing buffers this large exhausts the heap
      expect((await FsUtil.readFile(tempFile)).equals(contents)).toEqual(true);
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(tempFile);
    }
  });

  it('should not read pages from disk that are entirely overwritten', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
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
      const readv = vi.spyOn(openedHandles[0], 'readv');
      // Overwrites the second page entirely, but only part of the first and third pages
      const contents = patterned(pageSize + 20);
      await ioFile.writeAt(contents, pageSize - 10);
      // Only the first and third pages are read
      expect(read).toHaveBeenCalledTimes(0);
      expect(readv).toHaveBeenCalledTimes(
        Math.ceil(pageSize / Defaults.FILE_READING_CHUNK_SIZE) * 2,
      );
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
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
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

  it('should write more than the cache holds past the end of the file at once', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'w+');
      // Evicts the write's own dirty pages before it finishes
      const contents = patterned(Defaults.MAX_IO_FILE_CACHE_SIZE + Defaults.IO_FILE_PAGE_SIZE);
      await ioFile.writeAt(contents, 1);
      expect(ioFile.getSize()).toEqual(contents.length + 1);
      await ioFile.close();

      const written = await FsUtil.readFile(tempFile);
      // Deep-comparing buffers this large exhausts the heap
      expect(written.equals(Buffer.concat([Buffer.alloc(1), contents]))).toEqual(true);
    } finally {
      await FsUtil.rm(tempFile, { force: true });
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
  describe.each(['a', 'ax', 'as+', fs.constants.O_WRONLY | fs.constants.O_APPEND])(
    'file mode: %s',
    (openMode) => {
      it('should write to the end of the file', async () => {
        const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));

        try {
          const file = await IOFile.fileOfSize(tempFile, openMode, 4);
          await expect(file.writeAt(Buffer.from('ABCDEF01'), 0)).resolves.toEqual(8);
          await expect(file.writeAt(Buffer.from('23'), 1)).resolves.toEqual(2);
          expect(file.getSize()).toEqual(14);
          await file.close();

          await expect(FsUtil.readFile(tempFile)).resolves.toEqual(
            Buffer.from('\u{0}\u{0}\u{0}\u{0}ABCDEF0123'),
          );
        } finally {
          await FsUtil.rm(tempFile);
        }
      });
    },
  );

  test.each(['w', 'a'])(
    'should write straight to a file that can only be written to, with mode: %s',
    async (openMode) => {
      const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
      await FsUtil.writeFile(tempFile, 'ABCD');
      const open = fs.promises.open.bind(fs.promises);
      const openedHandles: fs.promises.FileHandle[] = [];
      vi.spyOn(fs.promises, 'open').mockImplementation(async (pathLike, flags) => {
        if (typeof flags === 'number' && (flags & fs.constants.O_RDWR) !== 0) {
          throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
        }
        const handle = await open(pathLike, flags);
        openedHandles.push(handle);
        return handle;
      });

      try {
        const file = await IOFile.fileFrom(tempFile, openMode);
        const write = vi.spyOn(openedHandles[0], 'write');
        await expect(file.writeAt(Buffer.from('EF'), 1)).resolves.toEqual(2);
        expect(write).toHaveBeenCalledTimes(1);
        await expect(file.readAt(0, 1)).rejects.toThrow('write-only');
        await file.close();

        vi.restoreAllMocks();
        await expect(FsUtil.readFile(tempFile)).resolves.toEqual(
          Buffer.from(openMode === 'w' ? '\u{0}EF' : 'ABCDEF'),
        );
      } finally {
        vi.restoreAllMocks();
        await FsUtil.rm(tempFile);
      }
    },
  );

  it('should not open a file that can only be written to with a mode that needs reading', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCD');
    vi.spyOn(fs.promises, 'open').mockRejectedValue(
      Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    );

    try {
      await expect(IOFile.fileFrom(tempFile, 'r+')).rejects.toThrow('permission denied');
      expect(fs.promises.open).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(tempFile);
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

  it('should copy straight from the source pages', async () => {
    const source = patterned(Defaults.IO_FILE_PAGE_SIZE * 2 + 100);

    let copied = 0;
    let reads = 0;
    const [, targetAfter] = await withIOFiles([source, Buffer.alloc(0)], async (ioFiles) => {
      const readAt = vi.spyOn(ioFiles[0], 'readAt');
      copied = await ioFiles[0].copyChunked(ioFiles[1]);
      reads = readAt.mock.calls.length;
    });

    expect(copied).toEqual(source.length);
    expect(reads).toEqual(0);
    expect(targetAfter).toEqual(source);
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

  it('should repeat bytes when copying to an overlapping later region of the same file', async () => {
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

  it('should repeat a single byte in steps that double up to a page', async () => {
    const source = Buffer.concat([Buffer.from('a'), Buffer.alloc(Defaults.IO_FILE_PAGE_SIZE * 3)]);

    let copied = 0;
    let writes = 0;
    const [sourceAfter] = await withIOFiles([source], async (ioFiles) => {
      const writeAt = vi.spyOn(ioFiles[0], 'writeAt');
      copied = await ioFiles[0].copyChunked(ioFiles[0], 1, 0, source.length - 1);
      writes = writeAt.mock.calls.length;
    });

    expect(copied).toEqual(source.length - 1);
    expect(sourceAfter).toEqual(Buffer.alloc(source.length, 'a'));
    // Steps of 1, 2, 4, ... bytes until a page has been copied, then a page at a time for the
    // remaining two pages and one byte
    expect(writes).toEqual(Math.log2(Defaults.IO_FILE_PAGE_SIZE) + 3);
  });

  it('should repeat bytes when copying to a region of the same file more than a page later', async () => {
    const distance = Defaults.IO_FILE_PAGE_SIZE + 3;
    const run = patterned(distance);
    const source = Buffer.concat([run, Buffer.alloc(distance * 2)]);

    let copied = 0;
    const [sourceAfter] = await withIOFiles([source], async (ioFiles) => {
      copied = await ioFiles[0].copyChunked(ioFiles[0], distance, 0, source.length - distance);
    });

    expect(copied).toEqual(source.length - distance);
    expect(sourceAfter).toEqual(Buffer.concat([run, run, run]));
  });

  test.each([2, 3, 7, 100, Defaults.IO_FILE_PAGE_SIZE - 1, Defaults.IO_FILE_PAGE_SIZE])(
    'should repeat bytes across page boundaries when copying to %s bytes later in the same file',
    async (distance) => {
      const source = patterned(Defaults.IO_FILE_PAGE_SIZE * 6);
      const sourceStart = Defaults.IO_FILE_PAGE_SIZE - 3;
      const size = Defaults.IO_FILE_PAGE_SIZE * 4;

      let copied = 0;
      const [sourceAfter] = await withIOFiles([source], async (ioFiles) => {
        copied = await ioFiles[0].copyChunked(
          ioFiles[0],
          sourceStart + distance,
          sourceStart,
          sourceStart + size,
        );
      });

      // Copy a byte at a time
      const expected = Buffer.from(source);
      for (let offset = 0; offset < size; offset += 1) {
        expected[sourceStart + distance + offset] = expected[sourceStart + offset];
      }
      expect(copied).toEqual(size);
      expect(sourceAfter).toEqual(expected);
    },
  );

  test.each([
    ['less than a page', 15],
    ['more than a page', Defaults.IO_FILE_PAGE_SIZE + 15],
  ])(
    'should repeat the gap when copying from past the end of the same file to %s later',
    async (_name, distance) => {
      const source = patterned(10);
      const sourceStart = 5;
      const size = distance * 3;

      let copied = 0;
      const [sourceAfter] = await withIOFiles([source], async (ioFiles) => {
        copied = await ioFiles[0].copyChunked(
          ioFiles[0],
          sourceStart + distance,
          sourceStart,
          sourceStart + size,
        );
      });

      // Copy a byte at a time, the gap past the end of the file reading as zeros
      const expected = Buffer.alloc(sourceStart + distance + size);
      source.copy(expected);
      for (let offset = 0; offset < size; offset += 1) {
        expected[sourceStart + distance + offset] = expected[sourceStart + offset];
      }
      expect(copied).toEqual(size);
      expect(sourceAfter).toEqual(expected);
    },
  );
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

  it('should zero-extend a cached file past the end of its page', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      await FsUtil.writeFile(tempFile, Buffer.from('00010203', 'hex'));
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      await ioFile.readAt(0, 1); // cache the first page
      await ioFile.truncate(pageSize + 4);
      const expected = Buffer.concat([Buffer.from('00010203', 'hex'), Buffer.alloc(pageSize)]);
      await expect(ioFile.readAt(0, pageSize * 2)).resolves.toEqual(expected);
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(expected);
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
  it('should truncate to zero bytes when the size is negative', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCD');
    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      await ioFile.truncate(-1);
      expect(ioFile.getSize()).toEqual(0);
      await expect(ioFile.readAt(0, 4)).resolves.toEqual(Buffer.alloc(0));
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.alloc(0));
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should not read the zero-extended part of a file from disk', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCD');
    const open = fs.promises.open.bind(fs.promises);
    const openedHandles: fs.promises.FileHandle[] = [];
    vi.spyOn(fs.promises, 'open').mockImplementation(async (pathLike, flags) => {
      const handle = await open(pathLike, flags);
      openedHandles.push(handle);
      return handle;
    });

    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      const readv = vi.spyOn(openedHandles[0], 'readv');
      await ioFile.truncate(Defaults.IO_FILE_PAGE_SIZE * 2);
      await expect(ioFile.readAt(0, Defaults.IO_FILE_PAGE_SIZE * 2)).resolves.toEqual(
        Buffer.concat([Buffer.from('ABCD'), Buffer.alloc(Defaults.IO_FILE_PAGE_SIZE * 2 - 4)]),
      );
      const bytesRead = readv.mock.calls
        .flatMap(([buffers]) => buffers)
        .reduce((sum, buffer) => sum + buffer.byteLength, 0);
      expect(bytesRead).toEqual(4);
      await ioFile.close();
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(tempFile, { force: true });
    }
  });
});

describe('close', () => {
  it('should do nothing when the file is already closed', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      const file = await IOFile.fileFrom(tempFile, 'w+');
      await file.writeAt(Buffer.from('ABCDEF01'), 4);
      await file.close();
      await expect(file.close()).resolves.toBeUndefined();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(
        Buffer.from('\u{0}\u{0}\u{0}\u{0}ABCDEF01'),
      );
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should throw when using the file after closing it', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, Buffer.from('ABCDEF01'));
    try {
      const file = await IOFile.fileFrom(tempFile, 'r+');
      await file.readAt(0, 1); // cache the first page
      await file.close();

      await expect(file.readAt(0, 1)).rejects.toThrow('closed');
      await expect(file.readNext(1)).rejects.toThrow('closed');
      await expect(file.readUntil(0, 1)).rejects.toThrow('closed');
      await expect(file.writeAt(Buffer.alloc(Defaults.IO_FILE_PAGE_SIZE), 0)).rejects.toThrow(
        'closed',
      );
      await expect(file.copyChunked(file, 4)).rejects.toThrow('closed');
      await expect(file.copyChunked(file, 4, 0, 0)).rejects.toThrow('closed');
      await expect(file.copyNext(file, 4, 1)).rejects.toThrow('closed');
      expect(file.getPosition()).toEqual(0);
      await expect(file.truncate(0)).rejects.toThrow('closed');
      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.from('ABCDEF01'));
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should throw when using the file while it closes', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, Buffer.from('ABCDEF01'));
    try {
      const file = await IOFile.fileFrom(tempFile, 'r+');
      // The read needs the lock to load its page, which the close holds
      const closing = file.close();
      await expect(file.readAt(0, 1)).rejects.toThrow('closed');
      await closing;
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

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
