import path from 'node:path';

import FileCache from '../../src/cache/fileCache.js';
import Temp from '../../src/globals/temp.js';
import Zip from '../../src/models/files/archives/zip.js';
import FileChecksums from '../../src/models/files/fileChecksums.js';
import { ChecksumBitmask } from '../../src/models/files/fileChecksums.js';
import FsUtil from '../../src/utils/fsUtil.js';

describe('loadFile', () => {
  it('should load after saving', async () => {
    const tempCache = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'cache'));
    const fileCache = new FileCache();
    await fileCache.loadFile(tempCache);

    // Compute some values
    await fileCache.getOrComputeFileChecksums(
      path.join('test', 'fixtures', 'roms', 'raw', 'fizzbuzz.nes'),
      ChecksumBitmask.CRC32,
    );
    await fileCache.getOrComputeArchiveChecksums(
      new Zip(path.join('test', 'fixtures', 'roms', 'zip', 'foobar.zip')),
      ChecksumBitmask.CRC32,
    );

    await fileCache.save();
    await fileCache.loadFile(tempCache);
  });
});

describe('getOrComputeFileSignature', () => {
  // Tested by candidateExtensionCorrector.test.ts, romTrimProcessor.test.ts
});

describe('getOrComputeFileHeader', () => {
  // Tested by romHeaderProcessor.test.ts
});

describe('getOrComputeFilePaddings', () => {
  // Tested by romTrimProcessor.test.ts
});

describe('computeAndSetFileChecksums', () => {
  it("should cache a renamed file's checksums at its new path", async () => {
    await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
    const oldPath = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'old'));
    const newPath = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'new'));
    await FsUtil.copyFile(path.join('test', 'fixtures', 'roms', 'raw', 'fizzbuzz.nes'), oldPath);
    try {
      const fileCache = new FileCache();
      const before = await fileCache.getOrComputeFileChecksums(oldPath, ChecksumBitmask.CRC32);
      await FsUtil.mv(oldPath, newPath);
      await fileCache.computeAndSetFileChecksums(before.withFilePath(newPath));

      const hashSpy = vi.spyOn(FileChecksums, 'hashFile');
      const after = await fileCache.getOrComputeFileChecksums(newPath, ChecksumBitmask.CRC32);

      expect(hashSpy).not.toHaveBeenCalled();
      expect(after.getCrc32()).toEqual(before.getCrc32());
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(oldPath, { force: true });
      await FsUtil.rm(newPath, { force: true });
    }
  });
});

describe('computeAndSetArchiveChecksums', () => {
  it("should cache a renamed archive's entries at its new path", async () => {
    await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
    const oldPath = `${await FsUtil.mktemp(path.join(Temp.getTempDir(), 'old'))}.zip`;
    const newPath = `${await FsUtil.mktemp(path.join(Temp.getTempDir(), 'new'))}.zip`;
    await FsUtil.copyFile(path.join('test', 'fixtures', 'roms', 'zip', 'foobar.zip'), oldPath);
    try {
      const fileCache = new FileCache();
      const before = await fileCache.getOrComputeArchiveChecksums(
        new Zip(oldPath),
        ChecksumBitmask.CRC32,
      );
      await FsUtil.mv(oldPath, newPath);
      await fileCache.computeAndSetArchiveChecksums(new Zip(newPath), before);

      const newZip = new Zip(newPath);
      const entriesSpy = vi.spyOn(newZip, 'getArchiveEntries');
      const after = await fileCache.getOrComputeArchiveChecksums(newZip, ChecksumBitmask.CRC32);

      expect(entriesSpy).not.toHaveBeenCalled();
      expect(after.map((entry) => entry.getCrc32())).toEqual(
        before.map((entry) => entry.getCrc32()),
      );
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(oldPath, { force: true });
      await FsUtil.rm(newPath, { force: true });
    }
  });
});
