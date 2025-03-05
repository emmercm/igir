import os from 'node:os';
import path from 'node:path';

import Temp from '../../src/globals/temp.js';
import fsPoly from '../../src/polyfill/fsPoly.js';

describe('canSymlink', () => {
  it('should not throw', async () => {
    await expect(fsPoly.canSymlink(Temp.getTempDir())).resolves.not.toThrow();
  });
});

describe('exists', () => {
  it('should return false for a non-existent file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);
  });

  it('should return true for a directory', async () => {
    const tempDir = await fsPoly.mkdtemp(Temp.getTempDir());
    try {
      await expect(fsPoly.exists(tempDir)).resolves.toEqual(true);
    } finally {
      await fsPoly.rm(tempDir, { recursive: true });
    }
  });

  it('should return true for a plain file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    try {
      await expect(fsPoly.isDirectory(tempFile)).resolves.toEqual(false);
    } finally {
      await fsPoly.rm(tempFile);
    }
  });

  it('should return true for a symlink', async () => {
    const tempFileTarget = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await fsPoly.touch(tempFileTarget);
      await fsPoly.symlink(tempFileTarget, tempFileLink);
      await expect(fsPoly.exists(tempFileLink)).resolves.toEqual(true);
      await expect(fsPoly.exists(tempFileTarget)).resolves.toEqual(true);
    } finally {
      await fsPoly.rm(tempFileTarget, { force: true });
      await fsPoly.rm(tempFileLink, { force: true });
    }
  });

  it('should return true for a broken symlink', async () => {
    const tempFileTarget = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await fsPoly.touch(tempFileTarget);
      await fsPoly.symlink(tempFileTarget, tempFileLink);
      await fsPoly.rm(tempFileTarget);
      await expect(fsPoly.exists(tempFileLink)).resolves.toEqual(true);
      await expect(fsPoly.exists(tempFileTarget)).resolves.toEqual(false);
    } finally {
      await fsPoly.rm(tempFileTarget, { force: true });
      await fsPoly.rm(tempFileLink, { force: true });
    }
  });

  it('should return true for a hardlink', async () => {
    const tempFileTarget = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await fsPoly.touch(tempFileTarget);
      await fsPoly.hardlink(tempFileTarget, tempFileLink);
      await expect(fsPoly.exists(tempFileLink)).resolves.toEqual(true);
      await expect(fsPoly.exists(tempFileTarget)).resolves.toEqual(true);
    } finally {
      await fsPoly.rm(tempFileTarget, { force: true });
      await fsPoly.rm(tempFileLink, { force: true });
    }
  });
});

describe('isDirectory', () => {
  it('should return true for a directory', async () => {
    const tempDir = await fsPoly.mkdtemp(Temp.getTempDir());
    try {
      await expect(fsPoly.isDirectory(tempDir)).resolves.toEqual(true);
    } finally {
      await fsPoly.rm(tempDir, { recursive: true });
    }
  });

  it('should return false for a file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    await expect(fsPoly.isDirectory(tempFile)).resolves.toEqual(false);
    await fsPoly.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(fsPoly.isDirectory(tempFile)).resolves.toEqual(false);
  });
});

describe('isDirectorySync', () => {
  it('should return true for a directory', async () => {
    const tempDir = await fsPoly.mkdtemp(Temp.getTempDir());
    expect(fsPoly.isDirectorySync(tempDir)).toEqual(true);
  });

  it('should return false for a file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    expect(fsPoly.isDirectorySync(tempFile)).toEqual(false);
    fsPoly.rmSync(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    expect(fsPoly.isDirectorySync(tempFile)).toEqual(false);
  });
});

describe('isHardlink', () => {
  it('should return true for a hardlink', async () => {
    const tempFileTarget = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await fsPoly.touch(tempFileTarget);

      await fsPoly.hardlink(tempFileTarget, tempFileLink);
      await expect(fsPoly.isHardlink(tempFileLink)).resolves.toEqual(true);
      await expect(fsPoly.isHardlink(tempFileTarget)).resolves.toEqual(true);
    } finally {
      await fsPoly.rm(tempFileTarget, { force: true });
      await fsPoly.rm(tempFileLink, { force: true });
    }
  });

  it('should return false for a symlink', async () => {
    const tempFileTarget = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await fsPoly.touch(tempFileTarget);

      await fsPoly.symlink(tempFileTarget, tempFileLink);
      await expect(fsPoly.isHardlink(tempFileLink)).resolves.toEqual(false);
      await expect(fsPoly.isHardlink(tempFileTarget)).resolves.toEqual(false);
    } finally {
      await fsPoly.rm(tempFileTarget, { force: true });
      await fsPoly.rm(tempFileLink, { force: true });
    }
  });

  it('should return false for a file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    await expect(fsPoly.isHardlink(tempFile)).resolves.toEqual(false);
    await fsPoly.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(fsPoly.isHardlink(tempFile)).resolves.toEqual(false);
  });
});

describe('hardlink', () => {
  it('should create a hard link', async () => {
    const tempFileTarget = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await fsPoly.touch(tempFileTarget);

      await fsPoly.hardlink(tempFileTarget, tempFileLink);
      await expect(fsPoly.isHardlink(tempFileLink)).resolves.toEqual(true);
      await expect(fsPoly.isHardlink(tempFileTarget)).resolves.toEqual(true);
    } finally {
      await fsPoly.rm(tempFileTarget, { force: true });
      await fsPoly.rm(tempFileLink, { force: true });
    }
  });

  it('should not overwrite an existing file', async () => {
    const tempFileTarget = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'target'));
    const tempFileLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));

    try {
      await fsPoly.touch(tempFileTarget);
      await fsPoly.touch(tempFileLink);

      await expect(fsPoly.hardlink(tempFileTarget, tempFileLink)).rejects.toThrow();
    } finally {
      await fsPoly.rm(tempFileTarget, { force: true });
      await fsPoly.rm(tempFileLink, { force: true });
    }
  });
});

describe('isSamba', () => {
  test.each(['.', os.devNull, 'test', path.resolve('test')])(
    'should return false: %s',
    (filePath) => {
      expect(fsPoly.isSamba(filePath)).toEqual(false);
    },
  );

  test.each(['//foo/bar', '\\\\foo\\bar'])('should return true: %s', (filePath) => {
    expect(fsPoly.isSamba(filePath)).toEqual(true);
  });
});

describe('isSymlink', () => {
  it('should return false for a hard link', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await fsPoly.hardlink(tempFile, tempLink);
    await expect(fsPoly.isSymlink(tempLink)).resolves.toEqual(false);
    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });

  it('should return true for a symlink', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await fsPoly.symlink(tempFile, tempLink);
    await expect(fsPoly.isSymlink(tempLink)).resolves.toEqual(true);
    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });

  it('should return false for a plain directory', async () => {
    const tempDir = await fsPoly.mkdtemp(Temp.getTempDir());
    await expect(fsPoly.isSymlink(tempDir)).resolves.toEqual(false);
  });

  it('should return false for a plain file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    await expect(fsPoly.isSymlink(tempFile)).resolves.toEqual(false);
    await fsPoly.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(fsPoly.isSymlink(tempFile)).resolves.toEqual(false);
  });
});

describe('isSymlinkSync', () => {
  it('should return false for a hard link', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await fsPoly.hardlink(tempFile, tempLink);
    expect(fsPoly.isSymlinkSync(tempLink)).toEqual(false);
    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });

  it('should return true for a symlink', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await fsPoly.symlink(tempFile, tempLink);
    expect(fsPoly.isSymlinkSync(tempLink)).toEqual(true);
    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });

  it('should return false for a plain directory', async () => {
    const tempDir = await fsPoly.mkdtemp(Temp.getTempDir());
    expect(fsPoly.isSymlinkSync(tempDir)).toEqual(false);
  });

  it('should return false for a plain file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    expect(fsPoly.isSymlinkSync(tempFile)).toEqual(false);
    await fsPoly.rm(tempFile);
  });

  it('should return false for non-existent file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    expect(fsPoly.isSymlinkSync(tempFile)).toEqual(false);
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
      expect(fsPoly.makeLegal(input, '/')).toEqual(expected);
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
      expect(fsPoly.makeLegal(input, '\\')).toEqual(expected);
    });
  });
});

describe('readlink', () => {
  it('should throw on hard links', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await fsPoly.hardlink(tempFile, tempLink);

    await expect(fsPoly.readlink(tempLink)).rejects.toThrow(/non-symlink/);

    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });

  it('should read absolute symlinks', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileAbsolute = path.resolve(tempFile);
    await fsPoly.symlink(tempFileAbsolute, tempLink);

    const readLink = await fsPoly.readlink(tempLink);
    expect(readLink).toEqual(tempFileAbsolute);
    expect(path.isAbsolute(readLink)).toEqual(true);

    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });

  it('should read relative symlinks', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileRelative = await fsPoly.symlinkRelativePath(tempFile, tempLink);
    await fsPoly.symlink(tempFileRelative, tempLink);

    const readLink = await fsPoly.readlink(tempLink);
    expect(readLink).toEqual(tempFileRelative);
    expect(path.isAbsolute(readLink)).toEqual(false);

    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });

  it('should throw on plain files', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);

    await expect(fsPoly.readlink(tempFile)).rejects.toThrow(/non-symlink/);

    await fsPoly.rm(tempFile);
  });

  it('should throw on directories', async () => {
    const tempDir = await fsPoly.mkdtemp(Temp.getTempDir());

    await expect(fsPoly.readlink(tempDir)).rejects.toThrow(/non-symlink/);

    await fsPoly.rm(tempDir);
  });
});

describe('readlinkSync', () => {
  it('should throw on hard links', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await fsPoly.hardlink(tempFile, tempLink);

    expect(() => fsPoly.readlinkSync(tempLink)).toThrow(/non-symlink/);

    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });

  it('should read absolute symlinks', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileAbsolute = path.resolve(tempFile);
    await fsPoly.symlink(tempFileAbsolute, tempLink);

    const readLink = fsPoly.readlinkSync(tempLink);
    expect(readLink).toEqual(tempFileAbsolute);
    expect(path.isAbsolute(readLink)).toEqual(true);

    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });

  it('should read relative symlinks', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileRelative = await fsPoly.symlinkRelativePath(tempFile, tempLink);
    await fsPoly.symlink(tempFileRelative, tempLink);

    const readLink = fsPoly.readlinkSync(tempLink);
    expect(readLink).toEqual(tempFileRelative);
    expect(path.isAbsolute(readLink)).toEqual(false);

    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });

  it('should throw on plain files', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);

    expect(() => fsPoly.readlinkSync(tempFile)).toThrow(/non-symlink/);

    await fsPoly.rm(tempFile);
  });

  it('should throw on directories', async () => {
    const tempDir = await fsPoly.mkdtemp(Temp.getTempDir());

    expect(() => fsPoly.readlinkSync(tempDir)).toThrow(/non-symlink/);

    await fsPoly.rm(tempDir);
  });
});

describe('readlinkResolved', () => {
  it('should read absolute symlinks', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileAbsolute = path.resolve(tempFile);
    await fsPoly.symlink(tempFileAbsolute, tempLink);

    const readLinkResolved = await fsPoly.readlinkResolved(tempLink);
    expect(readLinkResolved).toEqual(tempFileAbsolute);
    expect(path.isAbsolute(readLinkResolved)).toEqual(true);

    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });

  it('should read relative symlinks', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileRelative = await fsPoly.symlinkRelativePath(tempFile, tempLink);
    await fsPoly.symlink(tempFileRelative, tempLink);

    const readLinkResolved = await fsPoly.readlinkResolved(tempLink);
    expect(readLinkResolved).not.toEqual(tempFileRelative);
    expect(readLinkResolved).toEqual(path.resolve(tempFile));
    expect(path.isAbsolute(readLinkResolved)).toEqual(true);

    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });
});

describe('readlinkResolvedSync', () => {
  it('should read absolute symlinks', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileAbsolute = path.resolve(tempFile);
    await fsPoly.symlink(tempFileAbsolute, tempLink);

    const readLinkResolved = fsPoly.readlinkResolvedSync(tempLink);
    expect(readLinkResolved).toEqual(tempFileAbsolute);
    expect(path.isAbsolute(readLinkResolved)).toEqual(true);

    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });

  it('should read relative symlinks', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    const tempFileRelative = await fsPoly.symlinkRelativePath(tempFile, tempLink);
    await fsPoly.symlink(tempFileRelative, tempLink);

    const readLinkResolved = fsPoly.readlinkResolvedSync(tempLink);
    expect(readLinkResolved).not.toEqual(tempFileRelative);
    expect(readLinkResolved).toEqual(path.resolve(tempFile));
    expect(path.isAbsolute(readLinkResolved)).toEqual(true);

    await fsPoly.rm(tempLink);
    await fsPoly.rm(tempFile);
  });
});

describe('rm', () => {
  it('should throw on missing file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);
    await expect(fsPoly.rm(tempFile)).rejects.toThrow();
  });

  it('should not throw on forcing missing file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);
    await expect(fsPoly.rm(tempFile, { force: true })).resolves.not.toThrow();
  });

  it('should delete an existing file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(true);
    await fsPoly.rm(tempFile);
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);
  });

  it('should delete an existing directory', async () => {
    const tempDir = await fsPoly.mkdtemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(fsPoly.exists(tempDir)).resolves.toEqual(true);
    await fsPoly.rm(tempDir);
    await expect(fsPoly.exists(tempDir)).resolves.toEqual(false);
  });

  it("should not delete a symlink's target", async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await fsPoly.symlink(tempFile, tempLink);
    await expect(fsPoly.exists(tempLink)).resolves.toEqual(true);
    await fsPoly.rm(tempLink);
    await expect(fsPoly.exists(tempLink)).resolves.toEqual(false);
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(true);
    await fsPoly.rm(tempFile);
  });
});

describe('rmSync', () => {
  it('should throw on missing file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);
    expect(() => fsPoly.rmSync(tempFile)).toThrow();
  });

  it('should not throw on forcing missing file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);
    expect(() => fsPoly.rmSync(tempFile, { force: true })).not.toThrow();
  });

  it('should delete an existing file', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(true);
    fsPoly.rmSync(tempFile);
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(false);
  });

  it('should delete an existing directory', async () => {
    const tempDir = await fsPoly.mkdtemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(fsPoly.exists(tempDir)).resolves.toEqual(true);
    fsPoly.rmSync(tempDir);
    await expect(fsPoly.exists(tempDir)).resolves.toEqual(false);
  });

  it("should not delete a symlink's target", async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await fsPoly.touch(tempFile);
    const tempLink = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'link'));
    await fsPoly.symlink(tempFile, tempLink);
    await expect(fsPoly.exists(tempLink)).resolves.toEqual(true);
    fsPoly.rmSync(tempLink);
    await expect(fsPoly.exists(tempLink)).resolves.toEqual(false);
    await expect(fsPoly.exists(tempFile)).resolves.toEqual(true);
    fsPoly.rmSync(tempFile);
  });
});

describe('realpath', () => {
  it('should throw on non-existent path', async () => {
    const tempFile = await fsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await expect(fsPoly.realpath(tempFile)).rejects.toThrow();
  });

  it('should resolve existing paths', async () => {
    await expect(fsPoly.realpath('.')).resolves.toEqual(process.cwd());
  });
});

describe('touch', () => {
  it('should mkdir and touch', async () => {
    const tempDir = await fsPoly.mkdtemp(Temp.getTempDir());
    await fsPoly.rm(tempDir, { recursive: true });
    const tempFile = await fsPoly.mktemp(path.join(tempDir, 'temp'));
    try {
      await fsPoly.touch(tempFile);
      await expect(fsPoly.exists(tempFile)).resolves.toEqual(true);
    } finally {
      await fsPoly.rm(tempDir, { recursive: true, force: true });
    }
  });
});
