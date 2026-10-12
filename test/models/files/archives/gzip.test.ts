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
