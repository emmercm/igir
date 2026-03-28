import path from 'node:path';

import Defaults from '../../src/globals/defaults.js';
import Temp from '../../src/globals/temp.js';
import FsPoly from '../../src/polyfill/fsPoly.js';
import IOFile from '../../src/polyfill/ioFile.js';

if (!(await FsPoly.exists(Temp.getTempDir()))) {
  await FsPoly.mkdir(Temp.getTempDir(), { recursive: true });
}

describe('fileOfSize', () => {
  it('should delete an existing file', async () => {
    const size = 8080;

    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsPoly.touch(tempFile);
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(true);

    try {
      const file = await IOFile.fileOfSize(tempFile, 'r', size);
      await file.close();
      expect(file.getPathLike()).toEqual(tempFile);
      await expect(FsPoly.size(tempFile)).resolves.toEqual(size);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  test.each([1, 42, 226, 1337, 8_675_309])('should create a file of size: %s', async (size) => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);

    try {
      const file = await IOFile.fileOfSize(tempFile, 'r', size);
      await file.close();
      expect(file.getPathLike()).toEqual(tempFile);
      await expect(FsPoly.size(tempFile)).resolves.toEqual(size);
    } finally {
      await FsPoly.rm(tempFile);
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
      const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));
      await FsPoly.copyFile(filePath, tempFile);
      const tempSymlink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'symlink'));
      await FsPoly.symlink(path.resolve(tempFile), tempSymlink);

      const file = await IOFile.fileFrom(tempSymlink, 'r');
      try {
        expect(file.getSize()).toEqual(expectedSize);
      } finally {
        await file.close();
        await FsPoly.rm(tempSymlink);
        await FsPoly.rm(tempFile);
      }
    },
  );

  test.each(filesWithSizes)(
    'should get size of hard linked file: %s',
    async (filePath, expectedSize) => {
      const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));
      await FsPoly.copyFile(filePath, tempFile);
      const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
      await FsPoly.hardlink(tempFile, tempLink);

      const file = await IOFile.fileFrom(tempLink, 'r');
      try {
        expect(file.getSize()).toEqual(expectedSize);
      } finally {
        await file.close();
        await FsPoly.rm(tempLink);
        await FsPoly.rm(tempFile);
      }
    },
  );
});

describe('readNext', () => {
  it('should read from the beginning', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsPoly.writeFile(tempFile, 'ABCDEF0123456789');

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      await expect(file.readNext(2)).resolves.toEqual(Buffer.from('AB'));
      await expect(file.readNext(3)).resolves.toEqual(Buffer.from('CDE'));
      await expect(file.readNext(4)).resolves.toEqual(Buffer.from('F012'));
    } finally {
      await file.close();
      await FsPoly.rm(tempFile);
    }
  });

  it('should respect seek', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsPoly.writeFile(tempFile, 'ABCDEF0123456789');

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      await expect(file.readNext(2)).resolves.toEqual(Buffer.from('AB'));
      await expect(file.readNext(3)).resolves.toEqual(Buffer.from('CDE'));
      file.seek(0);
      await expect(file.readNext(4)).resolves.toEqual(Buffer.from('ABCD'));
    } finally {
      await file.close();
      await FsPoly.rm(tempFile);
    }
  });

  it('should respect skipNext', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));
    await FsPoly.writeFile(tempFile, 'ABCDEF0123456789');

    const file = await IOFile.fileFrom(tempFile, 'r');
    try {
      await expect(file.readNext(2)).resolves.toEqual(Buffer.from('AB'));
      await expect(file.readNext(3)).resolves.toEqual(Buffer.from('CDE'));
      file.skipNext(4);
      await expect(file.readNext(5)).resolves.toEqual(Buffer.from('34567'));
    } finally {
      await file.close();
      await FsPoly.rm(tempFile);
    }
  });
});

describe('readAt', () => {
  it('should read a small file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);

    const file = await IOFile.fileOfSize(tempFile, 'r', Defaults.MAX_MEMORY_FILE_SIZE - 1);
    try {
      await expect(file.readAt(0, 16)).resolves.toEqual(Buffer.alloc(16));
    } finally {
      await file.close();
      await FsPoly.rm(tempFile);
    }
  });

  it('should read a large file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);

    const file = await IOFile.fileOfSize(tempFile, 'r', Defaults.MAX_MEMORY_FILE_SIZE + 1);
    try {
      await expect(file.readAt(0, 16)).resolves.toEqual(Buffer.alloc(16));
    } finally {
      await file.close();
      await FsPoly.rm(tempFile);
    }
  });
});

describe('write', () => {
  describe('file mode: r', () => {
    it('should throw on write', async () => {
      const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));

      try {
        const file = await IOFile.fileOfSize(tempFile, 'r', 16);
        await expect(file.write(Buffer.from('ABCDEF01'))).rejects.toThrow();
        await file.close();

        const contents = await FsPoly.readFile(tempFile);
        expect(contents).toEqual(
          Buffer.from('\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'),
        );
      } finally {
        await FsPoly.rm(tempFile);
      }
    });
  });

  describe.each(['r+', 'a'])('file mode: %s', (openMode) => {
    it('should overwrite contents', async () => {
      const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));

      try {
        const file = await IOFile.fileOfSize(tempFile, openMode, 16);
        await file.write(Buffer.from('ABCDEF01'));
        await file.close();

        const contents = await FsPoly.readFile(tempFile);
        expect(contents).toEqual(Buffer.from('ABCDEF01\x00\x00\x00\x00\x00\x00\x00\x00'));
      } finally {
        await FsPoly.rm(tempFile);
      }
    });

    it('should extend the file size', async () => {
      const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));

      try {
        const file = await IOFile.fileOfSize(tempFile, openMode, 4);
        await file.write(Buffer.from('ABCDEF01'));
        await file.close();

        const contents = await FsPoly.readFile(tempFile);
        expect(contents).toEqual(Buffer.from('ABCDEF01'));
      } finally {
        await FsPoly.rm(tempFile);
      }
    });
  });
});

describe('writeAt', () => {
  describe('file mode: r', () => {
    it('should throw on write', async () => {
      const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));

      try {
        const file = await IOFile.fileOfSize(tempFile, 'r', 16);
        await expect(file.writeAt(Buffer.from('ABCDEF01'), 4)).rejects.toThrow();
        await file.close();

        const contents = await FsPoly.readFile(tempFile);
        expect(contents).toEqual(
          Buffer.from('\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'),
        );
      } finally {
        await FsPoly.rm(tempFile);
      }
    });
  });

  describe.each(['r+', 'a'])('file mode: %s', (openMode) => {
    it('should overwrite contents', async () => {
      const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));

      try {
        const file = await IOFile.fileOfSize(tempFile, openMode, 16);
        await file.writeAt(Buffer.from('ABCDEF01'), 6);
        await file.close();

        const contents = await FsPoly.readFile(tempFile);
        expect(contents).toEqual(Buffer.from('\x00\x00\x00\x00\x00\x00ABCDEF01\x00\x00'));
      } finally {
        await FsPoly.rm(tempFile);
      }
    });

    it('should extend the file size', async () => {
      const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'file'));

      try {
        const file = await IOFile.fileOfSize(tempFile, openMode, 4);
        await file.writeAt(Buffer.from('ABCDEF01'), 6);
        await file.close();

        const contents = await FsPoly.readFile(tempFile);
        expect(contents).toEqual(Buffer.from('\x00\x00\x00\x00\x00\x00ABCDEF01'));
      } finally {
        await FsPoly.rm(tempFile);
      }
    });
  });
});
