import AdmZip from 'adm-zip';
import async, { AsyncResultCallback } from 'async';
import { promises as fsPromises } from 'fs';
import path from 'path';

import ProgressBar, { Symbols } from '../console/progressBar.js';
import Constants from '../constants.js';
import fsPoly from '../polyfill/fsPoly.js';
import Zip from '../types/archives/zip.js';
import ArchiveEntry from '../types/files/archiveEntry.js';
import File from '../types/files/file.js';
import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
import ROM from '../types/logiqx/rom.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';

/**
 * Copy or move output ROM files, if applicable.
 *
 * This class may be run concurrently with other classes.
 */
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
  ): Promise<Map<Parent, File[]>> {
    await this.progressBar.logInfo(`${dat.getName()}: Writing candidates`);
    const output = new Map<Parent, File[]>();

    if (!parentsToCandidates.size) {
      return output;
    }

    await this.progressBar.setSymbol(Symbols.WRITING);
    await this.progressBar.reset(parentsToCandidates.size);

    const parentsToCandidatesEntries = [...parentsToCandidates.entries()];

    return new Map(await async.mapLimit(
      [...parentsToCandidatesEntries.entries()],
      Constants.ROM_WRITER_THREADS,
      async (
        [, [parent, releaseCandidates]],
        callback: AsyncResultCallback<[Parent, File[]], Error>,
      ) => {
        await this.progressBar.increment();

        const outputRomFiles: File[] = [];

        /* eslint-disable no-await-in-loop */
        for (let j = 0; j < releaseCandidates.length; j += 1) {
          const releaseCandidate = releaseCandidates[j];

          const results = await this.writeReleaseCandidate(dat, releaseCandidate);
          outputRomFiles.push(...results);
        }

        callback(null, [parent, outputRomFiles]);
      },
    ));
  }

  private async writeReleaseCandidate(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
  ): Promise<File[]> {
    if (!this.options.shouldWrite()) {
      await this.progressBar.logDebug(`${dat.getName()} | ${releaseCandidate.getName()}: not writing`);
      return [];
    }

    const inputToOutput = await this.buildInputToOutput(dat, releaseCandidate);

    // Determine if a write is needed based on the output not equaling the input
    const writeNeeded = (await Promise.all(
      [...inputToOutput.entries()]
        .map(async ([inputRomFile, outputRomFile]) => !await inputRomFile.equals(outputRomFile)),
    )).some((notEq) => notEq);
    await this.progressBar.logDebug(`${dat.getName()} | ${releaseCandidate.getName()}: ${writeNeeded ? '' : 'no '}write needed`);

    if (writeNeeded) {
      // Write is needed, return the File that were written
      return [
        ...await this.writeZip(inputToOutput),
        ...await this.writeRaw(inputToOutput),
      ];
    }

    // Write isn't needed, return the File[] that didn't need writing
    return [...inputToOutput.values()];
  }

  private buildInputToOutput(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
  ): Promise<Map<File, File>> {
    const crcToRoms = releaseCandidate.getRomsByCrc32();

    return releaseCandidate.getFiles().reduce(async (accPromise, inputFile) => {
      // TODO(cemmer): use filesize combined with CRC for indexing
      const acc = await accPromise;
      const rom = crcToRoms.get(await inputFile.getCrc32())
               || crcToRoms.get(await inputFile.getCrc32WithoutHeader()) as ROM;

      let outputFile: File;
      if (this.options.shouldZip(rom.getName())) {
        const outputFilePath = this.options.getOutput(dat, inputFile.getFilePath(), `${releaseCandidate.getName()}.zip`);
        const entryPath = rom.getName();
        outputFile = new ArchiveEntry(
          new Zip(outputFilePath),
          entryPath,
          inputFile.getSize(),
          await inputFile.getCrc32(),
        );
      } else {
        const outputFilePath = this.options.getOutput(
          dat,
          inputFile.getFilePath(),
          rom.getName(),
        );
        outputFile = new File(
          outputFilePath,
          inputFile.getSize(),
          await inputFile.getCrc32(),
        );
      }

      acc.set(inputFile, outputFile);
      return acc;
    }, Promise.resolve(new Map<File, File>()));
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

  private async writeZip(inputToOutput: Map<File, File>): Promise<File[]> {
    // There should only be one output file
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
        inputToOutputEntries[i][1] as ArchiveEntry,
      );
    }

    // const zip = new Zip(outputZipPath);
    // zip.

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
    inputRomFile: File,
    outputArchiveEntry: ArchiveEntry,
  ): Promise<boolean> {
    // The input and output are the same, do nothing
    if (await outputArchiveEntry.equals(inputRomFile)) {
      await this.progressBar.logDebug(`${outputArchiveEntry}: same file, skipping`);
      return false;
    }

    // If the file in the output zip already exists and has the same CRC then do nothing
    const existingOutputEntry = outputZip.getEntry(outputArchiveEntry.getEntryPath() as string);
    if (existingOutputEntry) {
      if (existingOutputEntry.header.crc === parseInt(await outputArchiveEntry.getCrc32(), 16)) {
        await this.progressBar.logDebug(`${outputZipPath}: ${outputArchiveEntry.getEntryPath()} already exists`);
        return false;
      }
    }

    // Write the entry
    try {
      await inputRomFile.extractToFile(async (localFile) => {
        await this.progressBar.logDebug(`${outputZipPath}: adding ${localFile}`);
        outputZip.addLocalFile(
          localFile,
          '',
          outputArchiveEntry.getEntryPath() as string,
        );
      });
      return true;
    } catch (e) {
      await this.progressBar.logError(`Failed to add ${inputRomFile.toString()} to zip ${outputZipPath} : ${e}`);
      return false;
    }
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
    inputRomFiles: File[],
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

  private async writeRaw(inputToOutput: Map<File, File>): Promise<File[]> {
    const writtenRomFiles: File[] = [];

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

  private async writeRawSingle(inputRomFile: File, outputRomFile: File): Promise<boolean> {
    // Input and output are the exact same, do nothing
    if (await outputRomFile.equals(inputRomFile)) {
      await this.progressBar.logDebug(`${outputRomFile}: same file, skipping`);
      return false;
    }

    const outputFilePath = outputRomFile.getFilePath();

    // If the output file already exists and we're not overwriting, do nothing
    const overwrite = this.options.getOverwrite();
    if (!overwrite) {
      if (await fsPoly.exists(outputFilePath)) {
        await this.progressBar.logDebug(`${outputFilePath}: file exists, not overwriting`);
        return false;
      }
    }

    await this.ensureOutputDirExists(outputFilePath);
    if (!await this.writeRawFile(inputRomFile, outputFilePath)) {
      return false;
    }
    await this.testWrittenRaw(outputFilePath, await inputRomFile.getCrc32());
    await this.deleteMovedFile(inputRomFile);
    return true;
  }

  private async writeRawFile(inputRomFile: File, outputFilePath: string): Promise<boolean> {
    try {
      await inputRomFile.extractToFile(async (localFile) => {
        await this.progressBar.logDebug(`${localFile}: copying to ${outputFilePath}`);
        await fsPromises.copyFile(localFile, outputFilePath);
      });
      return true;
    } catch (e) {
      await this.progressBar.logError(`Failed to copy ${inputRomFile.toString()} to ${outputFilePath} : ${e}`);
      return false;
    }
  }

  private async testWrittenRaw(outputFilePath: string, expectedCrc32: string): Promise<void> {
    if (!this.options.shouldTest()) {
      return;
    }

    await this.progressBar.logDebug(`${outputFilePath}: testing`);
    const fileToTest = new File(outputFilePath);
    if (await fileToTest.getCrc32() !== expectedCrc32) {
      await this.progressBar.logError(`Written file has the CRC ${await fileToTest.getCrc32()}, expected ${expectedCrc32}: ${outputFilePath}`);
    }
  }

  private async deleteMovedFile(inputRomFile: File): Promise<void> {
    if (!this.options.shouldMove()) {
      return;
    }

    await this.progressBar.logDebug(`${inputRomFile.getFilePath()}: deleting`);
    await fsPoly.rm(inputRomFile.getFilePath(), { force: true });
  }
}
