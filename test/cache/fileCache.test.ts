import path from 'node:path';

import FileCache from '../../src/cache/fileCache.js';
import Temp from '../../src/globals/temp.js';
import Zip from '../../src/models/files/archives/zip.js';
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

describe('getOrComputeArchiveChecksums', () => {
  it('should look up an archive once, not once per entry, on a cache hit', async () => {
    const fileCache = new FileCache();
    const zip = new Zip(path.join('test', 'fixtures', 'roms', 'zip', 'onetwothree.zip'));
    const computed = await fileCache.getOrComputeArchiveChecksums(zip, ChecksumBitmask.CRC32);
    expect(computed.length).toBeGreaterThan(1);

    const symlinkSpy = vi.spyOn(FsUtil, 'isSymlink');
    try {
      const cached = await fileCache.getOrComputeArchiveChecksums(zip, ChecksumBitmask.CRC32);

      expect(cached.map((entry) => entry.getCrc32())).toEqual(
        computed.map((entry) => entry.getCrc32()),
      );
      expect(symlinkSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
