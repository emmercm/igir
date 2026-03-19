import path from 'node:path';

import ROMIndexer from '../../../src/modules/roms/romIndexer.js';
import ArchiveEntry from '../../../src/types/files/archives/archiveEntry.js';
import Zip from '../../../src/types/files/archives/zip.js';
import File from '../../../src/types/files/file.js';
import { ChecksumBitmask } from '../../../src/types/files/fileChecksums.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const FIXTURE_ROMS_DIR = path.join('test', 'fixtures', 'roms');

function indexFiles(files: File[], options?: Options): File[] {
  const opts = options ?? new Options({ commands: ['copy'], output: 'output' });
  const indexed = new ROMIndexer(opts, new ProgressBarFake()).index(files);
  return indexed.getFiles();
}

describe('index', () => {
  it('should return an empty index for no files', () => {
    expect(indexFiles([])).toHaveLength(0);
  });

  it('should index a single plain file', async () => {
    const file = await File.fileOf(
      { filePath: path.join(FIXTURE_ROMS_DIR, 'raw', 'one.rom') },
      ChecksumBitmask.CRC32,
    );
    const files = indexFiles([file]);
    expect(files).toHaveLength(1);
    expect(files[0].getFilePath()).toContain('one.rom');
  });

  it('should index multiple files', async () => {
    const file1 = await File.fileOf(
      { filePath: path.join(FIXTURE_ROMS_DIR, 'raw', 'one.rom') },
      ChecksumBitmask.CRC32,
    );
    const file2 = await File.fileOf(
      { filePath: path.join(FIXTURE_ROMS_DIR, 'raw', 'two.rom') },
      ChecksumBitmask.CRC32,
    );
    expect(indexFiles([file1, file2])).toHaveLength(2);
  });

  it('should prefer unarchived files over archived files with the same checksum', async () => {
    // Given a plain file and a zip archive entry with the same checksum/size
    const plainFile = await File.fileOf(
      { filePath: path.join(FIXTURE_ROMS_DIR, 'raw', 'one.rom') },
      ChecksumBitmask.CRC32,
    );

    const zip = new Zip(path.join(FIXTURE_ROMS_DIR, 'fizzbuzz.zip'));
    // Create a fake archive entry with the same checksum/size as the plain file
    const archiveEntry = await ArchiveEntry.entryOf({
      archive: zip,
      entryPath: 'one.rom',
      size: plainFile.getSize(),
      crc32: plainFile.getCrc32(),
    });

    const options = new Options({ commands: ['copy'], output: 'output' });

    // Index both: the archive entry first, to ensure sorting isn't just insertion order
    const indexed = new ROMIndexer(options, new ProgressBarFake()).index([archiveEntry, plainFile]);

    // The sorted list for the shared checksum should have the plain file first
    const foundFiles = indexed.findFiles(plainFile) ?? [];
    expect(foundFiles.length).toBeGreaterThan(0);
    // The first result should be the plain (unarchived) file
    const firstResult = foundFiles[0];
    expect(firstResult instanceof ArchiveEntry).toEqual(false);
  });
});
