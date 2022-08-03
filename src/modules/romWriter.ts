import AdmZip from 'adm-zip';
import fsPromises from 'node:fs/promises';
import path from 'path';

import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
import ROM from '../types/logiqx/rom.js';
import Options from '../types/options.js';
import ProgressBar from '../types/progressBar.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMFile from '../types/romFile.js';

export default class ROMWriter {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async write(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<Map<Parent, ROMFile[]>> {
    const output = new Map<Parent, ROMFile[]>();

    if (!parentsToCandidates.size) {
      return output;
    }

    await this.progressBar.setSymbol('📂');
    await this.progressBar.reset(parentsToCandidates.size);

    const parentsToCandidatesEntries = [...parentsToCandidates.entries()];

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < parentsToCandidatesEntries.length; i += 1) {
      const parent = parentsToCandidatesEntries[i][0];
      const releaseCandidates = parentsToCandidatesEntries[i][1];

      await this.progressBar.increment();

      const outputRomFiles: ROMFile[] = [];

      /* eslint-disable no-await-in-loop */
      for (let j = 0; j < releaseCandidates.length; j += 1) {
        const releaseCandidate = releaseCandidates[j];

        const crcToRoms = releaseCandidate.getRomsByCrc32();

        const inputToOutput = releaseCandidate.getRomFiles().reduce((acc, inputRomFile) => {
          const rom = crcToRoms.get(inputRomFile.getCrc32()) as ROM;

          let outputFilePath = this.options.getOutput(
            dat,
            inputRomFile.getFilePath(),
            rom.getName(),
          );
          let entryPath;

          if (this.options.shouldZip(rom.getName())) {
            outputFilePath = this.options.getOutput(dat, inputRomFile.getFilePath(), `${releaseCandidate.getName()}.zip`);
            entryPath = rom.getName();
          }

          const outputRomFile = new ROMFile(outputFilePath, entryPath, inputRomFile.getCrc32());
          acc.set(inputRomFile, outputRomFile);
          return acc;
        }, new Map<ROMFile, ROMFile>());

        if (!this.options.shouldWrite()) {
          const writeNeeded = [...inputToOutput.entries()]
            .some((entry) => !entry[0].equals(entry[1]));
          if (writeNeeded) {
            await this.writeZip(inputToOutput);
            await this.writeRaw(inputToOutput);
          }
        }

        outputRomFiles.push(...inputToOutput.values());
      }

      output.set(parent, outputRomFiles);
    }

    return output;
  }

  private async writeZip(inputToOutput: Map<ROMFile, ROMFile>) {
    // There is only one output file
    const outputZipPath = [...inputToOutput.values()][0].getFilePath();
    let outputZip = new AdmZip();
    try {
      await fsPromises.access(outputZipPath); // throw if file doesn't exist
      if (!this.options.getOverwrite()) {
        return;
      }
      outputZip = new AdmZip(outputZipPath);
    } catch (e) {
      // eslint-disable-line no-empty
    }

    let outputNeedsCleaning = outputZip.getEntryCount() > 0;
    let outputNeedsWriting = false;

    /* eslint-disable no-await-in-loop */
    const inputToOutputEntries = [...inputToOutput.entries()]
      .filter((output) => path.extname(output[1].getFilePath()) === '.zip');
    for (let i = 0; i < inputToOutputEntries.length; i += 1) {
      const inputRomFile = inputToOutputEntries[i][0];
      const outputRomFile = inputToOutputEntries[i][1];

      if (outputRomFile.equals(inputRomFile)) {
        return;
      }

      if (this.options.shouldMove()) {
        // TODO(cemmer)
        return;
      }

      // If the file in the output zip already exists and has the same CRC then
      // do nothing
      const existingOutputEntry = outputZip.getEntry(outputRomFile.getArchiveEntryPath() as string);
      if (existingOutputEntry?.header.crc === parseInt(outputRomFile.getCrc32(), 16)) {
        return;
      }

      // We need to write to the zip file, delete its contents if the zip file
      // didn't start empty
      if (outputNeedsCleaning) {
        outputZip.getEntries().forEach((entry) => outputZip.deleteFile(entry));
        outputNeedsCleaning = false;
      }

      // Write the entry
      let inputRomFileLocal;
      try {
        inputRomFileLocal = await inputRomFile.toLocalFile(this.options.getTempDir());
      } catch (e) {
        await this.progressBar.logError(`Failed to extract ${inputRomFile.getFilePath()} : ${e}`);
        return;
      }
      try {
        outputZip.addLocalFile(
          inputRomFileLocal.getFilePath(),
          '',
          outputRomFile.getArchiveEntryPath() as string,
        );
      } catch (e) {
        await this.progressBar.logError(`Failed to add ${inputRomFileLocal.getFilePath()} to zip ${outputZipPath} : ${e}`);
        return;
      }
      await inputRomFileLocal.cleanupLocalFile();
      outputNeedsWriting = true;
    }

    // Write the zip file if needed
    if (outputNeedsWriting) {
      try {
        await outputZip.writeZipPromise(outputZipPath);
      } catch (e) {
        await this.progressBar.logError(`Failed to write zip ${outputZipPath} : ${e}`);
        return;
      }
    }

    // Test the written file
    if (this.options.shouldTest()) {
      try {
        const zipToTest = new AdmZip(outputZipPath);
        if (!zipToTest.test()) {
          await this.progressBar.logError(`Written zip is invalid: ${outputZipPath}`);
          return;
        }
      } catch (e) {
        await this.progressBar.logError(`Failed to test zip ${outputZipPath} : ${e}`);
      }
    }

    // If "moving", delete the input files
    if (this.options.shouldMove()) {
      await Promise.all(
        [...inputToOutput.keys()]
          .map((romFile) => romFile.getFilePath())
          .filter((filePath) => filePath !== outputZipPath)
          .filter((romFile, idx, romFiles) => romFiles.indexOf(romFile) === idx)
          .map((filePath) => fsPromises.rm(filePath, { force: true })),
      );
    }
  }

  private async writeRaw(inputToOutput: Map<ROMFile, ROMFile>) {
    /* eslint-disable no-await-in-loop */
    const inputToOutputEntries = [...inputToOutput.entries()]
      .filter((output) => path.extname(output[1].getFilePath()) !== '.zip');
    for (let i = 0; i < inputToOutputEntries.length; i += 1) {
      const inputRomFile = inputToOutputEntries[i][0];
      const outputRomFile = inputToOutputEntries[i][1];
      await this.writeRawSingle(inputRomFile, outputRomFile);
    }
  }

  private async writeRawSingle(inputRomFile: ROMFile, outputRomFile: ROMFile) {
    if (outputRomFile.equals(inputRomFile)) {
      return;
    }

    const outputFilePath = outputRomFile.getFilePath();

    // If the output file already exists, do nothing
    const overwrite = this.options.getOverwrite();
    if (!overwrite) {
      try {
        await fsPromises.access(outputFilePath); // throw if file doesn't exist
        return;
      } catch (e) {
        // eslint-disable-line no-empty
      }
    }

    // Create the output directory
    const outputDir = path.dirname(outputFilePath);
    try {
      await fsPromises.access(outputDir); // throw if file doesn't exist
    } catch (e) {
      await fsPromises.mkdir(outputDir, { recursive: true });
    }

    // Write the output file
    const inputRomFileLocal = await inputRomFile.toLocalFile(this.options.getTempDir());
    await fsPromises.copyFile(inputRomFileLocal.getFilePath(), outputFilePath);
    await inputRomFileLocal.cleanupLocalFile();

    // Test the written file
    if (this.options.shouldTest()) {
      const romFileToTest = new ROMFile(outputFilePath);
      if (romFileToTest.getCrc32() !== inputRomFile.getCrc32()) {
        await this.progressBar.logError(`Written file has the CRC ${romFileToTest.getCrc32()}, expected ${inputRomFile.getCrc32()}: ${outputFilePath}`);
        return;
      }
    }

    // Delete the original file if we're supposed to "move" it
    if (this.options.shouldMove()) {
      await fsPromises.rm(inputRomFileLocal.getFilePath(), { force: true });
    }
  }
}
