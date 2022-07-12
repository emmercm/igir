import AdmZip from 'adm-zip';
import fsPromises from 'node:fs/promises';
import path from 'path';

import DAT from '../types/dat/dat.js';
import Parent from '../types/dat/parent.js';
import ROM from '../types/dat/rom.js';
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

    this.progressBar.reset(parentsToCandidates.size).setSymbol(this.options.getZip() ? '🗜️' : '📂');

    const parentsToCandidatesEntries = [...parentsToCandidates.entries()];
    for (let i = 0; i < parentsToCandidatesEntries.length; i += 1) {
      const parent = parentsToCandidatesEntries[i][0];
      const releaseCandidates = parentsToCandidatesEntries[i][1];

      this.progressBar.increment();

      const outputRomFiles: ROMFile[] = [];

      /* eslint-disable no-await-in-loop */
      for (let j = 0; j < releaseCandidates.length; j += 1) {
        const releaseCandidate = releaseCandidates[j];

        const crcToRoms = releaseCandidate.getRomsByCrc();

        const inputToOutput = releaseCandidate.getRomFiles().reduce((acc, inputRomFile) => {
          const rom = crcToRoms.get(inputRomFile.getCrc()) as ROM;

          let outputFilePath = this.options.getOutput(dat, rom.getName());
          let entryPath;

          if (this.options.getZip()) {
            outputFilePath = this.options.getOutput(dat, `${releaseCandidate.getName()}.zip`);
            entryPath = rom.getName();
          }

          const outputRomFile = new ROMFile(outputFilePath, entryPath, inputRomFile.getCrc());
          acc.set(inputRomFile, outputRomFile);
          return acc;
        }, new Map<ROMFile, ROMFile>());

        // TODO(cemmer): dry run

        const writeNeeded = [...inputToOutput.entries()]
          .some((entry) => !entry[0].equals(entry[1]));
        if (writeNeeded) {
          if (this.options.getZip()) {
            await this.writeZip(inputToOutput);
          } else {
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
      await fsPromises.access(outputZipPath);
      outputZip = new AdmZip(outputZipPath);
    } catch (e) {
      // eslint-disable-line no-empty
    }

    let outputNeedsCleaning = outputZip.getEntryCount() > 0;
    let outputNeedsWriting = false;

    /* eslint-disable no-await-in-loop */
    const inputToOutputEntries = [...inputToOutput.entries()];
    for (let i = 0; i < inputToOutputEntries.length; i += 1) {
      const inputRomFile = inputToOutputEntries[i][0];
      const outputRomFile = inputToOutputEntries[i][1];

      if (outputRomFile.equals(inputRomFile)) {
        return;
      }

      if (this.options.getMove()) {
        // TODO(cemmer)
        return;
      }

      // If the file in the output zip already exists and has the same CRC then do nothing
      const existingOutputEntry = outputZip.getEntry(outputRomFile.getEntryPath() as string);
      if (existingOutputEntry
          && existingOutputEntry.header.crc === parseInt(outputRomFile.getCrc(), 16)) {
        return;
      }

      // We need to write to the zip file, delete its contents if the zip file didn't start empty
      if (outputNeedsCleaning) {
        outputZip.getEntries().forEach((entry) => outputZip.deleteFile(entry));
        outputNeedsCleaning = false;
      }

      // Write the entry
      const inputRomFileLocal = await inputRomFile.toLocalFile();
      outputZip.addLocalFile(
        inputRomFileLocal.getFilePath(),
        '',
        outputRomFile.getEntryPath() as string,
      );
      await inputRomFileLocal.cleanupLocalFile();
      outputNeedsWriting = true;
    }

    // Write the zip file if needed
    if (outputNeedsWriting) {
      await outputZip.writeZipPromise(outputZipPath);
    }

    // If "moving", delete the input files
    if (this.options.getMove()) {
      await Promise.all(
        [...inputToOutput.keys()]
          .map((romFile) => romFile.getFilePath())
          .filter((filePath) => filePath !== outputZipPath)
          .filter((romFile, idx, romFiles) => romFiles.indexOf(romFile) === idx)
          .map((filePath) => fsPromises.rm(filePath)),
      );
    }
  }

  private async writeRaw(inputToOutput: Map<ROMFile, ROMFile>) {
    /* eslint-disable no-await-in-loop */
    const inputToOutputEntries = [...inputToOutput.entries()];
    for (let i = 0; i < inputToOutputEntries.length; i += 1) {
      const inputRomFile = inputToOutputEntries[i][0];
      const outputRomFile = inputToOutputEntries[i][1];

      if (outputRomFile.equals(inputRomFile)) {
        return;
      }

      // Create the output directory
      const outputDir = path.dirname(outputRomFile.getFilePath());
      try {
        await fsPromises.access(outputDir);
      } catch (e) {
        await fsPromises.mkdir(outputDir, { recursive: true });
      }

      const inputRomFileLocal = await inputRomFile.toLocalFile();
      if (this.options.getMove()) {
        await fsPromises.rename(inputRomFileLocal.getFilePath(), outputRomFile.getFilePath());
      } else {
        await fsPromises.copyFile(inputRomFileLocal.getFilePath(), outputRomFile.getFilePath());
      }
      await inputRomFileLocal.cleanupLocalFile();
    }
  }
}
