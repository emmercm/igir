import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import Temp from '../../../../src/globals/temp.js';
import Gzip from '../../../../src/models/files/archives/gzip.js';
import Tar from '../../../../src/models/files/archives/tar.js';
import { ChecksumBitmask } from '../../../../src/models/files/fileChecksums.js';
import FsUtil from '../../../../src/utils/fsUtil.js';

/**
 * A one-file tar in the original v7 format, which has no "ustar" magic, only a header checksum.
 */
// eslint-disable-next-line unicorn/no-unnecessary-parameters
function v7Tar(fileName: string, data: Buffer): Buffer {
  const header = Buffer.alloc(512);
  header.write(fileName, 0, 'ascii');
  header.write('0000644\0', 100, 'ascii');
  header.write('0000000\0', 108, 'ascii');
  header.write('0000000\0', 116, 'ascii');
  header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 'ascii');
  header.write('00000000000\0', 136, 'ascii');
  header.write('0', 156, 'ascii');
  header.fill(0x20, 148, 156);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');

  const body = Buffer.alloc(Math.ceil(data.length / 512) * 512);
  data.copy(body);
  return Buffer.concat([header, body, Buffer.alloc(1024)]);
}

/**
 * Write a gzip of {@link size} bytes, which compress to a few hundred bytes, to a temp file.
 * @returns the temp file's path
 */
async function writeGzip(size: number): Promise<string> {
  await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
  const tempFile = `${await FsUtil.mktemp(path.join(Temp.getTempDir(), 'sized'))}.gz`;
  const data = Buffer.from(Array.from({ length: size }, (_, index) => (index * index) % 251));
  await FsUtil.writeFile(tempFile, zlib.gzipSync(data));
  return tempFile;
}

/**
 * Record the read streams' highWaterMarks and the gunzip streams' chunk sizes that get created.
 * @returns the recorded sizes, in the order the streams were created
 */
function spyOnChunkSizes(): { readHighWaterMarks: unknown[]; gunzipChunkSizes: unknown[] } {
  const readHighWaterMarks: unknown[] = [];
  const createReadStream = fs.createReadStream.bind(fs);
  vi.spyOn(fs, 'createReadStream').mockImplementation((filePath, options) => {
    readHighWaterMarks.push(typeof options === 'object' ? options.highWaterMark : undefined);
    return createReadStream(filePath, options);
  });
  const gunzipChunkSizes: unknown[] = [];
  const createGunzip = zlib.createGunzip.bind(zlib);
  vi.spyOn(zlib, 'createGunzip').mockImplementation((options) => {
    gunzipChunkSizes.push(options?.chunkSize);
    return createGunzip(options);
  });
  return { readHighWaterMarks, gunzipChunkSizes };
}

describe('getArchiveEntries', () => {
  it('should not parse a plain gzipped file as a tar', async () => {
    const tarSpy = vi.spyOn(Tar.prototype, 'getArchiveEntries');
    try {
      const entries = await new Gzip(
        path.join('test', 'fixtures', 'roms', 'gz', 'fizzbuzz.gz'),
      ).getArchiveEntries(ChecksumBitmask.CRC32);

      expect(entries).toHaveLength(1);
      expect(tarSpy).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it.each([
    [
      'a bad checksum',
      (tar: Buffer): void => {
        tar.write('0000001\0', 148, 'ascii');
      },
    ],
    [
      'no checksum',
      (tar: Buffer): void => {
        tar.fill(0, 148, 156);
      },
    ],
    [
      'an all-zero header',
      (tar: Buffer): void => {
        tar.fill(0, 0, 512);
      },
    ],
  ])('should not parse a gzipped tar header with %s as a tar', async (_, corrupt) => {
    const tarSpy = vi.spyOn(Tar.prototype, 'getArchiveEntries');
    await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
    const tempFile = `${await FsUtil.mktemp(path.join(Temp.getTempDir(), 'bad'))}.tar.gz`;
    const tar = v7Tar('file.txt', Buffer.from('hello'));
    corrupt(tar);
    await FsUtil.writeFile(tempFile, zlib.gzipSync(tar));
    try {
      const entries = await new Gzip(tempFile).getArchiveEntries(ChecksumBitmask.CRC32);

      expect(entries).toHaveLength(1);
      expect(tarSpy).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should close the file when the gzip data is corrupt', async () => {
    const readStreams: fs.ReadStream[] = [];
    const createReadStream = fs.createReadStream.bind(fs);
    vi.spyOn(fs, 'createReadStream').mockImplementation((...args) => {
      const readStream = createReadStream(...args);
      readStreams.push(readStream);
      return readStream;
    });
    await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
    const tempFile = `${await FsUtil.mktemp(path.join(Temp.getTempDir(), 'corrupt'))}.gz`;
    const gzip = zlib.gzipSync(Buffer.alloc(1024 * 1024));
    // Keep the gzip header and trailer, and make the deflate data larger than one read
    const corrupt = Buffer.concat([
      gzip.subarray(0, 10),
      Buffer.alloc(1024 * 1024, 0xff),
      gzip.subarray(-8),
    ]);
    await FsUtil.writeFile(tempFile, corrupt);
    try {
      await new Gzip(tempFile).getArchiveEntries(ChecksumBitmask.CRC32);

      expect(readStreams.length).toBeGreaterThan(0);
      expect(readStreams.every((readStream) => readStream.destroyed)).toEqual(true);
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it.each(['foobar.tar.gz', 'loremipsum.tar.gz'])(
    'should read a gzipped tar as a tar: %s',
    async (fixture) => {
      const filePath = path.join('test', 'fixtures', 'roms', 'tar', fixture);

      const entries = await new Gzip(filePath).getArchiveEntries(ChecksumBitmask.CRC32);

      const tarEntries = await new Tar(filePath).getArchiveEntries(ChecksumBitmask.CRC32);
      expect(entries.map((entry) => entry.getEntryPath())).toEqual(
        tarEntries.map((entry) => entry.getEntryPath()),
      );
    },
  );

  it('should read and decompress no more than the file holds at a time', async () => {
    const tempFile = await writeGzip(10_000);
    const compressedSize = await FsUtil.size(tempFile);
    const chunkSizes = spyOnChunkSizes();
    try {
      await new Gzip(tempFile).getArchiveEntries(ChecksumBitmask.SHA1);

      // The tar probe's chunks are sized to its range, and the hash's to the file's sizes
      expect(chunkSizes).toEqual({
        readHighWaterMarks: [compressedSize, compressedSize],
        gunzipChunkSizes: [4096, 10_001],
      });
    } finally {
      vi.restoreAllMocks();
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should read a gzipped v7 tar, which has no ustar magic, as a tar', async () => {
    await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
    const tempFile = `${await FsUtil.mktemp(path.join(Temp.getTempDir(), 'v7'))}.tar.gz`;
    await FsUtil.writeFile(tempFile, zlib.gzipSync(v7Tar('file.txt', Buffer.from('hello'))));
    try {
      const entries = await new Gzip(tempFile).getArchiveEntries(ChecksumBitmask.CRC32);

      expect(entries.map((entry) => entry.getEntryPath())).toEqual(['file.txt']);
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });
});

describe('extractEntryToFile', () => {
  it.each([
    ['the trailer size', 10_000, 10_000, (): number => 10_001],
    // A multi-member gzip's trailer only holds the last member's size, which can be tiny
    [
      'an understated trailer size',
      10_000,
      1,
      (compressedSize: number): number => compressedSize + 1,
    ],
    ['a size smaller than zlib allows', 10, 10, (): number => 64],
  ])(
    'should read and decompress no more than the file holds at a time, for %s',
    async (_, dataSize, size, getExpectedGunzipChunkSize) => {
      const tempFile = await writeGzip(dataSize);
      const compressedSize = await FsUtil.size(tempFile);
      const extractedFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'extracted'));
      const chunkSizes = spyOnChunkSizes();
      try {
        await new Gzip(tempFile).extractEntryToFile({ entryPath: '', size }, extractedFile);

        expect(chunkSizes).toEqual({
          readHighWaterMarks: [compressedSize],
          gunzipChunkSizes: [getExpectedGunzipChunkSize(compressedSize)],
        });
        await expect(FsUtil.size(extractedFile)).resolves.toEqual(dataSize);
      } finally {
        vi.restoreAllMocks();
        await FsUtil.rm(tempFile, { force: true });
        await FsUtil.rm(extractedFile, { force: true });
      }
    },
  );
});
