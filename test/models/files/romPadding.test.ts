import path from 'node:path';

import File from '../../../src/models/files/file.js';
import FileChecksums, { ChecksumBitmask } from '../../../src/models/files/fileChecksums.js';
import ROMPadding from '../../../src/models/files/romPadding.js';
import PadEndTransform from '../../../src/streams/padEndTransform.js';

const TRIMMED_ROM = path.join('test', 'fixtures', 'roms', 'raw', 'trimmed.3ds');

describe('paddingsFromFile', () => {
  it('returns no paddings for a file that is already a power of two', async () => {
    const file = await File.fileOf({
      filePath: path.join('test', 'fixtures', 'roms', 'raw', 'one.rom'),
    });

    await expect(ROMPadding.paddingsFromFile(file)).resolves.toEqual([]);
  });

  it('returns a padding for every known fill byte', async () => {
    const file = await File.fileOf({ filePath: TRIMMED_ROM }, ChecksumBitmask.CRC32);

    const paddings = await ROMPadding.paddingsFromFile(file);

    expect(paddings).toHaveLength(ROMPadding.getKnownFillBytesCount());
    for (const padding of paddings) {
      // 520 bytes rounds up to the next power of two
      expect(padding.getPaddedSize()).toEqual(1024);
      expect(padding.getCrc32()).toBeDefined();
    }
    // Each fill byte produces a distinct file, so none of the checksums may collide
    expect(new Set(paddings.map((padding) => padding.getCrc32())).size).toEqual(paddings.length);
  });

  it('destroys every padded stream when hashing one of them fails', async () => {
    // Promise.all() abandons the other streams the moment it rejects, so without an explicit
    // teardown they are left un-destroyed holding their buffered chunks
    const file = await File.fileOf({ filePath: TRIMMED_ROM }, ChecksumBitmask.CRC32);
    const destroySpy = vi.spyOn(PadEndTransform.prototype, 'destroy');
    vi.spyOn(FileChecksums, 'hashStream').mockRejectedValue(new Error('hash failed'));
    try {
      await expect(ROMPadding.paddingsFromFile(file)).rejects.toThrow('hash failed');

      expect(destroySpy).toHaveBeenCalledTimes(ROMPadding.getKnownFillBytesCount());
    } finally {
      vi.restoreAllMocks();
    }
  });
});
