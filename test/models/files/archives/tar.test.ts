import path from 'node:path';
import zlib from 'node:zlib';

import Temp from '../../../../src/globals/temp.js';
import Tar from '../../../../src/models/files/archives/tar.js';
import { ChecksumBitmask } from '../../../../src/models/files/fileChecksums.js';
import FsUtil from '../../../../src/utils/fsUtil.js';

describe('getArchiveEntries', () => {
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
