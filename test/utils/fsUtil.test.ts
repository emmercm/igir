import os from 'node:os';
import path from 'node:path';

import IgirException from '../../src/exceptions/igirException.js';
import Temp from '../../src/globals/temp.js';
import IOFile from '../../src/models/files/ioFile.js';
import FsUtil, { MoveResult, WalkMode } from '../../src/utils/fsUtil.js';

if (!(await FsUtil.exists(Temp.getTempDir()))) {
  await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
}

describe('canSymlink', () => {
  it('should not throw', async () => {
    await expect(FsUtil.canSymlink(Temp.getTempDir())).resolves.toBeDefined();
  });
});

describe('copyDir', () => {
  it('should copy a directory recursively', async () => {
    const srcDir = await FsUtil.mkdtemp(Temp.getTempDir());
    const destDir = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'dest'));
    try {
      // Given a source directory with files and a subdirectory
      await FsUtil.writeFile(path.join(srcDir, 'file1.txt'), 'hello');
      await FsUtil.mkdir(path.join(srcDir, 'sub'), { recursive: true });
      await FsUtil.writeFile(path.join(srcDir, 'sub', 'file2.txt'), 'world');

      await FsUtil.copyDir(srcDir, destDir);

      await expect(FsUtil.isFile(path.join(destDir, 'file1.txt'))).resolves.toEqual(true);
      await expect(FsUtil.isFile(path.join(destDir, 'sub', 'file2.txt'))).resolves.toEqual(true);
      const file1Contents = await FsUtil.readFile(path.join(destDir, 'file1.txt'));
      expect(file1Contents.toString()).toEqual('hello');
      const file2Contents = await FsUtil.readFile(path.join(destDir, 'sub', 'file2.txt'));
      expect(file2Contents.toString()).toEqual('world');
    } finally {
      await FsUtil.rm(srcDir, { recursive: true, force: true });
      await FsUtil.rm(destDir, { recursive: true, force: true });
    }
  });

  it('should copy an empty directory', async () => {
    const srcDir = await FsUtil.mkdtemp(Temp.getTempDir());
    const destDir = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'dest'));
    try {
      await FsUtil.copyDir(srcDir, destDir);

      await expect(FsUtil.isDirectory(destDir)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(srcDir, { recursive: true, force: true });
      await FsUtil.rm(destDir, { recursive: true, force: true });
    }
  });
});

describe.each([
  ['copyFile', FsUtil.copyFile.bind(FsUtil)],
  ['hardlink', FsUtil.hardlink.bind(FsUtil)],
  ['reflink', FsUtil.reflink.bind(FsUtil)],
  ['symlink', FsUtil.symlink.bind(FsUtil)],
])('%s', (_, writeFunction) => {
  it("should throw when source file doesn't exist", async () => {
    const tempSrc = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'src'));
    const tempDest = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'dest'));
    await expect(writeFunction(tempSrc, tempDest)).rejects.toThrow(IgirException);
  });

  it("should throw when destination folder doesn't exist", async () => {
    const tempSrc = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'src'));
    const tempDest = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'nonexistent', 'dest'));
    await FsUtil.touch(tempSrc);
    try {
      await expect(writeFunction(tempSrc, tempDest)).rejects.toThrow(IgirException);
    } finally {
      await FsUtil.rm(tempSrc);
    }
  });

  it('should write a file', async () => {
    const tempSrc = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'src'));
    const tempDest = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'dest'));
    try {
      await FsUtil.touch(tempSrc);
      await expect(FsUtil.exists(tempDest)).resolves.toEqual(false);
      await writeFunction(tempSrc, tempDest);
      await expect(FsUtil.exists(tempDest)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempSrc);
      await FsUtil.rm(tempDest);
    }
  });

  it.skipIf(process.versions.bun)('should handle a lot of concurrency', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const tempSrc = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'src'));
      await (await IOFile.fileOfSize(tempSrc, 'w', 512 * 1024)).close();

      await Promise.all(
        [...Array.from({ length: 256 }).keys()].map(async (number) => {
          const tempDest = path.join(tempDir, `dest.${number}`);
          await writeFunction(tempSrc, tempDest);
          await expect(FsUtil.exists(tempDest)).resolves.toEqual(true);
        }),
      );
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should overwrite an existing file', async () => {
    const tempSrc = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'src'));
    const tempDest = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'dest'));
    try {
      await FsUtil.touch(tempSrc);
      await FsUtil.touch(tempDest);
      await expect(FsUtil.exists(tempDest)).resolves.toEqual(true);
      await writeFunction(tempSrc, tempDest);
      await expect(FsUtil.exists(tempDest)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempSrc);
      await FsUtil.rm(tempDest);
    }
  });
});

describe('dirs', () => {
  it('should return only directories', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      // Given a dir with both files and subdirs
      await FsUtil.mkdir(path.join(tempDir, 'subdir1'), { recursive: true });
      await FsUtil.mkdir(path.join(tempDir, 'subdir2'), { recursive: true });
      await FsUtil.touch(path.join(tempDir, 'file.txt'));

      const dirs = await FsUtil.dirs(tempDir);

      // Then only directories are returned
      expect(dirs).toHaveLength(2);
      expect(dirs).toContain(path.join(tempDir, 'subdir1'));
      expect(dirs).toContain(path.join(tempDir, 'subdir2'));
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should return empty array for directory with only files', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      await FsUtil.touch(path.join(tempDir, 'file.txt'));

      const dirs = await FsUtil.dirs(tempDir);

      expect(dirs).toHaveLength(0);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('exists', () => {
  it('should return false for a non-existent file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(false);
  });

  it('should return true for a directory', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      await expect(FsUtil.exists(tempDir)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });

  it('should return true for a plain file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    try {
      await expect(FsUtil.isDirectory(tempFile)).resolves.toEqual(false);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should return true for a symlink', async () => {
    const tempFileTarget = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsUtil.touch(tempFileTarget);
      await FsUtil.symlink(tempFileTarget, tempFileLink);
      await expect(FsUtil.exists(tempFileLink)).resolves.toEqual(true);
      await expect(FsUtil.exists(tempFileTarget)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempFileTarget, { force: true });
      await FsUtil.rm(tempFileLink, { force: true });
    }
  });

  it('should return true for a broken symlink', async () => {
    const tempFileTarget = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsUtil.touch(tempFileTarget);
      await FsUtil.symlink(tempFileTarget, tempFileLink);
      await FsUtil.rm(tempFileTarget);
      await expect(FsUtil.exists(tempFileLink)).resolves.toEqual(true);
      await expect(FsUtil.exists(tempFileTarget)).resolves.toEqual(false);
    } finally {
      await FsUtil.rm(tempFileTarget, { force: true });
      await FsUtil.rm(tempFileLink, { force: true });
    }
  });

  it('should return true for a hardlink', async () => {
    const tempFileTarget = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsUtil.touch(tempFileTarget);
      await FsUtil.hardlink(tempFileTarget, tempFileLink);
      await expect(FsUtil.exists(tempFileLink)).resolves.toEqual(true);
      await expect(FsUtil.exists(tempFileTarget)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempFileTarget, { force: true });
      await FsUtil.rm(tempFileLink, { force: true });
    }
  });
});

describe('existsSync', () => {
  it('should return false for a non-existent file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    expect(FsUtil.existsSync(tempFile)).toEqual(false);
  });

  it('should return true for a directory', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      expect(FsUtil.existsSync(tempDir)).toEqual(true);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });

  it('should return true for a plain file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    try {
      expect(FsUtil.existsSync(tempFile)).toEqual(true);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should return true for a symlink', async () => {
    const tempFileTarget = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsUtil.touch(tempFileTarget);
      await FsUtil.symlink(tempFileTarget, tempFileLink);
      expect(FsUtil.existsSync(tempFileLink)).toEqual(true);
      expect(FsUtil.existsSync(tempFileTarget)).toEqual(true);
    } finally {
      await FsUtil.rm(tempFileTarget, { force: true });
      await FsUtil.rm(tempFileLink, { force: true });
    }
  });

  it('should return true for a broken symlink', async () => {
    const tempFileTarget = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsUtil.touch(tempFileTarget);
      await FsUtil.symlink(tempFileTarget, tempFileLink);
      await FsUtil.rm(tempFileTarget);
      expect(FsUtil.existsSync(tempFileLink)).toEqual(true);
      expect(FsUtil.existsSync(tempFileTarget)).toEqual(false);
    } finally {
      await FsUtil.rm(tempFileTarget, { force: true });
      await FsUtil.rm(tempFileLink, { force: true });
    }
  });

  it('should return true for a hardlink', async () => {
    const tempFileTarget = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsUtil.touch(tempFileTarget);
      await FsUtil.hardlink(tempFileTarget, tempFileLink);
      expect(FsUtil.existsSync(tempFileLink)).toEqual(true);
      expect(FsUtil.existsSync(tempFileTarget)).toEqual(true);
    } finally {
      await FsUtil.rm(tempFileTarget, { force: true });
      await FsUtil.rm(tempFileLink, { force: true });
    }
  });
});

describe('inode', () => {
  it('should return an inode number for a file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    try {
      const inode = await FsUtil.inode(tempFile);
      expect(typeof inode).toEqual('number');
      expect(inode).toBeGreaterThan(0);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should return the same inode for a hardlink', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    try {
      await FsUtil.hardlink(tempFile, tempLink);

      const inodeFile = await FsUtil.inode(tempFile);
      const inodeLink = await FsUtil.inode(tempLink);
      expect(inodeFile).toEqual(inodeLink);
    } finally {
      await FsUtil.rm(tempFile, { force: true });
      await FsUtil.rm(tempLink, { force: true });
    }
  });

  it('should return different inodes for different files', async () => {
    const tempFile1 = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp1'));
    const tempFile2 = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp2'));
    await FsUtil.touch(tempFile1);
    await FsUtil.touch(tempFile2);
    try {
      const inode1 = await FsUtil.inode(tempFile1);
      const inode2 = await FsUtil.inode(tempFile2);
      expect(inode1).not.toEqual(inode2);
    } finally {
      await FsUtil.rm(tempFile1, { force: true });
      await FsUtil.rm(tempFile2, { force: true });
    }
  });
});

describe('isDirectory', () => {
  it('should return true for a directory', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      await expect(FsUtil.isDirectory(tempDir)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });

  it('should return false for a file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    await expect(FsUtil.isDirectory(tempFile)).resolves.toEqual(false);
    await FsUtil.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsUtil.isDirectory(tempFile)).resolves.toEqual(false);
  });
});

describe('isDirectorySync', () => {
  it('should return true for a directory', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    expect(FsUtil.isDirectorySync(tempDir)).toEqual(true);
  });

  it('should return false for a file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    expect(FsUtil.isDirectorySync(tempFile)).toEqual(false);
    FsUtil.rmSync(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    expect(FsUtil.isDirectorySync(tempFile)).toEqual(false);
  });
});

describe.skipIf(process.platform === 'win32')('isExecutable', () => {
  it('should return false for a non-executable file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    try {
      // Remove the executable bit
      await import('node:fs').then(async (fs) => {
        await fs.promises.chmod(tempFile, 0o644);
      });
      await expect(FsUtil.isExecutable(tempFile)).resolves.toEqual(false);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should return true for an executable file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    try {
      // Set the executable bit
      await import('node:fs').then(async (fs) => {
        await fs.promises.chmod(tempFile, 0o755);
      });
      await expect(FsUtil.isExecutable(tempFile)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should return false for a non-existent file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsUtil.isExecutable(tempFile)).resolves.toEqual(false);
  });
});

describe('isFile', () => {
  it('should return true for a plain file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    try {
      await expect(FsUtil.isFile(tempFile)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should return false for a directory', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      await expect(FsUtil.isFile(tempDir)).resolves.toEqual(false);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });

  it('should return false for a non-existent path', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsUtil.isFile(tempFile)).resolves.toEqual(false);
  });

  it('should follow symlinks and return true for a symlink to a file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsUtil.touch(tempFile);
    try {
      await FsUtil.symlink(tempFile, tempLink);
      await expect(FsUtil.isFile(tempLink)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempFile, { force: true });
      await FsUtil.rm(tempLink, { force: true });
    }
  });
});

describe('isHardlink', () => {
  it('should return true for a hardlink', async () => {
    const tempFileTarget = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsUtil.touch(tempFileTarget);

      await FsUtil.hardlink(tempFileTarget, tempFileLink);
      await expect(FsUtil.isHardlink(tempFileLink)).resolves.toEqual(true);
      await expect(FsUtil.isHardlink(tempFileTarget)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempFileTarget, { force: true });
      await FsUtil.rm(tempFileLink, { force: true });
    }
  });

  it('should return false for a symlink', async () => {
    const tempFileTarget = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await FsUtil.touch(tempFileTarget);

      await FsUtil.symlink(tempFileTarget, tempFileLink);
      await expect(FsUtil.isHardlink(tempFileLink)).resolves.toEqual(false);
      await expect(FsUtil.isHardlink(tempFileTarget)).resolves.toEqual(false);
    } finally {
      await FsUtil.rm(tempFileTarget, { force: true });
      await FsUtil.rm(tempFileLink, { force: true });
    }
  });

  it('should return false for a file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    await expect(FsUtil.isHardlink(tempFile)).resolves.toEqual(false);
    await FsUtil.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsUtil.isHardlink(tempFile)).resolves.toEqual(false);
  });
});

describe('isSamba', () => {
  test.each(['.', os.devNull, 'test', path.resolve('test')])(
    'should return false: %s',
    (filePath) => {
      expect(FsUtil.isSamba(filePath)).toEqual(false);
    },
  );

  test.each(['\\\\foo\\bar', 'smb://foo/bar', '/mnt/smb/foo/bar'])(
    'should return true: %s',
    (filePath) => {
      expect(FsUtil.isSamba(filePath)).toEqual(true);
    },
  );
});

describe('isSymlink', () => {
  it('should return false for a hard link', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsUtil.hardlink(tempFile, tempLink);
    await expect(FsUtil.isSymlink(tempLink)).resolves.toEqual(false);
    await FsUtil.rm(tempLink);
    await FsUtil.rm(tempFile);
  });

  it('should return true for a symlink', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsUtil.symlink(tempFile, tempLink);
    await expect(FsUtil.isSymlink(tempLink)).resolves.toEqual(true);
    await FsUtil.rm(tempLink);
    await FsUtil.rm(tempFile);
  });

  it('should return false for a plain directory', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    await expect(FsUtil.isSymlink(tempDir)).resolves.toEqual(false);
  });

  it('should return false for a plain file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    await expect(FsUtil.isSymlink(tempFile)).resolves.toEqual(false);
    await FsUtil.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsUtil.isSymlink(tempFile)).resolves.toEqual(false);
  });
});

describe('isSymlinkSync', () => {
  it('should return false for a hard link', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsUtil.hardlink(tempFile, tempLink);
    expect(FsUtil.isSymlinkSync(tempLink)).toEqual(false);
    await FsUtil.rm(tempLink);
    await FsUtil.rm(tempFile);
  });

  it('should return true for a symlink', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsUtil.symlink(tempFile, tempLink);
    expect(FsUtil.isSymlinkSync(tempLink)).toEqual(true);
    await FsUtil.rm(tempLink);
    await FsUtil.rm(tempFile);
  });

  it('should return false for a plain directory', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    expect(FsUtil.isSymlinkSync(tempDir)).toEqual(false);
  });

  it('should return false for a plain file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    expect(FsUtil.isSymlinkSync(tempFile)).toEqual(false);
    await FsUtil.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    expect(FsUtil.isSymlinkSync(tempFile)).toEqual(false);
  });
});

describe('isWritable', () => {
  it('should return true for a writable existing file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    try {
      await expect(FsUtil.isWritable(tempFile)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should return true for a non-existent path in a writable dir', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    // File does not exist yet
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(false);

    const writable = await FsUtil.isWritable(tempFile);

    // File should not have been left behind
    expect(writable).toEqual(true);
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(false);
  });
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
      expect(FsUtil.makeLegal(input, '/')).toEqual(expected);
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
      expect(FsUtil.makeLegal(input, '\\')).toEqual(expected);
    });
  });
});

describe('mkdir', () => {
  it('should create a directory', async () => {
    const tempDir = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'newdir'));
    try {
      await expect(FsUtil.exists(tempDir)).resolves.toEqual(false);
      await FsUtil.mkdir(tempDir);
      await expect(FsUtil.isDirectory(tempDir)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempDir, { force: true, recursive: true });
    }
  });

  it('should create nested directories with recursive option', async () => {
    const tempDir = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'parent'));
    const nestedDir = path.join(tempDir, 'child', 'grandchild');
    try {
      await FsUtil.mkdir(nestedDir, { recursive: true });
      await expect(FsUtil.isDirectory(nestedDir)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempDir, { force: true, recursive: true });
    }
  });
});

describe('mkdtemp', () => {
  it('should create a temp directory that exists', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      await expect(FsUtil.isDirectory(tempDir)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });

  it('should create unique temp directories', async () => {
    const tempDir1 = await FsUtil.mkdtemp(Temp.getTempDir());
    const tempDir2 = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      expect(tempDir1).not.toEqual(tempDir2);
    } finally {
      await FsUtil.rm(tempDir1, { recursive: true });
      await FsUtil.rm(tempDir2, { recursive: true });
    }
  });

  it('should create the root directory if it does not exist', async () => {
    const baseDir = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'parent'));
    try {
      await expect(FsUtil.exists(baseDir)).resolves.toEqual(false);
      const tempDir = await FsUtil.mkdtemp(baseDir);
      try {
        await expect(FsUtil.isDirectory(tempDir)).resolves.toEqual(true);
      } finally {
        await FsUtil.rm(tempDir, { recursive: true });
      }
    } finally {
      await FsUtil.rm(baseDir, { recursive: true, force: true });
    }
  });
});

describe('mktemp', () => {
  it('should return a path that does not exist', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));

    await expect(FsUtil.exists(tempFile)).resolves.toEqual(false);
  });

  it('should return unique paths each call', async () => {
    const tempFile1 = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    const tempFile2 = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));

    expect(tempFile1).not.toEqual(tempFile2);
  });
});

describe('mv', () => {
  it('should rename a file and return RENAMED', async () => {
    const tempSrc = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'src'));
    const tempDest = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'dest'));
    await FsUtil.touch(tempSrc);
    try {
      const result = await FsUtil.mv(tempSrc, tempDest);
      expect(result).toEqual(MoveResult.RENAMED);
      await expect(FsUtil.exists(tempSrc)).resolves.toEqual(false);
      await expect(FsUtil.exists(tempDest)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempSrc, { force: true });
      await FsUtil.rm(tempDest, { force: true });
    }
  });

  it('should move a file with content intact', async () => {
    const tempSrc = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'src'));
    const tempDest = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'dest'));
    await FsUtil.writeFile(tempSrc, 'hello world');
    try {
      await FsUtil.mv(tempSrc, tempDest);

      const contents = await FsUtil.readFile(tempDest);
      expect(contents.toString()).toEqual('hello world');
    } finally {
      await FsUtil.rm(tempSrc, { force: true });
      await FsUtil.rm(tempDest, { force: true });
    }
  });
});

describe('readFile', () => {
  it('should read file contents as a Buffer', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    await FsUtil.writeFile(tempFile, 'hello world');
    try {
      const contents = await FsUtil.readFile(tempFile);
      expect(contents).toBeInstanceOf(Buffer);
      expect(contents.toString()).toEqual('hello world');
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should read an empty file as an empty Buffer', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    try {
      const contents = await FsUtil.readFile(tempFile);

      expect(contents).toBeInstanceOf(Buffer);
      expect(contents.length).toEqual(0);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });
});

describe('readlink', () => {
  it('should throw on hard links', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsUtil.hardlink(tempFile, tempLink);

    await expect(FsUtil.readlink(tempLink)).rejects.toThrow(/non-symlink/);

    await FsUtil.rm(tempLink);
    await FsUtil.rm(tempFile);
  });

  it('should read absolute symlinks', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileAbsolute = path.resolve(tempFile);
    await FsUtil.symlink(tempFileAbsolute, tempLink);

    const readLink = await FsUtil.readlink(tempLink);
    expect(readLink).toEqual(tempFileAbsolute);
    expect(path.isAbsolute(readLink)).toEqual(true);

    await FsUtil.rm(tempLink);
    await FsUtil.rm(tempFile);
  });

  it('should read relative symlinks', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileRelative = await FsUtil.symlinkRelativePath(tempFile, tempLink);
    await FsUtil.symlink(tempFileRelative, tempLink);

    const readLink = await FsUtil.readlink(tempLink);
    expect(readLink).toEqual(tempFileRelative);
    expect(path.isAbsolute(readLink)).toEqual(false);

    await FsUtil.rm(tempLink);
    await FsUtil.rm(tempFile);
  });

  it('should throw on plain files', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);

    await expect(FsUtil.readlink(tempFile)).rejects.toThrow(/non-symlink/);

    await FsUtil.rm(tempFile);
  });

  it('should throw on directories', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());

    await expect(FsUtil.readlink(tempDir)).rejects.toThrow(/non-symlink/);

    await FsUtil.rm(tempDir);
  });
});

describe('readlinkSync', () => {
  it('should throw on hard links', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsUtil.hardlink(tempFile, tempLink);

    expect(() => FsUtil.readlinkSync(tempLink)).toThrow(/non-symlink/);

    await FsUtil.rm(tempLink);
    await FsUtil.rm(tempFile);
  });

  it('should read absolute symlinks', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileAbsolute = path.resolve(tempFile);
    await FsUtil.symlink(tempFileAbsolute, tempLink);

    const readLink = FsUtil.readlinkSync(tempLink);
    expect(readLink).toEqual(tempFileAbsolute);
    expect(path.isAbsolute(readLink)).toEqual(true);

    await FsUtil.rm(tempLink);
    await FsUtil.rm(tempFile);
  });

  it('should read relative symlinks', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileRelative = await FsUtil.symlinkRelativePath(tempFile, tempLink);
    await FsUtil.symlink(tempFileRelative, tempLink);

    const readLink = FsUtil.readlinkSync(tempLink);
    expect(readLink).toEqual(tempFileRelative);
    expect(path.isAbsolute(readLink)).toEqual(false);

    await FsUtil.rm(tempLink);
    await FsUtil.rm(tempFile);
  });

  it('should throw on plain files', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);

    expect(() => FsUtil.readlinkSync(tempFile)).toThrow(/non-symlink/);

    await FsUtil.rm(tempFile);
  });

  it('should throw on directories', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());

    expect(() => FsUtil.readlinkSync(tempDir)).toThrow(/non-symlink/);

    await FsUtil.rm(tempDir);
  });
});

describe('readlinkResolved', () => {
  it('should read absolute symlinks', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileAbsolute = path.resolve(tempFile);
    await FsUtil.symlink(tempFileAbsolute, tempLink);

    const readLinkResolved = await FsUtil.readlinkResolved(tempLink);
    expect(readLinkResolved).toEqual(tempFileAbsolute);
    expect(path.isAbsolute(readLinkResolved)).toEqual(true);

    await FsUtil.rm(tempLink);
    await FsUtil.rm(tempFile);
  });

  it('should read relative symlinks', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileRelative = await FsUtil.symlinkRelativePath(tempFile, tempLink);
    await FsUtil.symlink(tempFileRelative, tempLink);

    const readLinkResolved = await FsUtil.readlinkResolved(tempLink);
    expect(readLinkResolved).not.toEqual(tempFileRelative);
    expect(readLinkResolved).toEqual(path.resolve(tempFile));
    expect(path.isAbsolute(readLinkResolved)).toEqual(true);

    await FsUtil.rm(tempLink);
    await FsUtil.rm(tempFile);
  });
});

describe('readlinkResolvedSync', () => {
  it('should read absolute symlinks', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileAbsolute = path.resolve(tempFile);
    await FsUtil.symlink(tempFileAbsolute, tempLink);

    const readLinkResolved = FsUtil.readlinkResolvedSync(tempLink);
    expect(readLinkResolved).toEqual(tempFileAbsolute);
    expect(path.isAbsolute(readLinkResolved)).toEqual(true);

    await FsUtil.rm(tempLink);
    await FsUtil.rm(tempFile);
  });

  it('should read relative symlinks', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileRelative = await FsUtil.symlinkRelativePath(tempFile, tempLink);
    await FsUtil.symlink(tempFileRelative, tempLink);

    const readLinkResolved = FsUtil.readlinkResolvedSync(tempLink);
    expect(readLinkResolved).not.toEqual(tempFileRelative);
    expect(readLinkResolved).toEqual(path.resolve(tempFile));
    expect(path.isAbsolute(readLinkResolved)).toEqual(true);

    await FsUtil.rm(tempLink);
    await FsUtil.rm(tempFile);
  });
});

describe('realpath', () => {
  it('should throw on non-existent path', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsUtil.realpath(tempFile)).rejects.toThrow();
  });

  it('should resolve existing paths', async () => {
    await expect(FsUtil.realpath('.')).resolves.toEqual(process.cwd());
  });
});

describe('rm', () => {
  it('should throw on missing file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(false);
    await expect(FsUtil.rm(tempFile)).rejects.toThrow();
  });

  it('should not throw on forcing missing file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(false);
    await expect(FsUtil.rm(tempFile, { force: true })).resolves.toEqual(undefined);
  });

  it('should delete an existing file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(true);
    await FsUtil.rm(tempFile);
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(false);
  });

  it('should delete an existing directory', async () => {
    const tempDir = await FsUtil.mkdtemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsUtil.exists(tempDir)).resolves.toEqual(true);
    await FsUtil.rm(tempDir);
    await expect(FsUtil.exists(tempDir)).resolves.toEqual(false);
  });

  it("should not delete a symlink's target", async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsUtil.symlink(tempFile, tempLink);
    await expect(FsUtil.exists(tempLink)).resolves.toEqual(true);
    await FsUtil.rm(tempLink);
    await expect(FsUtil.exists(tempLink)).resolves.toEqual(false);
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(true);
    await FsUtil.rm(tempFile);
  });
});

describe('rmSync', () => {
  it('should throw on missing file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(false);
    expect(() => {
      FsUtil.rmSync(tempFile);
    }).toThrow();
  });

  it('should not throw on forcing missing file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(false);
    expect(() => {
      FsUtil.rmSync(tempFile, { force: true });
    }).not.toThrow();
  });

  it('should delete an existing file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(true);
    FsUtil.rmSync(tempFile);
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(false);
  });

  it('should delete an existing directory', async () => {
    const tempDir = await FsUtil.mkdtemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsUtil.exists(tempDir)).resolves.toEqual(true);
    FsUtil.rmSync(tempDir);
    await expect(FsUtil.exists(tempDir)).resolves.toEqual(false);
  });

  it("should not delete a symlink's target", async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    const tempLink = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsUtil.symlink(tempFile, tempLink);
    await expect(FsUtil.exists(tempLink)).resolves.toEqual(true);
    FsUtil.rmSync(tempLink);
    await expect(FsUtil.exists(tempLink)).resolves.toEqual(false);
    await expect(FsUtil.exists(tempFile)).resolves.toEqual(true);
    FsUtil.rmSync(tempFile);
  });
});

describe('size', () => {
  it('should return 0 for a non-existent file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsUtil.size(tempFile)).resolves.toEqual(0);
  });

  it('should return 0 for an empty file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    try {
      await expect(FsUtil.size(tempFile)).resolves.toEqual(0);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should return the correct size for a file with content', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.writeFile(tempFile, 'hello');
    try {
      await expect(FsUtil.size(tempFile)).resolves.toEqual(5);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });
});

describe('stat', () => {
  it('should return stats for a file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.writeFile(tempFile, 'hello');
    try {
      const stat = await FsUtil.stat(tempFile);
      expect(stat.isFile()).toEqual(true);
      expect(stat.size).toEqual(5);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should return stats for a directory', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      const stat = await FsUtil.stat(tempDir);
      expect(stat.isDirectory()).toEqual(true);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true });
    }
  });
});

describe('touch', () => {
  it('should mkdir and touch', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    await FsUtil.rm(tempDir, { recursive: true });
    const tempFile = await FsUtil.mktemp(path.join(tempDir, 'temp'));
    try {
      await FsUtil.touch(tempFile);
      await expect(FsUtil.exists(tempFile)).resolves.toEqual(true);
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('walk', () => {
  it('should return all files recursively with WalkMode.FILES', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      await FsUtil.touch(path.join(tempDir, 'file1.txt'));
      await FsUtil.mkdir(path.join(tempDir, 'sub'), { recursive: true });
      await FsUtil.touch(path.join(tempDir, 'sub', 'file2.txt'));

      const files = await FsUtil.walk(tempDir, WalkMode.FILES);

      // Only files are returned, not directories
      expect(files).toHaveLength(2);
      expect(files).toContain(path.join(tempDir, 'file1.txt'));
      expect(files).toContain(path.join(tempDir, 'sub', 'file2.txt'));
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should return all directories recursively with WalkMode.DIRECTORIES', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      await FsUtil.touch(path.join(tempDir, 'file1.txt'));
      await FsUtil.mkdir(path.join(tempDir, 'sub'), { recursive: true });
      await FsUtil.touch(path.join(tempDir, 'sub', 'file2.txt'));
      await FsUtil.mkdir(path.join(tempDir, 'sub', 'deeper'), { recursive: true });

      const dirs = await FsUtil.walk(tempDir, WalkMode.DIRECTORIES);

      // Only directories are returned, not files
      expect(dirs).toContain(path.join(tempDir, 'sub'));
      expect(dirs).toContain(path.join(tempDir, 'sub', 'deeper'));
      expect(dirs).not.toContain(path.join(tempDir, 'file1.txt'));
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should return empty array for a non-existent directory', async () => {
    const tempDir = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'nonexistent'));
    const files = await FsUtil.walk(tempDir, WalkMode.FILES);
    expect(files).toHaveLength(0);
  });
});

describe('writeFile', () => {
  it('should write string data to a file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    try {
      await FsUtil.writeFile(tempFile, 'hello world');

      const contents = await FsUtil.readFile(tempFile);
      expect(contents.toString()).toEqual('hello world');
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should write binary data to a file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.touch(tempFile);
    try {
      const data = Buffer.from([0x00, 0x01, 0x02, 0xff]);
      await FsUtil.writeFile(tempFile, data);

      const contents = await FsUtil.readFile(tempFile);
      expect(contents).toEqual(data);
    } finally {
      await FsUtil.rm(tempFile);
    }
  });

  it('should overwrite existing file content', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsUtil.writeFile(tempFile, 'original');
    try {
      await FsUtil.writeFile(tempFile, 'updated');

      const contents = await FsUtil.readFile(tempFile);
      expect(contents.toString()).toEqual('updated');
    } finally {
      await FsUtil.rm(tempFile);
    }
  });
});
