import path from 'node:path';
import zlib from 'node:zlib';

import * as tar from 'tar';

import Temp from '../../../../src/globals/temp.js';
import Tar from '../../../../src/models/files/archives/tar.js';
import FileChecksums, { ChecksumBitmask } from '../../../../src/models/files/fileChecksums.js';
import FsUtil from '../../../../src/utils/fsUtil.js';

describe('getArchiveEntries', () => {
  it('should reject rather than hang when hashing an entry fails', async () => {
    // An async 'entry' handler has nowhere to put a rejection, and failing part-way through it
    // leaves the entry unresumed, which stalls the parser and its 'end' event forever
    vi.spyOn(FileChecksums, 'hashStream').mockRejectedValue(new Error('hash failed'));
    try {
      await expect(
        new Tar(path.join('test', 'fixtures', 'roms', 'tar', 'fizzbuzz.tar.gz')).getArchiveEntries(
          ChecksumBitmask.CRC32,
        ),
      ).rejects.toThrow('hash failed');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('should abort the parser when hashing an entry fails', async () => {
    // Destroying the read stream closes its file handle, but pipe() doesn't propagate that
    // downstream, so only abort() tears down the parser's decompressor and its zlib binding
    vi.spyOn(FileChecksums, 'hashStream').mockRejectedValue(new Error('hash failed'));
    const abortSpy = vi.spyOn(tar.Parser.prototype, 'abort');
    try {
      await expect(
        new Tar(path.join('test', 'fixtures', 'roms', 'tar', 'fizzbuzz.tar.gz')).getArchiveEntries(
          ChecksumBitmask.CRC32,
        ),
      ).rejects.toThrow('hash failed');

      expect(abortSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('should not abort the parser when every entry is read successfully', async () => {
    const abortSpy = vi.spyOn(tar.Parser.prototype, 'abort');
    try {
      const entries = await new Tar(
        path.join('test', 'fixtures', 'roms', 'tar', 'fizzbuzz.tar.gz'),
      ).getArchiveEntries(ChecksumBitmask.CRC32);

      expect(entries).toHaveLength(1);
      expect(abortSpy).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('should reject rather than crash on a truncated gzipped tar', async () => {
    // Build a valid gzip stream, then chop off the end to simulate a corrupt/incomplete download.
    // Without an 'error' listener on the tar.Parser, the resulting fatal zlib error is emitted as
    // an unhandled 'error' event that crashes the whole process instead of rejecting.
    const validGzip = zlib.gzipSync(Buffer.alloc(64 * 1024));
    const truncatedGzip = validGzip.subarray(0, -8);
    await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
    const tempFile = `${await FsUtil.mktemp(path.join(Temp.getTempDir(), 'truncated'))}.tar.gz`;
    await FsUtil.writeFile(tempFile, truncatedGzip);
    try {
      await expect(new Tar(tempFile).getArchiveEntries(ChecksumBitmask.CRC32)).rejects.toThrow();
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });
});
