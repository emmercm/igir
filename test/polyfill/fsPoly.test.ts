import os from 'node:os';
import path from 'node:path';

import Temp from '../../src/globals/temp.js';
import FsPoly, { MoveResult, WalkMode } from '../../src/polyfill/fsPoly.js';
import IOFile from '../../src/polyfill/ioFile.js';
import IgirException from '../../src/types/exceptions/igirException.js';

if (!(await FsPoly.exists(Temp.getTempDir()))) {
  await FsPoly.mkdir(Temp.getTempDir(), { recursive: true });
}

describe('canSymlink', () => {
  it('should not throw', async () => {
    await expect(FsPoly.canSymlink(Temp.getTempDir())).resolves.toBeDefined();
  });
});

describe('copyDir', () => {
  it('should copy a directory recursively', async () => {
    const srcDir = await FsPoly.mkdtemp(Temp.getTempDir());
    const destDir = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'dest'));
    try {
      // Given a source directory with files and a subdirectory
      await FsPoly.writeFile(path.join(srcDir, 'file1.txt'), 'hello');
      await FsPoly.mkdir(path.join(srcDir, 'sub'), { recursive: true });
      await FsPoly.writeFile(path.join(srcDir, 'sub', 'file2.txt'), 'world');

      await FsPoly.copyDir(srcDir, destDir);

      await expect(FsPoly.isFile(path.join(destDir, 'file1.txt'))).resolves.toEqual(true);
      await expect(FsPoly.isFile(path.join(destDir, 'sub', 'file2.txt'))).resolves.toEqual(true);
      const file1Contents = await FsPoly.readFile(path.join(destDir, 'file1.txt'));
      expect(file1Contents.toString()).toEqual('hello');
      const file2Contents = await FsPoly.readFile(path.join(destDir, 'sub', 'file2.txt'));
      expect(file2Contents.toString()).toEqual('world');
    } finally {
      await FsPoly.rm(srcDir, { recursive: true, force: true });
      await FsPoly.rm(destDir, { recursive: true, force: true });
    }
  });

  it('should copy an empty directory', async () => {
    const srcDir = await FsPoly.mkdtemp(Temp.getTempDir());
    const destDir = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'dest'));
    try {
      await FsPoly.copyDir(srcDir, destDir);

      await expect(FsPoly.isDirectory(destDir)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(srcDir, { recursive: true, force: true });
      await FsPoly.rm(destDir, { recursive: true, force: true });
    }
  });
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

  it.skipIf(process.versions.bun)('should handle a lot of concurrency', async () => {
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

describe('dirs', () => {
  it('should return only directories', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      // Given a dir with both files and subdirs
      await FsPoly.mkdir(path.join(tempDir, 'subdir1'), { recursive: true });
      await FsPoly.mkdir(path.join(tempDir, 'subdir2'), { recursive: true });
      await FsPoly.touch(path.join(tempDir, 'file.txt'));

      const dirs = await FsPoly.dirs(tempDir);

      // Then only directories are returned
      expect(dirs).toHaveLength(2);
      expect(dirs).toContain(path.join(tempDir, 'subdir1'));
      expect(dirs).toContain(path.join(tempDir, 'subdir2'));
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should return empty array for directory with only files', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      await FsPoly.touch(path.join(tempDir, 'file.txt'));

      const dirs = await FsPoly.dirs(tempDir);

      expect(dirs).toHaveLength(0);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('diskResolved', () => {
  it('should return a string or undefined for the current directory', () => {
    const result = FsPoly.diskResolved('.');
    // Then it either returns a non-empty mount point string or undefined (on systems without disk info)
    expect(result === undefined || result.length > 0).toEqual(true);
  });

  it('should return consistent results for the same path', () => {
    const filePath = path.resolve('.');
    expect(FsPoly.diskResolved(filePath)).toEqual(FsPoly.diskResolved(filePath));
  });
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
  it('should return an inode number for a file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    try {
      const inode = await FsPoly.inode(tempFile);
      expect(typeof inode).toEqual('number');
      expect(inode).toBeGreaterThan(0);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should return the same inode for a hardlink', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    try {
      await FsPoly.hardlink(tempFile, tempLink);

      const inodeFile = await FsPoly.inode(tempFile);
      const inodeLink = await FsPoly.inode(tempLink);
      expect(inodeFile).toEqual(inodeLink);
    } finally {
      await FsPoly.rm(tempFile, { force: true });
      await FsPoly.rm(tempLink, { force: true });
    }
  });

  it('should return different inodes for different files', async () => {
    const tempFile1 = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp1'));
    const tempFile2 = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp2'));
    await FsPoly.touch(tempFile1);
    await FsPoly.touch(tempFile2);
    try {
      const inode1 = await FsPoly.inode(tempFile1);
      const inode2 = await FsPoly.inode(tempFile2);
      expect(inode1).not.toEqual(inode2);
    } finally {
      await FsPoly.rm(tempFile1, { force: true });
      await FsPoly.rm(tempFile2, { force: true });
    }
  });
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

describe.skipIf(process.platform === 'win32')('isExecutable', () => {
  it('should return false for a non-executable file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    try {
      // Remove the executable bit
      await import('node:fs').then(async (fs) => {
        await fs.promises.chmod(tempFile, 0o644);
      });
      await expect(FsPoly.isExecutable(tempFile)).resolves.toEqual(false);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should return true for an executable file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    try {
      // Set the executable bit
      await import('node:fs').then(async (fs) => {
        await fs.promises.chmod(tempFile, 0o755);
      });
      await expect(FsPoly.isExecutable(tempFile)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should return false for a non-existent file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsPoly.isExecutable(tempFile)).resolves.toEqual(false);
  });
});

describe('isFile', () => {
  it('should return true for a plain file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    try {
      await expect(FsPoly.isFile(tempFile)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should return false for a directory', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      await expect(FsPoly.isFile(tempDir)).resolves.toEqual(false);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true });
    }
  });

  it('should return false for a non-existent path', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsPoly.isFile(tempFile)).resolves.toEqual(false);
  });

  it('should follow symlinks and return true for a symlink to a file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    const tempLink = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await FsPoly.touch(tempFile);
    try {
      await FsPoly.symlink(tempFile, tempLink);
      await expect(FsPoly.isFile(tempLink)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempFile, { force: true });
      await FsPoly.rm(tempLink, { force: true });
    }
  });
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

  test.each(['\\\\foo\\bar', 'smb://foo/bar', '/mnt/smb/foo/bar'])(
    'should return true: %s',
    (filePath) => {
      expect(FsPoly.isSamba(filePath)).toEqual(true);
    },
  );
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
  it('should return true for a writable existing file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    try {
      await expect(FsPoly.isWritable(tempFile)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should return true for a non-existent path in a writable dir', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    // File does not exist yet
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);

    const writable = await FsPoly.isWritable(tempFile);

    // File should not have been left behind
    expect(writable).toEqual(true);
    await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);
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
  it('should create a directory', async () => {
    const tempDir = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'newdir'));
    try {
      await expect(FsPoly.exists(tempDir)).resolves.toEqual(false);
      await FsPoly.mkdir(tempDir);
      await expect(FsPoly.isDirectory(tempDir)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempDir, { force: true, recursive: true });
    }
  });

  it('should create nested directories with recursive option', async () => {
    const tempDir = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'parent'));
    const nestedDir = path.join(tempDir, 'child', 'grandchild');
    try {
      await FsPoly.mkdir(nestedDir, { recursive: true });
      await expect(FsPoly.isDirectory(nestedDir)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempDir, { force: true, recursive: true });
    }
  });
});

describe('mkdtemp', () => {
  it('should create a temp directory that exists', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      await expect(FsPoly.isDirectory(tempDir)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true });
    }
  });

  it('should create unique temp directories', async () => {
    const tempDir1 = await FsPoly.mkdtemp(Temp.getTempDir());
    const tempDir2 = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      expect(tempDir1).not.toEqual(tempDir2);
    } finally {
      await FsPoly.rm(tempDir1, { recursive: true });
      await FsPoly.rm(tempDir2, { recursive: true });
    }
  });

  it('should create the root directory if it does not exist', async () => {
    const baseDir = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'parent'));
    try {
      await expect(FsPoly.exists(baseDir)).resolves.toEqual(false);
      const tempDir = await FsPoly.mkdtemp(baseDir);
      try {
        await expect(FsPoly.isDirectory(tempDir)).resolves.toEqual(true);
      } finally {
        await FsPoly.rm(tempDir, { recursive: true });
      }
    } finally {
      await FsPoly.rm(baseDir, { recursive: true, force: true });
    }
  });
});

describe('mktemp', () => {
  it('should return a path that does not exist', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));

    await expect(FsPoly.exists(tempFile)).resolves.toEqual(false);
  });

  it('should return unique paths each call', async () => {
    const tempFile1 = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    const tempFile2 = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));

    expect(tempFile1).not.toEqual(tempFile2);
  });
});

describe('mv', () => {
  it('should rename a file and return RENAMED', async () => {
    const tempSrc = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'src'));
    const tempDest = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'dest'));
    await FsPoly.touch(tempSrc);
    try {
      const result = await FsPoly.mv(tempSrc, tempDest);
      expect(result).toEqual(MoveResult.RENAMED);
      await expect(FsPoly.exists(tempSrc)).resolves.toEqual(false);
      await expect(FsPoly.exists(tempDest)).resolves.toEqual(true);
    } finally {
      await FsPoly.rm(tempSrc, { force: true });
      await FsPoly.rm(tempDest, { force: true });
    }
  });

  it('should move a file with content intact', async () => {
    const tempSrc = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'src'));
    const tempDest = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'dest'));
    await FsPoly.writeFile(tempSrc, 'hello world');
    try {
      await FsPoly.mv(tempSrc, tempDest);

      const contents = await FsPoly.readFile(tempDest);
      expect(contents.toString()).toEqual('hello world');
    } finally {
      await FsPoly.rm(tempSrc, { force: true });
      await FsPoly.rm(tempDest, { force: true });
    }
  });
});

describe('readFile', () => {
  it('should read file contents as a Buffer', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    await FsPoly.writeFile(tempFile, 'hello world');
    try {
      const contents = await FsPoly.readFile(tempFile);
      expect(contents).toBeInstanceOf(Buffer);
      expect(contents.toString()).toEqual('hello world');
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should read an empty file as an empty Buffer', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    try {
      const contents = await FsPoly.readFile(tempFile);

      expect(contents).toBeInstanceOf(Buffer);
      expect(contents.length).toEqual(0);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });
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
  it('should return 0 for a non-existent file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(FsPoly.size(tempFile)).resolves.toEqual(0);
  });

  it('should return 0 for an empty file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    try {
      await expect(FsPoly.size(tempFile)).resolves.toEqual(0);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should return the correct size for a file with content', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.writeFile(tempFile, 'hello');
    try {
      await expect(FsPoly.size(tempFile)).resolves.toEqual(5);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });
});

describe('stat', () => {
  it('should return stats for a file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.writeFile(tempFile, 'hello');
    try {
      const stat = await FsPoly.stat(tempFile);
      expect(stat.isFile()).toEqual(true);
      expect(stat.size).toEqual(5);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should return stats for a directory', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      const stat = await FsPoly.stat(tempDir);
      expect(stat.isDirectory()).toEqual(true);
    } finally {
      await FsPoly.rm(tempDir, { recursive: true });
    }
  });
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
  it('should return all files recursively with WalkMode.FILES', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      await FsPoly.touch(path.join(tempDir, 'file1.txt'));
      await FsPoly.mkdir(path.join(tempDir, 'sub'), { recursive: true });
      await FsPoly.touch(path.join(tempDir, 'sub', 'file2.txt'));

      const files = await FsPoly.walk(tempDir, WalkMode.FILES);

      // Only files are returned, not directories
      expect(files).toHaveLength(2);
      expect(files).toContain(path.join(tempDir, 'file1.txt'));
      expect(files).toContain(path.join(tempDir, 'sub', 'file2.txt'));
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should return all directories recursively with WalkMode.DIRECTORIES', async () => {
    const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
    try {
      await FsPoly.touch(path.join(tempDir, 'file1.txt'));
      await FsPoly.mkdir(path.join(tempDir, 'sub'), { recursive: true });
      await FsPoly.touch(path.join(tempDir, 'sub', 'file2.txt'));
      await FsPoly.mkdir(path.join(tempDir, 'sub', 'deeper'), { recursive: true });

      const dirs = await FsPoly.walk(tempDir, WalkMode.DIRECTORIES);

      // Only directories are returned, not files
      expect(dirs).toContain(path.join(tempDir, 'sub'));
      expect(dirs).toContain(path.join(tempDir, 'sub', 'deeper'));
      expect(dirs).not.toContain(path.join(tempDir, 'file1.txt'));
    } finally {
      await FsPoly.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should return empty array for a non-existent directory', async () => {
    const tempDir = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'nonexistent'));
    const files = await FsPoly.walk(tempDir, WalkMode.FILES);
    expect(files).toHaveLength(0);
  });
});

describe('writeFile', () => {
  it('should write string data to a file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    try {
      await FsPoly.writeFile(tempFile, 'hello world');

      const contents = await FsPoly.readFile(tempFile);
      expect(contents.toString()).toEqual('hello world');
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should write binary data to a file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.touch(tempFile);
    try {
      const data = Buffer.from([0x00, 0x01, 0x02, 0xff]);
      await FsPoly.writeFile(tempFile, data);

      const contents = await FsPoly.readFile(tempFile);
      expect(contents).toEqual(data);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should overwrite existing file content', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.writeFile(tempFile, 'original');
    try {
      await FsPoly.writeFile(tempFile, 'updated');

      const contents = await FsPoly.readFile(tempFile);
      expect(contents.toString()).toEqual('updated');
    } finally {
      await FsPoly.rm(tempFile);
    }
  });
});
