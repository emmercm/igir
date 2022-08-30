import AdmZip from 'adm-zip';
import { promises as fsPromises } from 'fs';
import path from 'path';

import ProgressBar, { Symbols } from '../console/progressBar.js';
import fsPoly from '../polyfill/fsPoly.js';
import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
import ROM from '../types/logiqx/rom.js';
import Options from '../types/options.js';
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
    await this.progressBar.logInfo(`${dat.getName()}: Writing candidates`);
    const output = new Map<Parent, ROMFile[]>();

    if (!parentsToCandidates.size) {
      return output;
    }

    await this.progressBar.setSymbol(Symbols.WRITING);
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

        const results = await this.writeReleaseCandidate(dat, releaseCandidate);
        outputRomFiles.push(...results);
      }

      output.set(parent, outputRomFiles);
    }

    return output;
  }

  private async writeReleaseCandidate(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
  ): Promise<ROMFile[]> {
    if (!this.options.shouldWrite()) {
      await this.progressBar.logDebug(`${dat.getName()} | ${releaseCandidate.getName()}: not writing`);
      return [];
    }

    const inputToOutput = this.buildInputToOutput(dat, releaseCandidate);

    // Determine if a write is needed based on the output not equaling the input
    const writeNeeded = [...inputToOutput.entries()]
      .some(([inputRomFile, outputRomFile]) => !inputRomFile.equals(outputRomFile));
    await this.progressBar.logDebug(`${dat.getName()} | ${releaseCandidate.getName()}: ${writeNeeded ? '' : 'no '}write needed`);

    if (writeNeeded) {
      // Write is needed, return the ROMFiles that were written
      return [
        ...await this.writeZip(inputToOutput),
        ...await this.writeRaw(inputToOutput),
      ];
    }

    // Write isn't needed, return the ROMFiles that didn't need writing
    return [...inputToOutput.values()];
  }

  private buildInputToOutput(dat: DAT, releaseCandidate: ReleaseCandidate): Map<ROMFile, ROMFile> {
    const crcToRoms = releaseCandidate.getRomsByCrc32();

    return releaseCandidate.getRomFiles().reduce((acc, inputRomFile) => {
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
  }

  private async ensureOutputDirExists(outputFilePath: string): Promise<void> {
    const outputDir = path.dirname(outputFilePath);
    if (!await fsPoly.exists(outputDir)) {
      await this.progressBar.logDebug(`Creating the directory: ${outputDir}`);
      await fsPromises.mkdir(outputDir, { recursive: true });
    }
  }

  /** ********************
   *                     *
   *     Zip Writing     *
   *                     *
   ********************* */

  private async writeZip(inputToOutput: Map<ROMFile, ROMFile>): Promise<ROMFile[]> {
    // There is only one output file
    const outputRomFile = [...inputToOutput.values()][0];
    const outputZipPath = outputRomFile.getFilePath();
    const writtenRomFiles = [outputRomFile];

    const inputToOutputEntries = [...inputToOutput.entries()]
      .filter((output) => output[1].isZip());
    if (!inputToOutputEntries.length) {
      return writtenRomFiles;
    }

    const outputZip = await this.openAndCleanZipFile(outputZipPath);
    if (!outputZip) {
      return writtenRomFiles;
    }
    let outputNeedsWriting = false;

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < inputToOutputEntries.length; i += 1) {
      outputNeedsWriting = outputNeedsWriting || await this.addZipEntry(
        outputZipPath,
        outputZip,
        inputToOutputEntries[i][0],
        inputToOutputEntries[i][1],
      );
    }

    // Write the zip file if needed
    if (outputNeedsWriting) {
      await this.ensureOutputDirExists(outputZipPath);
      await this.writeZipFile(outputZipPath, outputZip);
      await this.testWrittenZip(outputZipPath);
      await this.deleteMovedZipEntries(outputZipPath, [...inputToOutput.keys()]);
      return writtenRomFiles;
    }

    return writtenRomFiles;
  }

  private async openAndCleanZipFile(outputZipPath: string): Promise<AdmZip | null> {
    let outputZip = new AdmZip();
    if (await fsPoly.exists(outputZipPath)) {
      if (!this.options.getOverwrite()) {
        await this.progressBar.logDebug(`${outputZipPath}: file exists, not overwriting`);
        return null;
      }
      outputZip = new AdmZip(outputZipPath);
    }

    // Clean the zip file of any existing entries
    outputZip.getEntries()
      .forEach((entry) => outputZip.deleteFile(entry));

    return outputZip;
  }

  /**
   * @return If a file was newly written to the zip
   */
  private async addZipEntry(
    outputZipPath: string,
    outputZip: AdmZip,
    inputRomFile: ROMFile,
    outputRomFile: ROMFile,
  ): Promise<boolean> {
    // The input and output are the same, do nothing
    if (outputRomFile.equals(inputRomFile)) {
      await this.progressBar.logDebug(`${outputRomFile}: same file, skipping`);
      return false;
    }

    // If the file in the output zip already exists and has the same CRC then do nothing
    const existingOutputEntry = outputZip.getEntry(outputRomFile.getArchiveEntryPath() as string);
    if (existingOutputEntry?.header.crc === parseInt(outputRomFile.getCrc32(), 16)) {
      await this.progressBar.logDebug(`${outputZipPath}: ${outputRomFile.getArchiveEntryPath()} already exists`);
      return false;
    }

    // Write the entry
    let inputRomFileLocal;
    try {
      inputRomFileLocal = await inputRomFile.toLocalFile(this.options.getTempDir());
    } catch (e) {
      await this.progressBar.logError(`Failed to extract ${inputRomFile.getFilePath()} : ${e}`);
      return false;
    }
    try {
      await this.progressBar.logDebug(`${outputZipPath}: adding ${inputRomFileLocal.getFilePath()}`);
      outputZip.addLocalFile(
        inputRomFileLocal.getFilePath(),
        '',
        outputRomFile.getArchiveEntryPath() as string,
      );
    } catch (e) {
      await this.progressBar.logError(`Failed to add ${inputRomFileLocal.getFilePath()} to zip ${outputZipPath} : ${e}`);
      return false;
    } finally {
      inputRomFileLocal.cleanupLocalFile();
    }

    return true;
  }

  private async writeZipFile(outputZipPath: string, outputZip: AdmZip): Promise<void> {
    try {
      await this.progressBar.logDebug(`${outputZipPath}: writing zip`);
      await outputZip.writeZipPromise(outputZipPath);
    } catch (e) {
      await this.progressBar.logError(`Failed to write zip ${outputZipPath} : ${e}`);
    }
  }

  private async testWrittenZip(outputZipPath: string): Promise<void> {
    if (!this.options.shouldTest()) {
      return;
    }

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

  private async deleteMovedZipEntries(
    outputZipPath: string,
    inputRomFiles: ROMFile[],
  ): Promise<void> {
    if (!this.options.shouldMove()) {
      return;
    }

    const filesToDelete = inputRomFiles
      .map((romFile) => romFile.getFilePath())
      .filter((filePath) => filePath !== outputZipPath)
      .filter((romFile, idx, romFiles) => romFiles.indexOf(romFile) === idx);
    await this.progressBar.logDebug(filesToDelete.map((f) => `${f}: deleting`).join('\n'));
    await Promise.all(filesToDelete.map((filePath) => fsPoly.rm(filePath, { force: true })));
  }

  /** ********************
   *                     *
   *     Raw Writing     *
   *                     *
   ********************* */

  private async writeRaw(inputToOutput: Map<ROMFile, ROMFile>): Promise<ROMFile[]> {
    const writtenRomFiles: ROMFile[] = [];

    /* eslint-disable no-await-in-loop */
    const inputToOutputEntries = [...inputToOutput.entries()]
      .filter((output) => !output[1].isZip());
    for (let i = 0; i < inputToOutputEntries.length; i += 1) {
      const inputRomFile = inputToOutputEntries[i][0];
      const outputRomFile = inputToOutputEntries[i][1];
      await this.writeRawSingle(inputRomFile, outputRomFile);
      writtenRomFiles.push(outputRomFile);
    }

    return writtenRomFiles;
  }

  private async writeRawSingle(inputRomFile: ROMFile, outputRomFile: ROMFile): Promise<boolean> {
    if (outputRomFile.equals(inputRomFile)) {
      await this.progressBar.logDebug(`${outputRomFile}: same file, skipping`);
      return false;
    }

    const outputFilePath = outputRomFile.getFilePath();

    // If the output file already exists, do nothing
    const overwrite = this.options.getOverwrite();
    if (!overwrite) {
      if (await fsPoly.exists(outputFilePath)) {
        await this.progressBar.logDebug(`${outputFilePath}: file exists, not overwriting`);
        return false;
      }
    }

    await this.ensureOutputDirExists(outputFilePath);
    await this.writeRawFile(inputRomFile, outputFilePath);
    await this.testWrittenRaw(outputFilePath, inputRomFile.getCrc32());
    await this.deleteMovedFile(inputRomFile);
    return true;
  }

  private async writeRawFile(inputRomFile: ROMFile, outputFilePath: string): Promise<void> {
    const inputRomFileLocal = await inputRomFile.toLocalFile(this.options.getTempDir());
    await this.progressBar.logDebug(`${inputRomFileLocal.getFilePath()}: copying to ${outputFilePath}`);
    try {
      await fsPromises.copyFile(inputRomFileLocal.getFilePath(), outputFilePath);
    } catch (e) {
      await this.progressBar.logError(`Failed to copy ${inputRomFileLocal.getFilePath()} to ${outputFilePath} : ${e}`);
    } finally {
      inputRomFileLocal.cleanupLocalFile();
    }
  }

  private async testWrittenRaw(outputFilePath: string, expectedCrc32: string): Promise<void> {
    if (!this.options.shouldTest()) {
      return;
    }

    await this.progressBar.logDebug(`${outputFilePath}: testing`);
    const romFileToTest = new ROMFile(outputFilePath);
    if (romFileToTest.getCrc32() !== expectedCrc32) {
      await this.progressBar.logError(`Written file has the CRC ${romFileToTest.getCrc32()}, expected ${expectedCrc32}: ${outputFilePath}`);
    }
  }

  private async deleteMovedFile(inputRomFile: ROMFile): Promise<void> {
    if (!this.options.shouldMove()) {
      return;
    }

    await this.progressBar.logDebug(`${inputRomFile.getFilePath()}: deleting`);
    await fsPoly.rm(inputRomFile.getFilePath(), { force: true });
  }
}
