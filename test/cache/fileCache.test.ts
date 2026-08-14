import path from 'node:path';

import FileCache from '../../src/cache/fileCache.js';
import Temp from '../../src/globals/temp.js';
import ArchiveEntry from '../../src/models/files/archives/archiveEntry.js';
import Zip from '../../src/models/files/archives/zip.js';
import File from '../../src/models/files/file.js';
import { ChecksumBitmask } from '../../src/models/files/fileChecksums.js';
import FsUtil from '../../src/utils/fsUtil.js';

const RAW_FILE_PATH = path.join('test', 'fixtures', 'roms', 'raw', 'fizzbuzz.nes');
const ZIP_FILE_PATH = path.join('test', 'fixtures', 'roms', 'zip', 'foobar.zip');

describe('loadFile', () => {
  it('should load after saving', async () => {
    const tempCache = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'cache'));
    const fileCache = new FileCache();
    await fileCache.loadFile(tempCache);

    // Compute some values
    await fileCache.getOrComputeFileChecksums(RAW_FILE_PATH, ChecksumBitmask.CRC32);
    await fileCache.getOrComputeArchiveChecksums(new Zip(ZIP_FILE_PATH), ChecksumBitmask.CRC32);

    await fileCache.save();
    await fileCache.loadFile(tempCache);
  });
});

describe('setFileChecksums', () => {
  it('should return the cached checksums without reading the file', async () => {
    const fileCache = new FileCache();
    const size = await FsUtil.size(RAW_FILE_PATH);

    // Given checksums that don't match the file's real contents
    const bogusFile = await File.fileOf(
      { filePath: RAW_FILE_PATH, size, crc32: '00000001' },
      ChecksumBitmask.CRC32,
    );
    await fileCache.setFileChecksums(RAW_FILE_PATH, bogusFile);

    // When
    const cachedFile = await fileCache.getOrComputeFileChecksums(
      RAW_FILE_PATH,
      ChecksumBitmask.CRC32,
    );

    // Then the cached checksums were returned, proving the file wasn't re-read
    expect(cachedFile.getCrc32()).toEqual('00000001');
    expect(cachedFile.getSize()).toEqual(size);
  });

  it('should recompute checksums that were cached without every checksum', async () => {
    const fileCache = new FileCache();
    const size = await FsUtil.size(RAW_FILE_PATH);
    const realFile = await new FileCache().getOrComputeFileChecksums(
      RAW_FILE_PATH,
      ChecksumBitmask.CRC32 | ChecksumBitmask.SHA1,
    );

    // Given only a CRC32 was cached
    const crc32OnlyFile = await File.fileOf(
      { filePath: RAW_FILE_PATH, size, crc32: realFile.getCrc32() },
      ChecksumBitmask.CRC32,
    );
    await fileCache.setFileChecksums(RAW_FILE_PATH, crc32OnlyFile);

    // When a SHA1 is also needed
    const computedFile = await fileCache.getOrComputeFileChecksums(
      RAW_FILE_PATH,
      ChecksumBitmask.CRC32 | ChecksumBitmask.SHA1,
    );

    // Then the file was re-read
    expect(computedFile.getSha1()).toEqual(realFile.getSha1());
  });

  it("should not cache checksums when the file's size doesn't match", async () => {
    const fileCache = new FileCache();
    const size = await FsUtil.size(RAW_FILE_PATH);
    const realFile = await new FileCache().getOrComputeFileChecksums(
      RAW_FILE_PATH,
      ChecksumBitmask.CRC32,
    );

    // Given checksums for a file of a different size
    const wrongSizeFile = await File.fileOf(
      { filePath: RAW_FILE_PATH, size: size + 1, crc32: '00000001' },
      ChecksumBitmask.CRC32,
    );
    await fileCache.setFileChecksums(RAW_FILE_PATH, wrongSizeFile);

    // When
    const computedFile = await fileCache.getOrComputeFileChecksums(
      RAW_FILE_PATH,
      ChecksumBitmask.CRC32,
    );

    // Then the checksums were computed from the real file
    expect(computedFile.getCrc32()).toEqual(realFile.getCrc32());
  });
});

describe('setArchiveChecksums', () => {
  it('should return the cached entries without reading the archive', async () => {
    const fileCache = new FileCache();
    const zip = new Zip(ZIP_FILE_PATH);

    // Given entries that don't match the archive's real contents
    const bogusEntry = await ArchiveEntry.entryOf(
      { archive: zip, entryPath: 'bogus.rom', size: 7, crc32: '00000002' },
      ChecksumBitmask.CRC32,
    );
    await fileCache.setArchiveChecksums(zip, [bogusEntry]);

    // When
    const cachedEntries = await fileCache.getOrComputeArchiveChecksums(zip, ChecksumBitmask.CRC32);

    // Then the cached entries were returned, proving the archive wasn't re-read
    expect(cachedEntries).toHaveLength(1);
    expect(cachedEntries[0].getEntryPath()).toEqual('bogus.rom');
    expect(cachedEntries[0].getCrc32()).toEqual('00000002');
  });

  it('should not cache zero entries', async () => {
    const fileCache = new FileCache();
    const zip = new Zip(ZIP_FILE_PATH);
    const realEntries = await new FileCache().getOrComputeArchiveChecksums(
      zip,
      ChecksumBitmask.CRC32,
    );
    expect(realEntries.length).toBeGreaterThan(0);

    // Given
    await fileCache.setArchiveChecksums(zip, []);

    // When
    const computedEntries = await fileCache.getOrComputeArchiveChecksums(
      zip,
      ChecksumBitmask.CRC32,
    );

    // Then the entries were read from the real archive
    expect(computedEntries.map((entry) => entry.getEntryPath())).toEqual(
      realEntries.map((entry) => entry.getEntryPath()),
    );
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
