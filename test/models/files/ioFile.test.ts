import type { OpenMode } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';

import Defaults from '../../../src/globals/defaults.js';
import Temp from '../../../src/globals/temp.js';
import IOFile from '../../../src/models/files/ioFile.js';
import FsUtil from '../../../src/utils/fsUtil.js';
import PathUtil from '../../../src/utils/pathUtil.js';

if (!(await FsUtil.exists(Temp.getTempDir()))) {
  await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Bytes that differ from their neighbors, so misplaced reads and copies are caught */
const patterned = (size: number): Buffer => {
  const buffer = Buffer.allocUnsafe(size);
  for (let idx = 0; idx < size; idx += 1) {
    buffer[idx] = (idx * 7 + 3) & 0xff;
  }
  return buffer;
};

interface TempIOFile {
  // Written to a temp file that's opened with IOFile.fileFrom()
  contents?: Buffer | string;
  // Otherwise, the size of a temp file created with IOFile.fileOfSize()
  size?: number;
  // Defaults to 'r+'
  mode?: OpenMode;
}

/**
 * Open temp files described by {@link files} as {@link IOFile}s, call {@link callback} with them,
 * then close and delete them. Neither {@link TempIOFile.contents} nor {@link TempIOFile.size}
 * opens a file that doesn't exist yet.
 * @returns the callback's result, and the files' contents after they're closed
 */
const withIOFiles = async <T>(
  files: TempIOFile[],
  callback: (ioFiles: IOFile[]) => Promise<T>,
): Promise<{ result: T; contents: Buffer[] }> => {
  const tempFiles = await Promise.all(
    files.map(async () => await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'))),
  );
  const ioFiles: IOFile[] = [];
  try {
    for (const [idx, file] of files.entries()) {
      const mode = file.mode ?? 'r+';
      if (file.contents !== undefined) {
        await FsUtil.writeFile(tempFiles[idx], file.contents);
      }
      ioFiles.push(
        file.size === undefined
          ? await IOFile.fileFrom(tempFiles[idx], mode)
          : await IOFile.fileOfSize(tempFiles[idx], mode, file.size),
      );
    }
    const result = await callback(ioFiles);
    await Promise.all(
      ioFiles.map(async (ioFile) => {
        await ioFile.close();
      }),
    );
    const contents = await Promise.all(
      tempFiles.map(async (tempFile) => await FsUtil.readFile(tempFile)),
    );
    return { result, contents };
  } finally {
    // Closing an already closed file does nothing
    await Promise.all(
      ioFiles.map(async (ioFile) => {
        await ioFile.close();
      }),
    );
    await Promise.all(
      tempFiles.map(async (tempFile) => {
        await FsUtil.rm(tempFile, { force: true });
      }),
    );
  }
};

/**
 * Open a temp file described by {@link file} as an {@link IOFile}, call {@link callback} with it,
 * then close and delete it.
 * @returns the callback's result, and the file's contents after it's closed
 */
const withIOFile = async <T>(
  file: TempIOFile,
  callback: (ioFile: IOFile) => Promise<T>,
): Promise<{ result: T; contents: Buffer }> => {
  const { result, contents } = await withIOFiles(
    [file],
    async ([ioFile]) => await callback(ioFile),
  );
  return { result, contents: contents[0] };
};

/**
 * Spy on {@link fs.promises.open}, calling {@link onOpen} with each file handle it opens.
 * @returns the file handles opened
 */
const spyOnOpenedHandles = (
  onOpen?: (handle: fs.promises.FileHandle) => void,
): fs.promises.FileHandle[] => {
  const open = fs.promises.open.bind(fs.promises);
  const openedHandles: fs.promises.FileHandle[] = [];
  vi.spyOn(fs.promises, 'open').mockImplementation(async (pathLike, flags) => {
    const handle = await open(pathLike, flags);
    onOpen?.(handle);
    openedHandles.push(handle);
    return handle;
  });
  return openedHandles;
};

/**
 * Make {@link fs.promises.open} fail to open files for reading and writing, as if they could only
 * be written to.
 */
const denyReadWriteOpens = (): void => {
  const open = fs.promises.open.bind(fs.promises);
  vi.spyOn(fs.promises, 'open').mockImplementation(async (pathLike, flags) => {
    if (typeof flags === 'number' && (flags & fs.constants.O_RDWR) !== 0) {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    }
    return await open(pathLike, flags);
  });
};

describe('fileFrom', () => {
  test.each([
    // [mode, expected contents after writing 0xff at 1]
    ['r+', '41ff4344'],
    ['sr+', '41ff4344'],
    ['as', '41424344ff'],
    ['sa+', '41424344ff'],
    ['w', '00ff'],
    ['xw+', '00ff'],
    ['xa', 'ff'],
  ])('should open a writable file with mode: %s', async (mode, expectedHex) => {
    const { contents } = await withIOFile(
      { contents: mode.includes('x') ? undefined : 'ABCD', mode },
      async (ioFile) => {
        await expect(ioFile.writeAt(Buffer.from('ff', 'hex'), 1)).resolves.toEqual(1);
      },
    );

    expect(contents).toEqual(Buffer.from(expectedHex, 'hex'));
  });

  test.each(['r', 'rs', 'sr'])('should open a read-only file with mode: %s', async (mode) => {
    const { contents } = await withIOFile({ contents: 'ABCD', mode }, async (ioFile) => {
      await expect(ioFile.readAt(0, 4)).resolves.toEqual(Buffer.from('ABCD'));
      await expect(ioFile.writeAt(Buffer.from('ff', 'hex'), 1)).rejects.toThrow(/read-only/);
    });

    expect(contents).toEqual(Buffer.from('ABCD'));
  });

  test.each([
    ['rw', 'invalid'],
    ['R', 'invalid'],
    ['r++', 'invalid'],
    ['', 'invalid'],
    [1.5, RangeError],
    [2 ** 40, RangeError],
  ])('should throw on the invalid mode: %s', async (mode, expectedError) => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCD');
    try {
      await expect(IOFile.fileFrom(tempFile, mode)).rejects.toThrow(expectedError);
      // The file wasn't opened, so it wasn't truncated
      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.from('ABCD'));
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should throw when a file needing reading can only be written to', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCD');
    denyReadWriteOpens();

    try {
      await expect(IOFile.fileFrom(tempFile, 'r+')).rejects.toThrow('permission denied');
      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.from('ABCD'));
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should zero-extend a writable file to its expected size, even without writes', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'w+', 8);
      expect(ioFile.getSize()).toEqual(8);
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.alloc(8));
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should truncate a writable file larger than its expected size', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCDEFGH');
    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'r+', 4);
      expect(ioFile.getSize()).toEqual(4);
      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.from('ABCD'));
      await expect(ioFile.readAt(0, 16)).resolves.toEqual(Buffer.from('ABCD'));
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.from('ABCD'));
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should read a read-only file only up to its expected size', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCDEFGH');
    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'r', 4);
      expect(ioFile.getSize()).toEqual(4);
      await expect(ioFile.readAt(0, 16)).resolves.toEqual(Buffer.from('ABCD'));
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.from('ABCDEFGH'));
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should throw when a write-only file is in a missing directory', async () => {
    const tempFile = path.join(await FsUtil.mktemp(path.join(Temp.getTempDir(), 'dir')), 'file');
    await expect(IOFile.fileFrom(tempFile, 'w')).rejects.toThrow(/ENOENT/);
  });

  it('should not extend a read-only file to its expected size', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCD');
    try {
      const ioFile = await IOFile.fileFrom(tempFile, 'r', 8);
      expect(ioFile.getSize()).toEqual(8);
      await expect(ioFile.readAt(0, 16)).resolves.toEqual(Buffer.from('ABCD\u{0}\u{0}\u{0}\u{0}'));
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.from('ABCD'));
    } finally {
      await FsUtil.rm(tempFile);
    }
  });
});

describe('fileOfSize', () => {
  test.each([1, 42, 226, 1337, 8_675_309])('should create a file of size: %s', async (size) => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      const ioFile = await IOFile.fileOfSize(tempFile, 'r', size);
      expect(ioFile.getPathLike()).toEqual(tempFile);
      expect(ioFile.getSize()).toEqual(size);
      await ioFile.close();

      await expect(FsUtil.size(tempFile)).resolves.toEqual(size);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should replace an existing file without changing its hard links', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCD');
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsUtil.hardlink(tempFile, tempLink);

    try {
      const ioFile = await IOFile.fileOfSize(tempFile, 'r+', 8);
      await ioFile.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(Buffer.alloc(8));
      await expect(FsUtil.readFile(tempLink)).resolves.toEqual(Buffer.from('ABCD'));
    } finally {
      await FsUtil.rm(tempLink);
      await FsUtil.rm(tempFile);
    }
  });

  it('should close the file handle and delete the file if sizing fails', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    const openedHandles = spyOnOpenedHandles((handle) => {
      vi.spyOn(handle, 'truncate').mockRejectedValue(new Error('truncate failed'));
    });

    try {
      await expect(IOFile.fileOfSize(tempFile, 'r', 16)).rejects.toThrow('truncate failed');
      expect(openedHandles.map((handle) => handle.fd)).toEqual([-1]);
      await expect(FsUtil.exists(tempFile)).resolves.toEqual(false);
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });
});

describe('getPathLike', () => {
  it('should return the path the file was opened with', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.writeFile(tempFile, 'ABCD');
    const ioFile = await IOFile.fileFrom(tempFile, 'r');
    try {
      expect(ioFile.getPathLike()).toEqual(tempFile);
    } finally {
      await ioFile.close();
      await FsUtil.rm(tempFile);
    }
  });
});

describe('getPosition', () => {
  it('should start at zero and follow reads, writes, and seeks', async () => {
    await withIOFile({ contents: 'ABCDEF' }, async (ioFile) => {
      expect(ioFile.getPosition()).toEqual(0);
      await ioFile.readNext(2);
      expect(ioFile.getPosition()).toEqual(2);
      await ioFile.write(Buffer.from('ff', 'hex'));
      expect(ioFile.getPosition()).toEqual(3);
      // Reading and writing at a position doesn't move it
      await ioFile.readAt(5, 1);
      await ioFile.writeAt(Buffer.from('ff', 'hex'), 0);
      expect(ioFile.getPosition()).toEqual(3);
    });
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
    const ioFile = await IOFile.fileFrom(filePath, 'r');
    try {
      expect(ioFile.getSize()).toEqual(expectedSize);
    } finally {
      await ioFile.close();
    }
  });

  test.each(
    ['symbolic', 'hard'].flatMap((linkType) =>
      filesWithSizes.map(([filePath, expectedSize]): [string, string, number] => [
        linkType,
        filePath,
        expectedSize,
      ]),
    ),
  )('should get size of a %s linked file: %s', async (linkType, filePath, expectedSize) => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsUtil.copyFile(filePath, tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    await (linkType === 'symbolic'
      ? FsUtil.symlink(PathUtil.resolve(tempFile), tempLink)
      : FsUtil.hardlink(tempFile, tempLink));

    const ioFile = await IOFile.fileFrom(tempLink, 'r');
    try {
      expect(ioFile.getSize()).toEqual(expectedSize);
    } finally {
      await ioFile.close();
      await FsUtil.rm(tempLink);
      await FsUtil.rm(tempFile);
    }
  });
});

describe('isEOF', () => {
  it('should be true once the read position reaches the end of the file', async () => {
    await withIOFile({ contents: 'ABCD', mode: 'r' }, async (ioFile) => {
      expect(ioFile.isEOF()).toEqual(false);
      await ioFile.readNext(3);
      expect(ioFile.isEOF()).toEqual(false);
      await ioFile.readNext(1);
      expect(ioFile.isEOF()).toEqual(true);
      ioFile.seek(100);
      expect(ioFile.isEOF()).toEqual(true);
    });
  });
});

describe('seek', () => {
  it('should move the read position backward and forward', async () => {
    await withIOFile({ contents: 'ABCDEF0123456789', mode: 'r' }, async (ioFile) => {
      await expect(ioFile.readNext(5)).resolves.toEqual(Buffer.from('ABCDE'));
      ioFile.seek(1);
      expect(ioFile.getPosition()).toEqual(1);
      await expect(ioFile.readNext(3)).resolves.toEqual(Buffer.from('BCD'));
      ioFile.seek(10);
      await expect(ioFile.readNext(3)).resolves.toEqual(Buffer.from('456'));
    });
  });
});

describe('skipNext', () => {
  it('should advance the read position', async () => {
    await withIOFile({ contents: 'ABCDEF0123456789', mode: 'r' }, async (ioFile) => {
      await expect(ioFile.readNext(2)).resolves.toEqual(Buffer.from('AB'));
      ioFile.skipNext(4);
      expect(ioFile.getPosition()).toEqual(6);
      await expect(ioFile.readNext(5)).resolves.toEqual(Buffer.from('01234'));
    });
  });
});

describe('peekNext', () => {
  it('should read from the read position without advancing it', async () => {
    await withIOFile({ contents: 'ABCDEF', mode: 'r' }, async (ioFile) => {
      ioFile.seek(2);
      await expect(ioFile.peekNext(3)).resolves.toEqual(Buffer.from('CDE'));
      await expect(ioFile.peekNext(100)).resolves.toEqual(Buffer.from('CDEF'));
      expect(ioFile.getPosition()).toEqual(2);
    });
  });
});

describe('readNext', () => {
  it('should read from the read position and advance it by the requested size', async () => {
    await withIOFile({ contents: 'ABCDEF0123456789', mode: 'r' }, async (ioFile) => {
      await expect(ioFile.readNext(4)).resolves.toEqual(Buffer.from('ABCD'));
      expect(ioFile.getPosition()).toEqual(4);
      // Fewer bytes at the end of the file
      await expect(ioFile.readNext(100)).resolves.toEqual(Buffer.from('EF0123456789'));
      expect(ioFile.getPosition()).toEqual(104);
      await expect(ioFile.readNext(1)).resolves.toEqual(Buffer.alloc(0));
    });
  });
});

describe('readUntil', () => {
  it('should read up to the delimiter and advance past it', async () => {
    await withIOFile(
      { contents: Buffer.from([1, 2, 3, 0, 0, 4, 5]), mode: 'r' },
      async (ioFile) => {
        await expect(ioFile.readUntil(0, 100)).resolves.toEqual({
          data: Buffer.from([1, 2, 3]),
          isDelimiterFound: true,
        });
        await expect(ioFile.readUntil(0, 100)).resolves.toEqual({
          data: Buffer.alloc(0),
          isDelimiterFound: true,
        });
        await expect(ioFile.readUntil(0, 100)).resolves.toEqual({
          data: Buffer.from([4, 5]),
          isDelimiterFound: false,
        });
        expect(ioFile.getPosition()).toEqual(7);
      },
    );
  });

  it('should not read past the max size', async () => {
    await withIOFile({ contents: Buffer.from([1, 2, 3, 0]), mode: 'r' }, async (ioFile) => {
      await expect(ioFile.readUntil(0, 2)).resolves.toEqual({
        data: Buffer.from([1, 2]),
        isDelimiterFound: false,
      });
      expect(ioFile.getPosition()).toEqual(2);
    });
  });

  it('should read at most a chunk at a time', async () => {
    const contents = Buffer.concat([
      Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE + 10, 1),
      Buffer.from([0]),
    ]);

    await withIOFile({ contents, mode: 'r' }, async (ioFile) => {
      await expect(ioFile.readUntil(0, ioFile.getSize())).resolves.toEqual({
        data: Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE, 1),
        isDelimiterFound: false,
      });
      await expect(ioFile.readUntil(0, ioFile.getSize())).resolves.toEqual({
        data: Buffer.alloc(10, 1),
        isDelimiterFound: true,
      });
      expect(ioFile.getPosition()).toEqual(ioFile.getSize());
    });
  });

  it('should find a delimiter at the last byte of the chunk, in a later page', async () => {
    // Starting partway into the first page, the chunk's last byte is in the second page
    const start = 3;
    const delimiterPosition = start + Defaults.FILE_READING_CHUNK_SIZE - 1;
    const contents = Buffer.concat([
      Buffer.alloc(delimiterPosition, 1),
      Buffer.from([0]),
      Buffer.alloc(10, 1),
    ]);

    await withIOFile({ contents, mode: 'r' }, async (ioFile) => {
      ioFile.seek(start);
      await expect(ioFile.readUntil(0, ioFile.getSize())).resolves.toEqual({
        data: Buffer.alloc(delimiterPosition - start, 1),
        isDelimiterFound: true,
      });
      expect(ioFile.getPosition()).toEqual(delimiterPosition + 1);
    });
  });

  it('should read nothing at the end of the file', async () => {
    await withIOFile({ contents: 'ABCD', mode: 'r' }, async (ioFile) => {
      ioFile.seek(4);
      await expect(ioFile.readUntil(0, 100)).resolves.toEqual({
        data: Buffer.alloc(0),
        isDelimiterFound: false,
      });
      expect(ioFile.getPosition()).toEqual(4);
    });
  });

  it('should throw on a negative read position', async () => {
    await withIOFile({ contents: 'ABCD', mode: 'r' }, async (ioFile) => {
      ioFile.seek(-1);
      await expect(ioFile.readUntil(0, 100)).rejects.toThrow(/negative position -1/);
    });
  });
});

describe('readAt', () => {
  test.each([
    ['smaller than the cache', Defaults.IO_FILE_PAGE_SIZE * 2 + 1],
    ['larger than the cache', Defaults.MAX_IO_FILE_CACHE_SIZE + Defaults.IO_FILE_PAGE_SIZE * 2],
  ])('should read a file %s', async (_name, size) => {
    const contents = patterned(size);

    await withIOFile({ contents, mode: 'r' }, async (ioFile) => {
      // Read the start, then the whole file, which evicts the start of larger files, then the
      // start again
      await expect(ioFile.readAt(0, 16)).resolves.toEqual(contents.subarray(0, 16));
      await expect(ioFile.readAt(0, size)).resolves.toEqual(contents);
      await expect(ioFile.readAt(0, 16)).resolves.toEqual(contents.subarray(0, 16));
    });
  });

  it('should read across pages', async () => {
    const contents = patterned(Defaults.IO_FILE_PAGE_SIZE * 3);
    const position = Defaults.IO_FILE_PAGE_SIZE - 10;
    const size = Defaults.IO_FILE_PAGE_SIZE + 20;

    await withIOFile({ contents, mode: 'r' }, async (ioFile) => {
      await expect(ioFile.readAt(position, size)).resolves.toEqual(
        contents.subarray(position, position + size),
      );
    });
  });

  it('should read fewer bytes at the end of the file', async () => {
    await withIOFile({ contents: 'ABCDEF', mode: 'r' }, async (ioFile) => {
      await expect(ioFile.readAt(4, 16)).resolves.toEqual(Buffer.from('EF'));
      await expect(ioFile.readAt(6, 16)).resolves.toEqual(Buffer.alloc(0));
      await expect(ioFile.readAt(100, 16)).resolves.toEqual(Buffer.alloc(0));
    });
  });

  it('should throw on a negative position', async () => {
    await withIOFile({ contents: 'ABCD', mode: 'r' }, async (ioFile) => {
      await expect(ioFile.readAt(-1, 2)).rejects.toThrow(/negative position -1/);
    });
  });

  it('should read zeros where the file shrank on disk after opening', async () => {
    await withIOFile({ contents: 'ABCDEF', mode: 'r' }, async (ioFile) => {
      await fs.promises.truncate(ioFile.getPathLike(), 2);
      expect(ioFile.getSize()).toEqual(6);
      await expect(ioFile.readAt(0, 6)).resolves.toEqual(Buffer.from('AB\u{0}\u{0}\u{0}\u{0}'));
    });
  });

  it('should read zeros where the file was emptied on disk after opening', async () => {
    await withIOFile({ contents: 'ABCDEF', mode: 'r' }, async (ioFile) => {
      await fs.promises.truncate(ioFile.getPathLike(), 0);
      await expect(ioFile.readAt(0, 6)).resolves.toEqual(Buffer.alloc(6));
    });
  });

  it('should not read past the end of the file when a page extends past it', async () => {
    const expected = Buffer.from(`${'00'.repeat(16)}ff`, 'hex');

    const { contents } = await withIOFile({ size: 16 }, async (ioFile) => {
      // Writing past the end allocates more of the memory buffer than was written
      await ioFile.writeAt(Buffer.from('ff', 'hex'), 16);
      expect(ioFile.getSize()).toEqual(17);
      await expect(ioFile.readAt(0, 64)).resolves.toEqual(expected);
      await expect(ioFile.readAt(20, 4)).resolves.toEqual(Buffer.alloc(0));
    });

    expect(contents).toEqual(expected);
  });
});

describe('write', () => {
  it('should throw with mode: r', async () => {
    const { contents } = await withIOFile({ size: 16, mode: 'r' }, async (ioFile) => {
      await expect(ioFile.write(Buffer.from('ABCDEF01'))).rejects.toThrow(/read-only/);
    });

    expect(contents).toEqual(Buffer.alloc(16));
  });

  it('should write at the read position and advance it', async () => {
    const { contents } = await withIOFile({ size: 12 }, async (ioFile) => {
      ioFile.seek(2);
      await expect(ioFile.write(Buffer.from('ABCDEF01'))).resolves.toEqual(8);
      expect(ioFile.getPosition()).toEqual(10);
      // Past the end of the file
      await expect(ioFile.write(Buffer.from('2345'))).resolves.toEqual(4);
      expect(ioFile.getPosition()).toEqual(14);
      expect(ioFile.getSize()).toEqual(14);
    });

    expect(contents).toEqual(Buffer.from('\u{0}\u{0}ABCDEF012345'));
  });

  test.each(['a', 'ax', 'as+', fs.constants.O_WRONLY | fs.constants.O_APPEND])(
    'should write to the end of the file with mode: %s',
    async (mode) => {
      const { contents } = await withIOFile({ size: 4, mode }, async (ioFile) => {
        await ioFile.write(Buffer.from('ABCDEF01'));
        expect(ioFile.getPosition()).toEqual(12);
        ioFile.seek(0);
        await ioFile.write(Buffer.from('23'));
        expect(ioFile.getPosition()).toEqual(14);
      });

      expect(contents).toEqual(Buffer.from('\u{0}\u{0}\u{0}\u{0}ABCDEF0123'));
    },
  );

  it('should append to a file many bytes at a time', async () => {
    const expected = patterned(Defaults.IO_FILE_PAGE_SIZE + 1000);

    const { contents } = await withIOFile({ mode: 'w+' }, async (ioFile) => {
      for (let position = 0; position < expected.length; position += 100) {
        await ioFile.write(expected.subarray(position, position + 100));
      }
      await expect(ioFile.readAt(0, expected.length)).resolves.toEqual(expected);
    });

    expect(contents).toEqual(expected);
  });
});

describe('writeAt', () => {
  it('should throw with mode: r', async () => {
    const { contents } = await withIOFile({ size: 16, mode: 'r' }, async (ioFile) => {
      await expect(ioFile.writeAt(Buffer.from('ABCDEF01'), 4)).rejects.toThrow(/read-only/);
    });

    expect(contents).toEqual(Buffer.alloc(16));
  });

  describe.each(['r+', 'rs+', 'w', 'wx', fs.constants.O_RDWR, fs.constants.O_WRONLY])(
    'file mode: %s',
    (mode) => {
      it('should overwrite contents', async () => {
        const { contents } = await withIOFile({ size: 16, mode }, async (ioFile) => {
          await expect(ioFile.writeAt(Buffer.from('ABCDEF01'), 6)).resolves.toEqual(8);
          expect(ioFile.getSize()).toEqual(16);
        });

        expect(contents).toEqual(Buffer.from('\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}ABCDEF01\u{0}\u{0}'));
      });

      it('should extend the file size', async () => {
        const { contents } = await withIOFile({ size: 4, mode }, async (ioFile) => {
          await expect(ioFile.writeAt(Buffer.from('ABCDEF01'), 6)).resolves.toEqual(8);
          expect(ioFile.getSize()).toEqual(14);
        });

        expect(contents).toEqual(Buffer.from('\u{0}\u{0}\u{0}\u{0}\u{0}\u{0}ABCDEF01'));
      });
    },
  );

  test.each(['a', 'ax', 'as+', fs.constants.O_WRONLY | fs.constants.O_APPEND])(
    'should write to the end of the file with mode: %s',
    async (mode) => {
      const { contents } = await withIOFile({ size: 4, mode }, async (ioFile) => {
        await expect(ioFile.writeAt(Buffer.from('ABCDEF01'), 0)).resolves.toEqual(8);
        await expect(ioFile.writeAt(Buffer.from('23'), 1)).resolves.toEqual(2);
        expect(ioFile.getSize()).toEqual(14);
      });

      expect(contents).toEqual(Buffer.from('\u{0}\u{0}\u{0}\u{0}ABCDEF0123'));
    },
  );

  it('should throw on a negative position', async () => {
    const { contents } = await withIOFile({ contents: 'ABCD' }, async (ioFile) => {
      await expect(ioFile.writeAt(Buffer.from('ff', 'hex'), -1)).rejects.toThrow(
        /negative position -1/,
      );
    });

    expect(contents).toEqual(Buffer.from('ABCD'));
  });

  it('should not grow a file when writing nothing past its end', async () => {
    const { contents } = await withIOFile({ contents: 'ABCD' }, async (ioFile) => {
      await expect(ioFile.writeAt(Buffer.alloc(0), 1000)).resolves.toEqual(0);
      expect(ioFile.getSize()).toEqual(4);
    });

    expect(contents).toEqual(Buffer.from('ABCD'));
  });

  it('should not grow a file when the write fails', async () => {
    const { contents } = await withIOFile({ contents: 'ABCD' }, async (ioFile) => {
      // The write needs the lock to load its page, which the close holds
      const closing = ioFile.close();
      await expect(ioFile.writeAt(Buffer.from('ff', 'hex'), 1000)).rejects.toThrow('closed');
      await closing;
    });

    expect(contents).toEqual(Buffer.from('ABCD'));
  });

  it('should zero the gap between a cached page and a write past it', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    const initial = patterned(10);
    const expected = Buffer.concat([
      initial,
      Buffer.alloc(pageSize * 2 - initial.length),
      Buffer.from('ff', 'hex'),
    ]);

    const { contents } = await withIOFile({ contents: initial }, async (ioFile) => {
      await ioFile.readAt(0, 1); // cache the first page
      await ioFile.writeAt(Buffer.from('ff', 'hex'), pageSize * 2);
      await expect(ioFile.readAt(0, expected.length)).resolves.toEqual(expected);
    });

    expect(contents).toEqual(expected);
  });

  it('should grow a file larger than the cache', async () => {
    const expected = Buffer.alloc(Defaults.MAX_IO_FILE_CACHE_SIZE + 2);
    Buffer.from('00010203', 'hex').copy(expected);
    expected[Defaults.MAX_IO_FILE_CACHE_SIZE + 1] = 0xff;

    const { contents } = await withIOFile(
      { contents: Buffer.from('00010203', 'hex') },
      async (ioFile) => {
        await ioFile.writeAt(Buffer.from('ff', 'hex'), Defaults.MAX_IO_FILE_CACHE_SIZE + 1);
        expect(ioFile.getSize()).toEqual(Defaults.MAX_IO_FILE_CACHE_SIZE + 2);
      },
    );

    expect(contents).toEqual(expected);
  });

  it('should keep writes to pages evicted from the cache', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    const pageCount = Defaults.MAX_IO_FILE_CACHE_SIZE / pageSize + 2;
    const expected = Buffer.alloc(pageCount * pageSize);
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      expected[pageIndex * pageSize] = pageIndex & 0xff;
    }

    const { contents } = await withIOFile({ size: expected.length }, async (ioFile) => {
      // Write the page index to the start of every page, more pages than the cache holds
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        await ioFile.writeAt(Buffer.from([pageIndex & 0xff]), pageIndex * pageSize);
      }
      // The first pages were evicted, so they're read back from disk
      await expect(ioFile.readAt(0, 1)).resolves.toEqual(Buffer.from([0]));
      await expect(ioFile.readAt(pageSize, 1)).resolves.toEqual(Buffer.from([1]));
    });

    expect(contents).toEqual(expected);
  });

  test.each(['w', 'w+'])(
    'should read evicted pages of a file opened with mode: %s',
    async (mode) => {
      const pageSize = Defaults.IO_FILE_PAGE_SIZE;
      const pageCount = Defaults.MAX_IO_FILE_CACHE_SIZE / pageSize + 2;
      const expected = Buffer.alloc((pageCount - 1) * pageSize + 1);
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        expected[pageIndex * pageSize] = pageIndex & 0xff;
      }
      expected[1] = 0xff;

      const { contents } = await withIOFile({ mode }, async (ioFile) => {
        // More pages than the cache holds, so the first pages are written to disk and evicted
        for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
          await ioFile.writeAt(Buffer.from([pageIndex & 0xff]), pageIndex * pageSize);
        }
        // The first page is read back from disk
        await ioFile.writeAt(Buffer.from([0xff]), 1);
        await expect(ioFile.readAt(0, 2)).resolves.toEqual(Buffer.from([0, 0xff]));
      });

      expect(contents).toEqual(expected);
    },
  );

  it('should stage writes in memory until the file is closed', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    const expected = Buffer.alloc(pageSize * 2);
    for (let position = 0; position < expected.length; position += 1024) {
      expected[position] = 0xff;
    }

    const { contents } = await withIOFile({ size: expected.length }, async (ioFile) => {
      // Many small writes across two pages
      for (let position = 0; position < expected.length; position += 1024) {
        await ioFile.writeAt(Buffer.from([0xff]), position);
      }
      await expect(FsUtil.readFile(ioFile.getPathLike())).resolves.toEqual(
        Buffer.alloc(expected.length),
      );
    });

    expect(contents).toEqual(expected);
  });

  it('should keep every byte of writes to more pages than the cache holds', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    const pageCount = Defaults.MAX_IO_FILE_CACHE_SIZE / pageSize + 2;
    const expected = patterned(pageCount * pageSize);

    const { contents } = await withIOFile({ size: expected.length }, async (ioFile) => {
      // More pages than the cache holds, so dirty pages are evicted, then the rest are flushed
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        await ioFile.writeAt(
          expected.subarray(pageIndex * pageSize, (pageIndex + 1) * pageSize),
          pageIndex * pageSize,
        );
      }
    });

    expect(contents).toEqual(expected);
  });

  it('should overwrite a region spanning partial and whole pages', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    // Overwrites the second page entirely, but only part of the first and third pages
    const written = patterned(pageSize + 20);
    const expected = Buffer.alloc(pageSize * 3);
    written.copy(expected, pageSize - 10);

    const { contents } = await withIOFile({ size: expected.length }, async (ioFile) => {
      await expect(ioFile.writeAt(written, pageSize - 10)).resolves.toEqual(written.length);
      await expect(ioFile.readAt(pageSize - 10, written.length)).resolves.toEqual(written);
    });

    expect(contents).toEqual(expected);
  });

  it('should read and write concurrently', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    const pageCount = Defaults.MAX_IO_FILE_CACHE_SIZE / pageSize + 2;
    const expected = Buffer.alloc(pageCount * pageSize);
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      expected[pageIndex * pageSize + 1] = pageIndex & 0xff;
      expected[pageIndex * pageSize + 2] = 0xff;
    }

    const { result: reads, contents } = await withIOFile(
      { size: expected.length },
      async (ioFile) => {
        // More pages than the cache holds, so pages are evicted while other pages' writes and
        // reads wait
        return await Promise.all(
          Array.from({ length: pageCount }, async (_value, pageIndex) => {
            await ioFile.writeAt(Buffer.from([pageIndex & 0xff, 0xff]), pageIndex * pageSize + 1);
            return await ioFile.readAt(pageIndex * pageSize, 3);
          }),
        );
      },
    );

    expect(reads).toEqual(
      Array.from({ length: pageCount }, (_value, pageIndex) =>
        Buffer.from([0, pageIndex & 0xff, 0xff]),
      ),
    );
    expect(contents).toEqual(expected);
  });

  it('should write more than the cache holds past the end of the file at once', async () => {
    // Evicts the write's own dirty pages before it finishes
    const written = patterned(Defaults.MAX_IO_FILE_CACHE_SIZE + Defaults.IO_FILE_PAGE_SIZE);

    const { contents } = await withIOFile({ mode: 'w+' }, async (ioFile) => {
      await expect(ioFile.writeAt(written, 1)).resolves.toEqual(written.length);
      expect(ioFile.getSize()).toEqual(written.length + 1);
    });

    expect(contents).toEqual(Buffer.concat([Buffer.alloc(1), written]));
  });

  test.each(['w', 'a'])(
    'should write straight to a write-only file with mode: %s',
    async (mode) => {
      denyReadWriteOpens();

      const { contents } = await withIOFile({ contents: 'ABCD', mode }, async (ioFile) => {
        await expect(ioFile.writeAt(Buffer.from('EF'), 1)).resolves.toEqual(2);
        await expect(ioFile.readAt(0, 1)).rejects.toThrow('write-only');
        // Written straight to disk, rather than staged until the file is closed
        await expect(FsUtil.readFile(ioFile.getPathLike())).resolves.toEqual(
          Buffer.from(mode === 'w' ? '\u{0}EF' : 'ABCDEF'),
        );
      });

      expect(contents).toEqual(Buffer.from(mode === 'w' ? '\u{0}EF' : 'ABCDEF'));
    },
  );
});

describe('copyRange', () => {
  const SAME_FILE_COPY_SOURCE = patterned(Defaults.IO_FILE_PAGE_SIZE * 6);

  test.each([
    ['source', 4, -1],
    ['target', -1, 0],
  ])('should throw on a negative %s position', async (_name, targetStart, sourceStart) => {
    const { contents } = await withIOFile({ contents: 'ABCDEF' }, async (ioFile) => {
      await expect(ioFile.copyRange(ioFile, targetStart, sourceStart, 2)).rejects.toThrow(
        /negative position -1/,
      );
    });

    expect(contents).toEqual(Buffer.from('ABCDEF'));
  });

  it('should copy a region spanning multiple chunks to another file', async () => {
    const source = patterned(Defaults.FILE_READING_CHUNK_SIZE + 100);

    const { result: copied, contents } = await withIOFiles(
      [{ contents: source }, { contents: Buffer.alloc(source.length) }],
      async ([sourceIOFile, targetIOFile]) =>
        await sourceIOFile.copyRange(targetIOFile, 5, 10, source.length - 20),
    );
    const [sourceAfter, targetAfter] = contents;

    expect(copied).toEqual(source.length - 30);
    expect(sourceAfter).toEqual(source);
    expect(targetAfter).toEqual(
      Buffer.concat([Buffer.alloc(5), source.subarray(10, -20), Buffer.alloc(25)]),
    );
  });

  it('should copy the whole file by default', async () => {
    const source = patterned(Defaults.FILE_READING_CHUNK_SIZE + 1);

    const { result: copied, contents } = await withIOFiles(
      [{ contents: source }, { contents: Buffer.alloc(0) }],
      async ([sourceIOFile, targetIOFile]) => await sourceIOFile.copyRange(targetIOFile),
    );
    const [, targetAfter] = contents;

    expect(copied).toEqual(source.length);
    expect(targetAfter).toEqual(source);
  });

  it('should stop at the end of the source', async () => {
    const source = patterned(Defaults.FILE_READING_CHUNK_SIZE + 1);

    const { result: copied, contents } = await withIOFiles(
      [{ contents: source }, { contents: Buffer.alloc(0) }],
      async ([sourceIOFile, targetIOFile]) =>
        await sourceIOFile.copyRange(targetIOFile, 0, 1, source.length * 3),
    );
    const [, targetAfter] = contents;

    expect(copied).toEqual(source.length - 1);
    expect(targetAfter).toEqual(source.subarray(1));
  });

  it('should copy to an earlier region of the same file', async () => {
    const source = patterned(Defaults.FILE_READING_CHUNK_SIZE + 100);

    const { result: copied, contents: sourceAfter } = await withIOFile(
      { contents: source },
      async (ioFile) => await ioFile.copyRange(ioFile, 0, 3),
    );

    expect(copied).toEqual(source.length - 3);
    expect(sourceAfter).toEqual(Buffer.concat([source.subarray(3), source.subarray(-3)]));
  });

  test.each(
    [
      0,
      1,
      Defaults.IO_FILE_PAGE_SIZE / 2,
      Defaults.IO_FILE_PAGE_SIZE - 1,
      Defaults.IO_FILE_PAGE_SIZE + 1,
    ].flatMap((sourceStart) =>
      [
        0,
        1,
        2,
        3,
        Defaults.IO_FILE_PAGE_SIZE / 2 + 1,
        Defaults.IO_FILE_PAGE_SIZE - 1,
        Defaults.IO_FILE_PAGE_SIZE,
        Defaults.IO_FILE_PAGE_SIZE + 1,
        Defaults.IO_FILE_PAGE_SIZE * 2 + 1,
      ].map((distance) => [sourceStart, distance]),
    ),
  )(
    'should copy from position %s to %s bytes later in the same file',
    async (sourceStart, distance) => {
      const source = SAME_FILE_COPY_SOURCE;
      const size = Defaults.IO_FILE_PAGE_SIZE * 3 + 5;

      const { result: copied, contents: sourceAfter } = await withIOFile(
        { contents: source },
        async (ioFile) =>
          await ioFile.copyRange(ioFile, sourceStart + distance, sourceStart, sourceStart + size),
      );

      // Copy a byte at a time
      const expected = Buffer.alloc(Math.max(source.length, sourceStart + distance + size));
      source.copy(expected);
      for (let offset = 0; offset < size; offset += 1) {
        expected[sourceStart + distance + offset] = expected[sourceStart + offset];
      }
      expect(copied).toEqual(size);
      expect(sourceAfter).toEqual(expected);
    },
  );

  it('should copy nothing when the source is empty', async () => {
    const source = patterned(10);

    const { result: copied, contents: sourceAfter } = await withIOFile(
      { contents: source },
      async (ioFile) => await ioFile.copyRange(ioFile, 7, 3, 3),
    );

    expect(copied).toEqual(0);
    expect(sourceAfter).toEqual(source);
  });

  it('should copy to an overlapping position in another file', async () => {
    const source = patterned(Defaults.IO_FILE_PAGE_SIZE * 2 + 100);

    const { result: copied, contents } = await withIOFiles(
      [{ contents: source }, { contents: Buffer.alloc(source.length) }],
      // Positions that would overlap if the source and target were the same file
      async ([sourceIOFile, targetIOFile]) =>
        await sourceIOFile.copyRange(targetIOFile, 13, 10, source.length - 3),
    );
    const [, targetAfter] = contents;

    expect(copied).toEqual(source.length - 13);
    expect(targetAfter).toEqual(Buffer.concat([Buffer.alloc(13), source.subarray(10, -3)]));
  });

  test.each([
    ['less than a page', 15],
    ['more than a page', Defaults.IO_FILE_PAGE_SIZE + 15],
  ])(
    'should copy zeros from past the end of the same file to %s later',
    async (_name, distance) => {
      const source = patterned(10);
      const sourceStart = 5;
      const size = distance * 3;

      const { result: copied, contents: sourceAfter } = await withIOFile(
        { contents: source },
        async (ioFile) =>
          await ioFile.copyRange(ioFile, sourceStart + distance, sourceStart, sourceStart + size),
      );

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
    const { contents } = await withIOFiles(
      [{ contents: 'ABCDEF0123456789', mode: 'r' }, { contents: '----------' }],
      async ([sourceIOFile, targetIOFile]) => {
        sourceIOFile.seek(10);
        await expect(sourceIOFile.copyNext(targetIOFile, 2, 4)).resolves.toEqual(4);
        expect(sourceIOFile.getPosition()).toEqual(14);
        await expect(sourceIOFile.copyNext(targetIOFile, 6, 100)).resolves.toEqual(2);
        expect(sourceIOFile.getPosition()).toEqual(114);
      },
    );
    const [, targetAfter] = contents;

    expect(targetAfter).toEqual(Buffer.from('--456789--'));
  });
});

describe('truncate', () => {
  test.each([
    // [name, cached, initial hex, truncate size, expected hex]
    ['shrink', 'a cached', '00010203040506070809', 4, '00010203'],
    ['shrink', 'an uncached', '00010203040506070809', 4, '00010203'],
    ['zero-extend', 'a cached', '00010203', 8, '0001020300000000'],
    ['zero-extend', 'an uncached', '00010203', 8, '0001020300000000'],
  ])('should %s %s file', async (_name, cached, initialHex, truncateSize, expectedHex) => {
    const { contents } = await withIOFile(
      { contents: Buffer.from(initialHex, 'hex') },
      async (ioFile) => {
        if (cached === 'a cached') {
          await ioFile.readAt(0, 1); // cache the first page
        }
        await ioFile.truncate(truncateSize);
        expect(ioFile.getSize()).toEqual(truncateSize);
        await expect(ioFile.readAt(0, 1024)).resolves.toEqual(Buffer.from(expectedHex, 'hex'));
      },
    );

    expect(contents).toEqual(Buffer.from(expectedHex, 'hex'));
  });

  it('should zero-extend a cached file past the end of its page', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    const expected = Buffer.concat([Buffer.from('00010203', 'hex'), Buffer.alloc(pageSize)]);

    const { contents } = await withIOFile(
      { contents: Buffer.from('00010203', 'hex') },
      async (ioFile) => {
        await ioFile.readAt(0, 1); // cache the first page
        await ioFile.truncate(pageSize + 4);
        await expect(ioFile.readAt(0, pageSize * 2)).resolves.toEqual(expected);
      },
    );

    expect(contents).toEqual(expected);
  });

  it('should read zeros from the zero-extended part of an uncached file', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    const expected = Buffer.concat([Buffer.from('ABCD'), Buffer.alloc(pageSize * 2 - 4)]);

    const { contents } = await withIOFile({ contents: 'ABCD' }, async (ioFile) => {
      await ioFile.truncate(pageSize * 2);
      await expect(ioFile.readAt(0, pageSize * 2)).resolves.toEqual(expected);
    });

    expect(contents).toEqual(expected);
  });

  it('should zero the gap when writing past a shrunk end', async () => {
    const { contents } = await withIOFile(
      { contents: Buffer.from('00010203040506070809', 'hex') },
      async (ioFile) => {
        await ioFile.readAt(0, 1); // cache the first page
        await ioFile.truncate(4);
        await ioFile.writeAt(Buffer.from('ff', 'hex'), 8);
      },
    );

    expect(contents).toEqual(Buffer.from('0001020300000000ff', 'hex'));
  });

  it('should zero-extend after a shrink', async () => {
    const { contents } = await withIOFile(
      { contents: Buffer.from('00010203040506070809', 'hex') },
      async (ioFile) => {
        await ioFile.readAt(0, 1); // cache the first page
        await ioFile.truncate(4);
        await ioFile.truncate(8);
        await expect(ioFile.readAt(0, 1024)).resolves.toEqual(
          Buffer.from('0001020300000000', 'hex'),
        );
      },
    );

    expect(contents).toEqual(Buffer.from('0001020300000000', 'hex'));
  });

  it('should drop cached pages past the new end of a multi-page file', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    const initial = patterned(pageSize * 3);
    const expected = Buffer.concat([initial.subarray(0, 10), Buffer.alloc(pageSize * 3 - 10)]);

    const { contents } = await withIOFile({ contents: initial }, async (ioFile) => {
      // Cache and dirty every page, then shrink into the first page and zero-extend back
      await ioFile.writeAt(Buffer.alloc(pageSize * 3, 0xff), 0);
      await ioFile.writeAt(initial, 0);
      await ioFile.truncate(10);
      await ioFile.truncate(pageSize * 3);
      await expect(ioFile.readAt(0, pageSize * 3)).resolves.toEqual(expected);
    });

    expect(contents).toEqual(expected);
  });

  it('should truncate to zero bytes when the size is negative', async () => {
    const { contents } = await withIOFile({ contents: 'ABCD' }, async (ioFile) => {
      await ioFile.truncate(-1);
      expect(ioFile.getSize()).toEqual(0);
      await expect(ioFile.readAt(0, 4)).resolves.toEqual(Buffer.alloc(0));
    });

    expect(contents).toEqual(Buffer.alloc(0));
  });
});

describe('close', () => {
  it('should do nothing when the file is already closed', async () => {
    const { contents } = await withIOFile({ mode: 'w+' }, async (ioFile) => {
      await ioFile.writeAt(Buffer.from('ABCDEF01'), 4);
      await ioFile.close();
      await expect(ioFile.close()).resolves.toBeUndefined();
    });

    expect(contents).toEqual(Buffer.from('\u{0}\u{0}\u{0}\u{0}ABCDEF01'));
  });

  it('should flush pages written in reverse order', async () => {
    const pageSize = Defaults.IO_FILE_PAGE_SIZE;
    const expected = patterned(pageSize * 4);

    const { contents } = await withIOFile({ size: expected.length }, async (ioFile) => {
      for (let pageIndex = 3; pageIndex >= 0; pageIndex -= 1) {
        await ioFile.writeAt(
          expected.subarray(pageIndex * pageSize, (pageIndex + 1) * pageSize),
          pageIndex * pageSize,
        );
      }
    });

    expect(contents).toEqual(expected);
  });

  it('should throw when using the file after closing it', async () => {
    const { contents } = await withIOFile({ contents: 'ABCDEF01' }, async (ioFile) => {
      await ioFile.readAt(0, 1); // cache the first page
      await ioFile.close();

      await expect(ioFile.readAt(0, 1)).rejects.toThrow('closed');
      await expect(ioFile.readNext(1)).rejects.toThrow('closed');
      await expect(ioFile.readUntil(0, 1)).rejects.toThrow('closed');
      await expect(ioFile.writeAt(Buffer.alloc(Defaults.IO_FILE_PAGE_SIZE), 0)).rejects.toThrow(
        'closed',
      );
      await expect(ioFile.copyRange(ioFile, 4)).rejects.toThrow('closed');
      await expect(ioFile.copyRange(ioFile, 4, 0, 0)).rejects.toThrow('closed');
      await expect(ioFile.copyNext(ioFile, 4, 1)).rejects.toThrow('closed');
      expect(ioFile.getPosition()).toEqual(0);
      await expect(ioFile.truncate(0)).rejects.toThrow('closed');
    });

    expect(contents).toEqual(Buffer.from('ABCDEF01'));
  });

  it('should throw when using the file while it closes', async () => {
    const { contents } = await withIOFile({ contents: 'ABCDEF01' }, async (ioFile) => {
      // The read needs the lock to load its page, which the close holds
      const closing = ioFile.close();
      await expect(ioFile.readAt(0, 1)).rejects.toThrow('closed');
      await closing;
    });

    expect(contents).toEqual(Buffer.from('ABCDEF01'));
  });

  it('should close the file handle even if flushing staged writes fails', async () => {
    const openedHandles = spyOnOpenedHandles();

    const { contents } = await withIOFile({ contents: Buffer.alloc(16) }, async (ioFile) => {
      await ioFile.writeAt(Buffer.from('ABCDEF01'), 0);
      // Writing the file's initial contents opened a handle first
      const [handle] = openedHandles.slice(-1);
      vi.spyOn(handle, 'writev').mockRejectedValue(new Error('flush failed'));

      await expect(ioFile.close()).rejects.toThrow('flush failed');
      expect(handle.fd).toEqual(-1);
    });

    expect(contents).toEqual(Buffer.alloc(16));
  });
});
