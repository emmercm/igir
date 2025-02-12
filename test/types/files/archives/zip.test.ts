import path from 'node:path';

import Temp from '../../../../src/globals/temp.js';
import ROMScanner from '../../../../src/modules/roms/romScanner.js';
import fsPoly from '../../../../src/polyfill/fsPoly.js';
import ArchiveEntry from '../../../../src/types/files/archives/archiveEntry.js';
import Zip from '../../../../src/types/files/archives/zip.js';
import File from '../../../../src/types/files/file.js';
import FileCache from '../../../../src/types/files/fileCache.js';
import FileFactory from '../../../../src/types/files/fileFactory.js';
import Options from '../../../../src/types/options.js';
import ProgressBarFake from '../../../console/progressBarFake.js';

async function findRoms(input: string): Promise<File[]> {
  return new ROMScanner(
    new Options({
      input: [input],
    }),
    new ProgressBarFake(),
    new FileFactory(new FileCache()),
  ).scan();
}

describe('createArchive', () => {
  test.each([
    './test/fixtures/roms/**/*.rom',
    './test/fixtures/roms/**/*.7z',
    './test/fixtures/roms/**/*.rar',
    './test/fixtures/roms/**/*.tar.gz',
    './test/fixtures/roms/**/*.zip',
  ])('should throw on missing input files: %s', async (input) => {
    expect.assertions(2);

    // Given a temp ROM file copied from fixtures
    const rom = (await findRoms(input)).find((file) => file.getSize() > 0);
    if (!rom) {
      throw new Error('no ROM of a non-zero size was found');
    }
    const tempDir = await fsPoly.mkdtemp(Temp.getTempDir());
    const tempFilePath = path.join(tempDir, path.basename(rom.getFilePath()));
    await fsPoly.copyFile(rom.getFilePath(), tempFilePath);

    // And a candidate is partially generated for that file
    const tempFiles = await new FileFactory(new FileCache()).filesFrom(tempFilePath);
    const inputToOutput = await Promise.all(
      tempFiles.map(async (tempFile) => {
        const archiveEntry = await ArchiveEntry.entryOf({
          ...tempFile,
          archive: new Zip(`${tempFile.getExtractedFilePath()}.zip`),
          entryPath: tempFile.getExtractedFilePath(),
        });
        return [tempFile, archiveEntry] as [File, ArchiveEntry<Zip>];
      }),
    );

    // And the input files have been deleted
    await Promise.all(
      inputToOutput.map(async ([tempInputFile]) => {
        await fsPoly.rm(tempInputFile.getFilePath(), { force: true });
      }),
    );

    // When the file is being zipped
    // Then any underlying exception will be re-thrown
    const zip = inputToOutput[0][1].getArchive();
    await expect(zip.createArchive(inputToOutput)).rejects.toThrow();

    // And we were able to continue
    expect(true).toEqual(true);
  });
});
