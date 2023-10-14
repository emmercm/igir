import path from 'node:path';

import Constants from '../../../../src/constants.js';
import ROMScanner from '../../../../src/modules/romScanner.js';
import fsPoly from '../../../../src/polyfill/fsPoly.js';
import Header from '../../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../../src/types/dats/logiqx/logiqxDat.js';
import ArchiveEntry from '../../../../src/types/files/archives/archiveEntry.js';
import Zip from '../../../../src/types/files/archives/zip.js';
import File from '../../../../src/types/files/file.js';
import FileFactory from '../../../../src/types/files/fileFactory.js';
import Options from '../../../../src/types/options.js';
import ProgressBarFake from '../../../console/progressBarFake.js';

async function findRoms(input: string): Promise<File[]> {
  return new ROMScanner(new Options({
    input: [input],
  }), new ProgressBarFake()).scan();
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
    const rom = (await findRoms(input))
      .find((file) => file.getSize());
    if (!rom) {
      throw new Error('no ROM of a non-zero size was found');
    }
    const tempDir = await fsPoly.mkdtemp(Constants.GLOBAL_TEMP_DIR);
    const tempFilePath = path.join(tempDir, path.basename(rom.getFilePath()));
    await fsPoly.copyFile(rom.getFilePath(), tempFilePath);

    // And a candidate is partially generated for that file
    const tempFiles = await FileFactory.filesFrom(tempFilePath);
    const inputToOutput = await Promise.all(tempFiles.map(async (tempFile) => {
      const archiveEntry = await ArchiveEntry.entryOf(
        new Zip(`${tempFile.getExtractedFilePath()}.zip`),
        tempFile.getExtractedFilePath(),
        tempFile.getSize(),
        tempFile,
      );
      return [tempFile, archiveEntry] as [File, ArchiveEntry<Zip>];
    }));

    // And the input files have been deleted
    await Promise.all(inputToOutput.map(async ([tempInputFile]) => {
      await fsPoly.rm(tempInputFile.getFilePath(), { force: true });
    }));

    // When the file is being zipped
    // Then any underlying exception will be re-thrown
    const zip = inputToOutput[0][1].getArchive();
    await expect(zip.createArchive(
      new Options(),
      new LogiqxDAT(new Header(), []),
      inputToOutput,
    )).rejects.toThrow();

    // And we were able to continue
    expect(true).toEqual(true);
  });
});
