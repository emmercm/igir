import path from 'node:path';

import Temp from '../../../../src/globals/temp.js';
import ArchiveEntry from '../../../../src/models/files/archives/archiveEntry.js';
import NkitIso from '../../../../src/models/files/archives/nkitIso.js';
import FsUtil from '../../../../src/utils/fsUtil.js';

describe('getArchiveEntries', () => {
  it("should return the original disc's checksum and size", async () => {
    const nkitIso = new NkitIso(
      path.join('test', 'fixtures', 'roms', 'nkit', 'GameCube-240pSuite-1.19.nkit.iso'),
    );

    await expect(nkitIso.getArchiveEntries()).resolves.toEqual([
      await ArchiveEntry.entryOf({
        archive: nkitIso,
        entryPath: 'GameCube-240pSuite-1.19.iso',
        size: 1_671_168,
        crc32: '5eb3d183',
      }),
    ]);
  });

  it('should throw on a truncated header', async () => {
    const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
    try {
      // The header ends at 0x214
      const filePath = path.join(tempDir, 'truncated.nkit.iso');
      await FsUtil.writeFile(filePath, Buffer.alloc(0x2_13));

      await expect(new NkitIso(filePath).getArchiveEntries()).rejects.toThrow(
        /NKit ISO header is truncated/,
      );
    } finally {
      await FsUtil.rm(tempDir, { recursive: true, force: true });
    }
  });
});
