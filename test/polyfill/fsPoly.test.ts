import os from 'node:os';
import path from 'node:path';

import Temp from '../../src/globals/temp.js';
import FsPoly from '../../src/polyfill/fsPoly.js';
import IOFile from '../../src/polyfill/ioFile.js';
import IgirException from '../../src/types/exceptions/igirException.js';

describe('canSymlink', () => {
  it('should not throw', async () => {
    await expect(FsPoly.canSymlink(Temp.getTempDir())).resolves.toBeDefined();
  });
});

describe('copyDir', () => {
  // TODO(cemmer)
});

describe.each([
  ['copyFile', FsPoly.copyFile.bind(FsPoly)],
  ['hardlink', FsPoly.hardlink.bind(FsPoly)],
  ['reflink', FsPoly.reflink.bind(FsPoly)],
  ['symlink', FsPoly.symlink.bind(FsPoly)],
])('%s', (_, writeFunction) => {
  it("should throw when source file doesn't exist", async () => {
    const tempSrc = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'src'));
    const tempDest = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'dest'));
    await expect(writeFunction(tempSrc, tempDest)).rejects.toThrow(IgirException);
  });

  it("should throw when destination folder doesn't exist", async () => {
    const tempSrc = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'src'));
    const tempDest = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'nonexistent', 'dest'));
    await FsPoly.touch(tempSrc);
    try {
      await expect(writeFunction(tempSrc, tempDest)).rejects.toThrow(IgirException);
    } finally {
      await FsPoly.rm(tempSrc);
    }
  });

  it('should write a file', async () => {
    const tempSrc = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'src'));
    const tempDest = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'dest'));
    try {
      await FsPoly.touch(tempSrc);
      await expect(FsPoly.exists(tempDest)).resolves.toEqual(false);
      await writeFunction(tempSrc, tempDest);
      await expect(FsPoly.exists(tempDest)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempSrc);
      await FsPoly.rm(tempDest);
    }
  });

  it('should handle a lot of concurrency', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      const tempSrc = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'src'));
      await (await IOFile.fileOfSize(tempSrc, 'w', 512 * 1024)).close();

      await Promise.all(
        [...Array.from({ length: 256 }).keys()].map(async (number) => {
          const tempDest = path.join(tempDir, `dest.${number}`);
          await writeFunction(tempSrc, tempDest);
          await expect(FsPoly.exists(tempDest)).resolves.toEqual(true);
        }),
      );
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should overwrite an existing file', async () => {
    const tempSrc = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'src'));
    const tempDest = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'dest'));
    try {
      await FsPoly.touch(tempSrc);
      await FsPoly.touch(tempDest);
      await expect(FsPoly.exists(tempDest)).resolves.toEqual(true);
      await writeFunction(tempSrc, tempDest);
      await expect(FsPoly.exists(tempDest)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempSrc);
      await FsPoly.rm(tempDest);
    }
  });
});

describe('copyFileCow', () => {
  // TODO(cemmer)
});

describe('dirs', () => {
  // TODO(cemmer)
});

describe('diskResolved', () => {
  // TODO(cemmer)
});

describe('exists', () => {
  it('should return false for a non-existent file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);
  });

  it('should return true for a directory', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      await expect(FsPoly.exists(tempDir)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true });
    }
  });

  it('should return true for a plain file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    try {
      await expect(FsPoly.isDirectory(tempFile)).resolves.toEqual(false);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should return true for a symlink', async () => {
    const tempFileTarget = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsPoly.touch(tempFileTarget);
      await FsPoly.symlink(tempFileTarget, tempFileLink);
      await expect(FsPoly.exists(tempFileLink)).resolves.toEqual(true);
      await expect(FsPoly.exists(tempFileTarget)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempFileTarget, { force: true });
      await FsPoly.rm(tempFileLink, { force: true });
    }
  });

  it('should return true for a broken symlink', async () => {
    const tempFileTarget = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsPoly.touch(tempFileTarget);
      await FsPoly.symlink(tempFileTarget, tempFileLink);
      await FsPoly.rm(tempFileTarget);
      await expect(FsPoly.exists(tempFileLink)).resolves.toEqual(true);
      await expect(FsPoly.exists(tempFileTarget)).resolves.toEqual(false);
    } finally {
      await FsPoly.rm(tempFileTarget, { force: true });
      await FsPoly.rm(tempFileLink, { force: true });
    }
  });

  it('should return true for a hardlink', async () => {
    const tempFileTarget = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsPoly.touch(tempFileTarget);
      await FsPoly.hardlink(tempFileTarget, tempFileLink);
      await expect(FsPoly.exists(tempFileLink)).resolves.toEqual(true);
      await expect(FsPoly.exists(tempFileTarget)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempFileTarget, { force: true });
      await FsPoly.rm(tempFileLink, { force: true });
    }
  });
});

describe('existsSync', () => {
  it('should return false for a non-existent file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    expect(FsPoly.existsSync(tempFile)).toEqual(false);
  });

  it('should return true for a directory', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      expect(FsPoly.existsSync(tempDir)).toEqual(true);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true });
    }
  });

  it('should return true for a plain file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    try {
      expect(FsPoly.existsSync(tempFile)).toEqual(true);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should return true for a symlink', async () => {
    const tempFileTarget = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsPoly.touch(tempFileTarget);
      await FsPoly.symlink(tempFileTarget, tempFileLink);
      expect(FsPoly.existsSync(tempFileLink)).toEqual(true);
      expect(FsPoly.existsSync(tempFileTarget)).toEqual(true);
    } finally {
      await FsPoly.rm(tempFileTarget, { force: true });
      await FsPoly.rm(tempFileLink, { force: true });
    }
  });

  it('should return true for a broken symlink', async () => {
    const tempFileTarget = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsPoly.touch(tempFileTarget);
      await FsPoly.symlink(tempFileTarget, tempFileLink);
      await FsPoly.rm(tempFileTarget);
      expect(FsPoly.existsSync(tempFileLink)).toEqual(true);
      expect(FsPoly.existsSync(tempFileTarget)).toEqual(false);
    } finally {
      await FsPoly.rm(tempFileTarget, { force: true });
      await FsPoly.rm(tempFileLink, { force: true });
    }
  });

  it('should return true for a hardlink', async () => {
    const tempFileTarget = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsPoly.touch(tempFileTarget);
      await FsPoly.hardlink(tempFileTarget, tempFileLink);
      expect(FsPoly.existsSync(tempFileLink)).toEqual(true);
      expect(FsPoly.existsSync(tempFileTarget)).toEqual(true);
    } finally {
      await FsPoly.rm(tempFileTarget, { force: true });
      await FsPoly.rm(tempFileLink, { force: true });
    }
  });
});

describe('inode', () => {
  // TODO(cemmer)
});

describe('isDirectory', () => {
  it('should return true for a directory', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      await expect(FsPoly.isDirectory(tempDir)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true });
    }
  });

  it('should return false for a file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    await expect(FsPoly.isDirectory(tempFile)).resolves.toEqual(false);
    await FsPoly.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsPoly.isDirectory(tempFile)).resolves.toEqual(false);
  });
});

describe('isDirectorySync', () => {
  it('should return true for a directory', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    expect(FsPoly.isDirectorySync(tempDir)).toEqual(true);
  });

  it('should return false for a file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    expect(FsPoly.isDirectorySync(tempFile)).toEqual(false);
    FsPoly.rmSync(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    expect(FsPoly.isDirectorySync(tempFile)).toEqual(false);
  });
});

describe('isExecutable', () => {
  // TODO(cemmer)
});

describe('isFile', () => {
  // TODO(cemmer)
});

describe('isHardlink', () => {
  it('should return true for a hardlink', async () => {
    const tempFileTarget = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsPoly.touch(tempFileTarget);

      await FsPoly.hardlink(tempFileTarget, tempFileLink);
      await expect(FsPoly.isHardlink(tempFileLink)).resolves.toEqual(true);
      await expect(FsPoly.isHardlink(tempFileTarget)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempFileTarget, { force: true });
      await FsPoly.rm(tempFileLink, { force: true });
    }
  });

  it('should return false for a symlink', async () => {
    const tempFileTarget = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsPoly.touch(tempFileTarget);

      await FsPoly.symlink(tempFileTarget, tempFileLink);
      await expect(FsPoly.isHardlink(tempFileLink)).resolves.toEqual(false);
      await expect(FsPoly.isHardlink(tempFileTarget)).resolves.toEqual(false);
    } finally {
      await FsPoly.rm(tempFileTarget, { force: true });
      await FsPoly.rm(tempFileLink, { force: true });
    }
  });

  it('should return false for a file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    await expect(FsPoly.isHardlink(tempFile)).resolves.toEqual(false);
    await FsPoly.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsPoly.isHardlink(tempFile)).resolves.toEqual(false);
  });
});

describe('isSamba', () => {
  test.each(['.', os.devNull, 'test', path.resolve('test')])(
    'should return false: %s',
    (filePath) => {
      expect(FsPoly.isSamba(filePath)).toEqual(false);
    },
  );

  test.each(['//foo/bar', '\\\\foo\\bar'])('should return true: %s', (filePath) => {
    expect(FsPoly.isSamba(filePath)).toEqual(true);
  });
});

describe('isSymlink', () => {
  it('should return false for a hard link', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsPoly.hardlink(tempFile, tempLink);
    await expect(FsPoly.isSymlink(tempLink)).resolves.toEqual(false);
    await FsPoly.rm(tempLink);
    await FsPoly.rm(tempFile);
  });

  it('should return true for a symlink', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsPoly.symlink(tempFile, tempLink);
    await expect(FsPoly.isSymlink(tempLink)).resolves.toEqual(true);
    await FsPoly.rm(tempLink);
    await FsPoly.rm(tempFile);
  });

  it('should return false for a plain directory', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    await expect(FsPoly.isSymlink(tempDir)).resolves.toEqual(false);
  });

  it('should return false for a plain file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    await expect(FsPoly.isSymlink(tempFile)).resolves.toEqual(false);
    await FsPoly.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsPoly.isSymlink(tempFile)).resolves.toEqual(false);
  });
});

describe('isSymlinkSync', () => {
  it('should return false for a hard link', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsPoly.hardlink(tempFile, tempLink);
    expect(FsPoly.isSymlinkSync(tempLink)).toEqual(false);
    await FsPoly.rm(tempLink);
    await FsPoly.rm(tempFile);
  });

  it('should return true for a symlink', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsPoly.symlink(tempFile, tempLink);
    expect(FsPoly.isSymlinkSync(tempLink)).toEqual(true);
    await FsPoly.rm(tempLink);
    await FsPoly.rm(tempFile);
  });

  it('should return false for a plain directory', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    expect(FsPoly.isSymlinkSync(tempDir)).toEqual(false);
  });

  it('should return false for a plain file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    expect(FsPoly.isSymlinkSync(tempFile)).toEqual(false);
    await FsPoly.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    expect(FsPoly.isSymlinkSync(tempFile)).toEqual(false);
  });
});

describe('isWritable', () => {
  // TODO(cemmer)
});

describe('makeLegal', () => {
  describe('unix', () => {
    test.each([
      // Test equality
      ['file.rom', 'file.rom'],
      ['roms/file.rom', 'roms/file.rom'],
      ['/roms/file.rom', '/roms/file.rom'],
      // Test illegal names
      ['Dwayne "The Rock" Jonson.rom', 'Dwayne _The Rock_ Jonson.rom'],
    ])('should make the file path legal: %s', (input, expected) => {
      expect(FsPoly.makeLegal(input, '/')).toEqual(expected);
    });
  });

  describe('windows', () => {
    test.each([
      // Test equality
      ['file.rom', 'file.rom'],
      ['roms\\file.rom', 'roms\\file.rom'],
      ['C:\\roms\\file.rom', 'C:\\roms\\file.rom'],
      // Test drive letter semicolon preservation
      ['C:\\ro:ms\\fi:le.rom', 'C:\\ro;ms\\fi;le.rom'],
      // Test illegal names
      ['Dwayne "The Rock" Jonson.rom', 'Dwayne _The Rock_ Jonson.rom'],
    ])('should make the file path legal: %s', (input, expected) => {
      expect(FsPoly.makeLegal(input, '\\')).toEqual(expected);
    });
  });
});

describe('mkdir', () => {
  // TODO(cemmer)
});

describe('mkdtemp', () => {
  // TODO(cemmer)
});

describe('mktemp', () => {
  // TODO(cemmer)
});

describe('mv', () => {
  // TODO(cemmer)
});

describe('readFile', () => {
  // TODO(cemmer)
});

describe('readlink', () => {
  it('should throw on hard links', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsPoly.hardlink(tempFile, tempLink);

    await expect(FsPoly.readlink(tempLink)).rejects.toThrow(/non-symlink/);

    await FsPoly.rm(tempLink);
    await FsPoly.rm(tempFile);
  });

  it('should read absolute symlinks', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileAbsolute = path.resolve(tempFile);
    await FsPoly.symlink(tempFileAbsolute, tempLink);

    const readLink = await FsPoly.readlink(tempLink);
    expect(readLink).toEqual(tempFileAbsolute);
    expect(path.isAbsolute(readLink)).toEqual(true);

    await FsPoly.rm(tempLink);
    await FsPoly.rm(tempFile);
  });

  it('should read relative symlinks', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileRelative = await FsPoly.symlinkRelativePath(tempFile, tempLink);
    await FsPoly.symlink(tempFileRelative, tempLink);

    const readLink = await FsPoly.readlink(tempLink);
    expect(readLink).toEqual(tempFileRelative);
    expect(path.isAbsolute(readLink)).toEqual(false);

    await FsPoly.rm(tempLink);
    await FsPoly.rm(tempFile);
  });

  it('should throw on plain files', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);

    await expect(FsPoly.readlink(tempFile)).rejects.toThrow(/non-symlink/);

    await FsPoly.rm(tempFile);
  });

  it('should throw on directories', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());

    await expect(FsPoly.readlink(tempDir)).rejects.toThrow(/non-symlink/);

    await FsPoly.rm(tempDir);
  });
});

describe('readlinkSync', () => {
  it('should throw on hard links', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsPoly.hardlink(tempFile, tempLink);

    expect(() => FsPoly.readlinkSync(tempLink)).toThrow(/non-symlink/);

    await FsPoly.rm(tempLink);
    await FsPoly.rm(tempFile);
  });

  it('should read absolute symlinks', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileAbsolute = path.resolve(tempFile);
    await FsPoly.symlink(tempFileAbsolute, tempLink);

    const readLink = FsPoly.readlinkSync(tempLink);
    expect(readLink).toEqual(tempFileAbsolute);
    expect(path.isAbsolute(readLink)).toEqual(true);

    await FsPoly.rm(tempLink);
    await FsPoly.rm(tempFile);
  });

  it('should read relative symlinks', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileRelative = await FsPoly.symlinkRelativePath(tempFile, tempLink);
    await FsPoly.symlink(tempFileRelative, tempLink);

    const readLink = FsPoly.readlinkSync(tempLink);
    expect(readLink).toEqual(tempFileRelative);
    expect(path.isAbsolute(readLink)).toEqual(false);

    await FsPoly.rm(tempLink);
    await FsPoly.rm(tempFile);
  });

  it('should throw on plain files', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);

    expect(() => FsPoly.readlinkSync(tempFile)).toThrow(/non-symlink/);

    await FsPoly.rm(tempFile);
  });

  it('should throw on directories', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());

    expect(() => FsPoly.readlinkSync(tempDir)).toThrow(/non-symlink/);

    await FsPoly.rm(tempDir);
  });
});

describe('readlinkResolved', () => {
  it('should read absolute symlinks', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileAbsolute = path.resolve(tempFile);
    await FsPoly.symlink(tempFileAbsolute, tempLink);

    const readLinkResolved = await FsPoly.readlinkResolved(tempLink);
    expect(readLinkResolved).toEqual(tempFileAbsolute);
    expect(path.isAbsolute(readLinkResolved)).toEqual(true);

    await FsPoly.rm(tempLink);
    await FsPoly.rm(tempFile);
  });

  it('should read relative symlinks', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileRelative = await FsPoly.symlinkRelativePath(tempFile, tempLink);
    await FsPoly.symlink(tempFileRelative, tempLink);

    const readLinkResolved = await FsPoly.readlinkResolved(tempLink);
    expect(readLinkResolved).not.toEqual(tempFileRelative);
    expect(readLinkResolved).toEqual(path.resolve(tempFile));
    expect(path.isAbsolute(readLinkResolved)).toEqual(true);

    await FsPoly.rm(tempLink);
    await FsPoly.rm(tempFile);
  });
});

describe('readlinkResolvedSync', () => {
  it('should read absolute symlinks', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileAbsolute = path.resolve(tempFile);
    await FsPoly.symlink(tempFileAbsolute, tempLink);

    const readLinkResolved = FsPoly.readlinkResolvedSync(tempLink);
    expect(readLinkResolved).toEqual(tempFileAbsolute);
    expect(path.isAbsolute(readLinkResolved)).toEqual(true);

    await FsPoly.rm(tempLink);
    await FsPoly.rm(tempFile);
  });

  it('should read relative symlinks', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileRelative = await FsPoly.symlinkRelativePath(tempFile, tempLink);
    await FsPoly.symlink(tempFileRelative, tempLink);

    const readLinkResolved = FsPoly.readlinkResolvedSync(tempLink);
    expect(readLinkResolved).not.toEqual(tempFileRelative);
    expect(readLinkResolved).toEqual(path.resolve(tempFile));
    expect(path.isAbsolute(readLinkResolved)).toEqual(true);

    await FsPoly.rm(tempLink);
    await FsPoly.rm(tempFile);
  });
});

describe('realpath', () => {
  it('should throw on non-existent path', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsPoly.realpath(tempFile)).rejects.toThrow();
  });

  it('should resolve existing paths', async () => {
    await expect(FsPoly.realpath('.')).resolves.toEqual(process.cwd());
  });
});

describe('rm', () => {
  it('should throw on missing file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);
    await expect(FsPoly.rm(tempFile)).rejects.toThrow();
  });

  it('should not throw on forcing missing file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);
    await expect(FsPoly.rm(tempFile, { force: true })).resolves.toEqual(undefined);
  });

  it('should delete an existing file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(true);
    await FsPoly.rm(tempFile);
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);
  });

  it('should delete an existing directory', async () => {
    const tempDir = await FsPoly.mkdtemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsPoly.exists(tempDir)).resolves.toEqual(true);
    await FsPoly.rm(tempDir);
    await expect(FsPoly.exists(tempDir)).resolves.toEqual(false);
  });

  it("should not delete a symlink's target", async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsPoly.symlink(tempFile, tempLink);
    await expect(FsPoly.exists(tempLink)).resolves.toEqual(true);
    await FsPoly.rm(tempLink);
    await expect(FsPoly.exists(tempLink)).resolves.toEqual(false);
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(true);
    await FsPoly.rm(tempFile);
  });
});

describe('rmSync', () => {
  it('should throw on missing file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);
    expect(() => {
      FsPoly.rmSync(tempFile);
    }).toThrow();
  });

  it('should not throw on forcing missing file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);
    expect(() => {
      FsPoly.rmSync(tempFile, { force: true });
    }).not.toThrow();
  });

  it('should delete an existing file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(true);
    FsPoly.rmSync(tempFile);
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);
  });

  it('should delete an existing directory', async () => {
    const tempDir = await FsPoly.mkdtemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsPoly.exists(tempDir)).resolves.toEqual(true);
    FsPoly.rmSync(tempDir);
    await expect(FsPoly.exists(tempDir)).resolves.toEqual(false);
  });

  it("should not delete a symlink's target", async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsPoly.symlink(tempFile, tempLink);
    await expect(FsPoly.exists(tempLink)).resolves.toEqual(true);
    FsPoly.rmSync(tempLink);
    await expect(FsPoly.exists(tempLink)).resolves.toEqual(false);
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(true);
    FsPoly.rmSync(tempFile);
  });
});

describe('size', () => {
  // TODO(cemmer)
});

describe('stat', () => {
  // TODO(cemmer)
});

describe('touch', () => {
  it('should mkdir and touch', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    await FsPoly.rm(tempDir, { recursive: true });
    const tempFile = await FsPoly.mktemp(path.join(tempDir, 'temp'));
    try {
      await FsPoly.touch(tempFile);
      await expect(FsPoly.exists(tempFile)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('walk', () => {
  // TODO(cemmer)
});

describe('writeFile', () => {
  // TODO(cemmer)
});
