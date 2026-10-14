import path from 'node:path';

import Defaults from '../../../src/globals/defaults.js';
import Temp from '../../../src/globals/temp.js';
import IOFile from '../../../src/models/files/ioFile.js';
import IOFileCursor from '../../../src/models/files/ioFileCursor.js';
import FsUtil from '../../../src/utils/fsUtil.js';

if (!(await FsUtil.exists(Temp.getTempDir()))) {
  await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
}

/** Bytes that differ from their neighbors, so misplaced reads are caught */
const patterned = (size: number): Buffer =>
  Buffer.from(Array.from({ length: size }, (_value, idx) => (idx * 7 + 3) & 0xff));

/**
 * Write {@link contents} to a temp file, then call {@link callback} with it opened as an
 * {@link IOFile}, returning its contents after it's closed.
 */
const withIOFile = async (
  contents: Buffer,
  callback: (ioFile: IOFile) => Promise<void> | void,
): Promise<Buffer> => {
  const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
  try {
    await FsUtil.writeFile(tempFile, contents);
    const ioFile = await IOFile.fileFrom(tempFile, 'r+');
    try {
      await callback(ioFile);
    } finally {
      await ioFile.close();
    }
    return await FsUtil.readFile(tempFile);
  } finally {
    await FsUtil.rm(tempFile, { force: true });
  }
};

describe('getPathLike', () => {
  it("should return the file's path", async () => {
    await withIOFile(patterned(10), (ioFile) => {
      expect(IOFileCursor.cursorFromFile(ioFile).getPathLike()).toEqual(ioFile.getPathLike());
    });
  });
});

describe('cursorFromFile', () => {
  it("should start at the file's read position by default", async () => {
    await withIOFile(patterned(10), (ioFile) => {
      ioFile.seek(4);
      expect(IOFileCursor.cursorFromFile(ioFile).getPosition()).toEqual(4);
    });
  });

  it('should start at the given position', async () => {
    await withIOFile(patterned(10), (ioFile) => {
      expect(IOFileCursor.cursorFromFile(ioFile, 7).getPosition()).toEqual(7);
    });
  });
});

describe('getPosition', () => {
  it("should not move the file's read position", async () => {
    await withIOFile(patterned(10), async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile);
      await cursor.readNext(5);
      expect(cursor.getPosition()).toEqual(5);
      expect(ioFile.getPosition()).toEqual(0);
    });
  });

  it("should not be moved by the file's or another cursor's read position", async () => {
    const contents = patterned(1000);
    await withIOFile(contents, async (ioFile) => {
      const first = IOFileCursor.cursorFromFile(ioFile, 10);
      const second = IOFileCursor.cursorFromFile(ioFile, 500);
      await expect(first.readNext(5)).resolves.toEqual(contents.subarray(10, 15));
      ioFile.seek(900);
      await expect(second.readNext(5)).resolves.toEqual(contents.subarray(500, 505));
      await expect(first.readNext(5)).resolves.toEqual(contents.subarray(15, 20));
      expect(first.getPosition()).toEqual(20);
      expect(second.getPosition()).toEqual(505);
      expect(ioFile.getPosition()).toEqual(900);
    });
  });
});

describe('getSize', () => {
  it("should return the file's size", async () => {
    await withIOFile(patterned(10), (ioFile) => {
      expect(IOFileCursor.cursorFromFile(ioFile).getSize()).toEqual(10);
    });
  });
});

describe('isEOF', () => {
  test.each([
    [0, false],
    [9, false],
    [10, true],
    [11, true],
  ])('should return if position %s is at the end of the file: %s', async (position, expected) => {
    await withIOFile(patterned(10), (ioFile) => {
      expect(IOFileCursor.cursorFromFile(ioFile, position).isEOF()).toEqual(expected);
    });
  });
});

describe('seek', () => {
  it('should move the read position backward and forward', async () => {
    const contents = patterned(10);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile);
      cursor.seek(6);
      await expect(cursor.readNext(2)).resolves.toEqual(contents.subarray(6, 8));
      cursor.seek(1);
      await expect(cursor.readNext(2)).resolves.toEqual(contents.subarray(1, 3));
    });
  });
});

describe('skipNext', () => {
  it('should advance the read position', async () => {
    const contents = patterned(10);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile);
      cursor.skipNext(3);
      expect(cursor.getPosition()).toEqual(3);
      await expect(cursor.readNext(2)).resolves.toEqual(contents.subarray(3, 5));
    });
  });
});

describe('peekNext', () => {
  it('should not advance the read position', async () => {
    const contents = patterned(10);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile);
      await expect(cursor.peekNext(4)).resolves.toEqual(contents.subarray(0, 4));
      await expect(cursor.peekNext(4)).resolves.toEqual(contents.subarray(0, 4));
      expect(cursor.getPosition()).toEqual(0);
    });
  });

  it('should return fewer bytes at the end of the file', async () => {
    const contents = patterned(10);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile, 8);
      await expect(cursor.peekNext(4)).resolves.toEqual(contents.subarray(8));
      cursor.seek(10);
      await expect(cursor.peekNext(4)).resolves.toEqual(Buffer.alloc(0));
    });
  });

  it('should return a copy that can be modified without affecting later reads', async () => {
    const contents = patterned(10);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile);
      const peeked = await cursor.peekNext(4);
      peeked.fill(0);
      await expect(cursor.peekNext(4)).resolves.toEqual(contents.subarray(0, 4));
    });
  });

  it('should read sizes larger than a chunk', async () => {
    const contents = patterned(Defaults.FILE_READING_CHUNK_SIZE * 2 + 100);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile, 50);
      await expect(cursor.peekNext(Defaults.FILE_READING_CHUNK_SIZE * 2)).resolves.toEqual(
        contents.subarray(50, 50 + Defaults.FILE_READING_CHUNK_SIZE * 2),
      );
    });
  });
});

describe('readNext', () => {
  it('should read many small values with one read from the file', async () => {
    const contents = patterned(1000);
    await withIOFile(contents, async (ioFile) => {
      const readAtSpy = vi.spyOn(ioFile, 'readAt');
      const cursor = IOFileCursor.cursorFromFile(ioFile);

      const values: Buffer[] = [];
      for (let i = 0; i < 100; i += 1) {
        values.push(await cursor.readNext(3));
        cursor.skipNext(2);
      }

      expect(Buffer.concat(values)).toEqual(
        Buffer.concat(
          Array.from({ length: 100 }, (_value, idx) => contents.subarray(idx * 5, idx * 5 + 3)),
        ),
      );
      expect(readAtSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('should read values that span chunks', async () => {
    const contents = patterned(Defaults.FILE_READING_CHUNK_SIZE * 2 + 100);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile, Defaults.FILE_READING_CHUNK_SIZE - 2);
      await expect(cursor.readNext(4)).resolves.toEqual(
        contents.subarray(
          Defaults.FILE_READING_CHUNK_SIZE - 2,
          Defaults.FILE_READING_CHUNK_SIZE + 2,
        ),
      );
      expect(cursor.getPosition()).toEqual(Defaults.FILE_READING_CHUNK_SIZE + 2);
    });
  });

  it('should advance by the requested size at the end of the file', async () => {
    const contents = patterned(10);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile, 8);
      await expect(cursor.readNext(4)).resolves.toEqual(contents.subarray(8));
      expect(cursor.getPosition()).toEqual(12);
      expect(cursor.isEOF()).toEqual(true);
    });
  });
});

describe('copyNext', () => {
  it('should copy a region spanning multiple chunks to another file', async () => {
    const source = patterned(Defaults.FILE_READING_CHUNK_SIZE * 2 + 100);
    const target = Buffer.alloc(source.length);

    let copied = 0;
    let position = 0;
    const targetAfter = await withIOFile(target, async (targetFile) => {
      await withIOFile(source, async (sourceFile) => {
        const cursor = IOFileCursor.cursorFromFile(sourceFile, 10);
        copied = await cursor.copyNext(targetFile, 5, source.length - 30);
        position = cursor.getPosition();
      });
    });

    expect(copied).toEqual(source.length - 30);
    expect(position).toEqual(source.length - 20);
    expect(targetAfter).toEqual(
      Buffer.concat([Buffer.alloc(5), source.subarray(10, -20), Buffer.alloc(25)]),
    );
  });

  it('should stop at the end of the file, but advance by the requested size', async () => {
    const source = patterned(10);
    const target = Buffer.alloc(10);

    let copied = 0;
    let position = 0;
    const targetAfter = await withIOFile(target, async (targetFile) => {
      await withIOFile(source, async (sourceFile) => {
        const cursor = IOFileCursor.cursorFromFile(sourceFile, 6);
        copied = await cursor.copyNext(targetFile, 0, 100);
        position = cursor.getPosition();
      });
    });

    expect(copied).toEqual(4);
    expect(position).toEqual(106);
    expect(targetAfter).toEqual(Buffer.concat([source.subarray(6), Buffer.alloc(6)]));
  });
});

describe('readUntil', () => {
  it('should read up to the delimiter and advance past it', async () => {
    const contents = Buffer.from([1, 2, 3, 0, 4, 5, 0, 6]);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile);
      await expect(cursor.readUntil(0, 100)).resolves.toEqual({
        data: Buffer.from([1, 2, 3]),
        delimiterFound: true,
      });
      await expect(cursor.readUntil(0, 100)).resolves.toEqual({
        data: Buffer.from([4, 5]),
        delimiterFound: true,
      });
      await expect(cursor.readUntil(0, 100)).resolves.toEqual({
        data: Buffer.from([6]),
        delimiterFound: false,
      });
      expect(cursor.getPosition()).toEqual(8);
      await expect(cursor.readUntil(0, 100)).resolves.toEqual({
        data: Buffer.alloc(0),
        delimiterFound: false,
      });
    });
  });

  it('should read an empty value when the delimiter is next', async () => {
    const contents = Buffer.from([0, 1]);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile);
      await expect(cursor.readUntil(0, 100)).resolves.toEqual({
        data: Buffer.alloc(0),
        delimiterFound: true,
      });
      expect(cursor.getPosition()).toEqual(1);
    });
  });

  it('should not read past the max size', async () => {
    const contents = Buffer.from([1, 2, 3, 0, 4]);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile);
      await expect(cursor.readUntil(0, 3)).resolves.toEqual({
        data: Buffer.from([1, 2, 3]),
        delimiterFound: false,
      });
      expect(cursor.getPosition()).toEqual(3);
    });
  });

  it('should read a value that spans chunks a chunk at a time', async () => {
    const contents = Buffer.concat([
      Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE + 10, 1),
      Buffer.from([0, 2]),
    ]);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile);
      await expect(cursor.readUntil(0, contents.length)).resolves.toEqual({
        data: Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE, 1),
        delimiterFound: false,
      });
      await expect(cursor.readUntil(0, contents.length)).resolves.toEqual({
        data: Buffer.alloc(10, 1),
        delimiterFound: true,
      });
      expect(cursor.getPosition()).toEqual(Defaults.FILE_READING_CHUNK_SIZE + 11);
    });
  });
});

describe('readAt', () => {
  it('should read from the read-ahead buffer without changing the read position', async () => {
    const contents = patterned(1000);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile);
      await cursor.peekNext(1);
      const readAtSpy = vi.spyOn(ioFile, 'readAt');

      await expect(cursor.readAt(100, 50)).resolves.toEqual(contents.subarray(100, 150));
      await expect(cursor.readAt(990, 50)).resolves.toEqual(contents.subarray(990));
      expect(readAtSpy).toHaveBeenCalledTimes(0);
      expect(cursor.getPosition()).toEqual(0);
    });
  });

  it('should read outside the read-ahead buffer from the file', async () => {
    const contents = patterned(Defaults.FILE_READING_CHUNK_SIZE * 2);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile);
      await cursor.peekNext(1);
      const readAtSpy = vi.spyOn(ioFile, 'readAt');

      const position = Defaults.FILE_READING_CHUNK_SIZE + 5;
      await expect(cursor.readAt(position, 10)).resolves.toEqual(
        contents.subarray(position, position + 10),
      );
      expect(readAtSpy).toHaveBeenCalledTimes(1);
      // The read-ahead buffer wasn't replaced
      await expect(cursor.readNext(10)).resolves.toEqual(contents.subarray(0, 10));
      expect(readAtSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('write', () => {
  it("should write at the cursor's read position, without moving the file's", async () => {
    const contents = patterned(10);
    const contentsAfter = await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile, 4);
      await expect(cursor.write(Buffer.from([0xaa, 0xbb]))).resolves.toEqual(2);
      expect(cursor.getPosition()).toEqual(6);
      expect(ioFile.getPosition()).toEqual(0);
    });

    expect(contentsAfter).toEqual(
      Buffer.concat([contents.subarray(0, 4), Buffer.from([0xaa, 0xbb]), contents.subarray(6)]),
    );
  });
});

describe('writeAt', () => {
  it('should read back bytes written over the read-ahead buffer', async () => {
    const contents = patterned(10);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile);
      await cursor.peekNext(10);

      await expect(cursor.writeAt(Buffer.from([0xaa, 0xbb]), 3)).resolves.toEqual(2);
      await expect(cursor.readNext(10)).resolves.toEqual(
        Buffer.concat([contents.subarray(0, 3), Buffer.from([0xaa, 0xbb]), contents.subarray(5)]),
      );
    });
  });

  it('should read back bytes written past the end of the file', async () => {
    const contents = patterned(10);
    await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile, 8);
      await cursor.peekNext(10);

      await cursor.writeAt(Buffer.from([0xaa, 0xbb]), 10);
      await expect(cursor.readNext(10)).resolves.toEqual(
        Buffer.concat([contents.subarray(8), Buffer.from([0xaa, 0xbb])]),
      );
    });
  });
});

describe('copyChunked', () => {
  it('should copy a region to another file', async () => {
    const source = patterned(10);
    const target = Buffer.alloc(10);

    let copied = 0;
    const targetAfter = await withIOFile(target, async (targetFile) => {
      await withIOFile(source, async (sourceFile) => {
        const cursor = IOFileCursor.cursorFromFile(sourceFile);
        copied = await cursor.copyChunked(IOFileCursor.cursorFromFile(targetFile), 2, 4, 9);
        expect(cursor.getPosition()).toEqual(0);
      });
    });

    expect(copied).toEqual(5);
    expect(targetAfter).toEqual(
      Buffer.concat([Buffer.alloc(2), source.subarray(4, 9), Buffer.alloc(3)]),
    );
  });

  it('should repeat bytes when copying forward within the file, and read them back', async () => {
    const source = Buffer.concat([Buffer.from('abc'), Buffer.alloc(7)]);
    const sourceAfter = await withIOFile(source, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile);
      await cursor.peekNext(10);

      await expect(cursor.copyChunked(cursor, 3, 0, 7)).resolves.toEqual(7);
      await expect(cursor.readNext(10)).resolves.toEqual(Buffer.from('abcabcabca'));
    });

    expect(sourceAfter).toEqual(Buffer.from('abcabcabca'));
  });
});

describe('truncate', () => {
  it('should read back the truncated file', async () => {
    const contents = patterned(10);
    const contentsAfter = await withIOFile(contents, async (ioFile) => {
      const cursor = IOFileCursor.cursorFromFile(ioFile);
      await cursor.peekNext(10);

      await cursor.truncate(4);
      expect(cursor.getSize()).toEqual(4);
      await expect(cursor.readNext(10)).resolves.toEqual(contents.subarray(0, 4));
    });

    expect(contentsAfter).toEqual(contents.subarray(0, 4));
  });
});

describe('close', () => {
  it('should close the underlying file, flushing writes', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'file'));
    try {
      await FsUtil.writeFile(tempFile, patterned(10));
      const ioFile = await IOFile.fileFrom(tempFile, 'r+');
      const cursor = IOFileCursor.cursorFromFile(ioFile, 4);
      await cursor.write(Buffer.from([0xaa, 0xbb]));
      await cursor.close();

      await expect(FsUtil.readFile(tempFile)).resolves.toEqual(
        Buffer.concat([
          patterned(10).subarray(0, 4),
          Buffer.from([0xaa, 0xbb]),
          patterned(10).subarray(6),
        ]),
      );
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });
});
