import async, { AsyncResultCallback } from 'async';
import { Semaphore } from 'async-mutex';
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
  private static readonly semaphore = new Semaphore(Constants.ROM_WRITER_THREADS);

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

    // Return early if we shouldn't write (are only reporting)
    if (!this.options.shouldWrite()) {
      return new Map(
        [...parentsToCandidates.entries()]
          .map(([parent]) => [parent, []]),
      );
    }

    await this.progressBar.setSymbol(Symbols.WRITING);
    await this.progressBar.reset(parentsToCandidates.size);

    const parentsToCandidatesEntries = [...parentsToCandidates.entries()];

    return new Map(await async.map(
      [...parentsToCandidatesEntries.entries()],
      async (
        [, [parent, releaseCandidates]],
        callback: AsyncResultCallback<[Parent, File[]], Error>,
      ) => {
        await ROMWriter.semaphore.runExclusive(async () => {
          await this.progressBar.increment();

          const outputRomFiles: File[] = [];

          /* eslint-disable no-await-in-loop */
          for (let j = 0; j < releaseCandidates.length; j += 1) {
            const releaseCandidate = releaseCandidates[j];

            const results = await this.writeReleaseCandidate(dat, releaseCandidate);
            outputRomFiles.push(...results);
          }

          callback(null, [parent, outputRomFiles]);
        });
      },
    ));
  }

  private async writeReleaseCandidate(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
  ): Promise<File[]> {
    const inputToOutput = await this.buildInputToOutput(dat, releaseCandidate);

    // Determine if a write is needed based on the output not equaling the input
    const writeNeeded = ([...inputToOutput.entries()]
      .map(([inputRomFile, outputRomFile]) => !inputRomFile.equals(outputRomFile))
    ).some((notEq) => notEq);
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

  private async buildInputToOutput(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
  ): Promise<Map<File, File>> {
    const hashCodeToRoms = releaseCandidate.indexRomsByHashCode();

    return releaseCandidate.getFiles().reduce(async (accPromise, inputFile) => {
      const acc = await accPromise;

      // Find the release candidate's File, find the matching ROM
      const rom = inputFile.hashCodes()
        .map((hashCode) => hashCodeToRoms.get(hashCode))
        .filter((r) => r)[0] as ROM;

      let outputFile: File;
      if (this.options.shouldZip(rom.getName())) {
        const outputFilePath = this.options.getOutput(dat, inputFile.getFilePath(), `${releaseCandidate.getName()}.zip`);
        const entryPath = rom.getName();
        outputFile = await ArchiveEntry.entryOf(
          new Zip(outputFilePath),
          entryPath,
          inputFile.getSize(),
          inputFile.getCrc32(),
        );
      } else {
        const outputFilePath = this.options.getOutput(
          dat,
          inputFile.getFilePath(),
          rom.getName(),
        );
        outputFile = await File.fileOf(
          outputFilePath,
          inputFile.getSize(),
          inputFile.getCrc32(),
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

  private async writeZip(inputToOutputFiles: Map<File, File>): Promise<File[]> {
    // Return no files if there are none to write
    const inputToOutputZipEntries = new Map<File, ArchiveEntry<Zip>>(
      [...inputToOutputFiles.entries()]
        .filter(([, output]) => output instanceof ArchiveEntry<Zip>)
        .map(([input, output]) => [input, output as ArchiveEntry<Zip>]),
    );
    if (!inputToOutputZipEntries.size) {
      return [];
    }

    // Prep the single output file
    const outputZip = [...inputToOutputZipEntries.values()][0].getArchive();

    if (await fsPoly.exists(outputZip.getFilePath())) {
      // If the output file already exists and we're not overwriting, do nothing
      if (!this.options.getOverwrite()) {
        await this.progressBar.logDebug(`${outputZip.getFilePath()}: file exists, not overwriting`);
        return [await File.fileOf((outputZip.getFilePath()))];
      }

      // If the zip is already what we're expecting, do nothing
      // TODO(cemmer): change this to a condition around the write, let it still delete moved files
      if (await ROMWriter.testZipContents(outputZip, inputToOutputZipEntries)) {
        await this.progressBar.logDebug(`${outputZip.getFilePath()}: same file, skipping`);
        return [await File.fileOf((outputZip.getFilePath()))];
      }
    }

    await this.writeZipFile(outputZip, inputToOutputZipEntries);

    if (this.options.shouldTest()) {
      if (!await ROMWriter.testZipContents(outputZip, inputToOutputZipEntries)) {
        await this.progressBar.logError(`Written zip is invalid: ${outputZip.getFilePath()}`);
        return [await File.fileOf((outputZip.getFilePath()))];
      }
    }

    await this.deleteMovedZipEntries(outputZip, [...inputToOutputFiles.keys()]);

    // Return the single archive written
    return [await File.fileOf(outputZip.getFilePath())];
  }

  private static async testZipContents(
    outputZipArchive: Zip,
    inputToOutputZipEntries: Map<File, ArchiveEntry<Zip>>,
  ): Promise<boolean> {
    const expectedEntriesByPath = [...inputToOutputZipEntries.entries()]
      .reduce((map, [, entry]) => {
        map.set(entry.getEntryPath(), entry);
        return map;
      }, new Map<string, ArchiveEntry<Zip>>());

    const actualEntriesByPath = (await outputZipArchive.getArchiveEntries())
      .reduce((map, entry) => {
        map.set(entry.getEntryPath(), entry);
        return map;
      }, new Map<string, ArchiveEntry<Zip>>());

    if (actualEntriesByPath.size !== expectedEntriesByPath.size) {
      return false;
    }

    const entryPaths = [...expectedEntriesByPath.keys()];
    for (let i = 0; i < entryPaths.length; i += 1) {
      const entryPath = entryPaths[i];
      const expected = expectedEntriesByPath.get(entryPath) as ArchiveEntry<Zip>;

      // Check existence
      if (!actualEntriesByPath.has(entryPath)) {
        return false;
      }
      const actual = actualEntriesByPath.get(entryPath) as ArchiveEntry<Zip>;

      // Check checksum
      if (!actual.equals(expected)) {
        return false;
      }
    }

    return true;
  }

  private async writeZipFile(
    outputZip: Zip,
    inputToOutputZipEntries: Map<File, ArchiveEntry<Zip>>,
  ): Promise<void> {
    // If the zip is already what we're expecting, do nothing
    if (await fsPoly.exists(outputZip.getFilePath())
      && await ROMWriter.testZipContents(outputZip, inputToOutputZipEntries)
    ) {
      await this.progressBar.logDebug(`${outputZip.getFilePath()}: archive already matches expected entries, skipping`);
      return;
    }

    try {
      await this.ensureOutputDirExists(outputZip.getFilePath());
      await outputZip.archiveEntries(inputToOutputZipEntries);
    } catch (e) {
      await this.progressBar.logError(`Failed to create zip ${outputZip.getFilePath()} : ${e}`);
    }
  }

  private async deleteMovedZipEntries(
    outputZipArchive: Zip,
    inputRomFiles: File[],
  ): Promise<void> {
    if (!this.options.shouldMove()) {
      return;
    }

    const filesToDelete = inputRomFiles
      .map((romFile) => romFile.getFilePath())
      .filter((filePath) => filePath !== outputZipArchive.getFilePath())
      .filter((romFile, idx, romFiles) => romFiles.indexOf(romFile) === idx);
    await this.progressBar.logDebug(filesToDelete.map((f) => `${f}: deleting`).join('\n'));
    await Promise.all(filesToDelete.map(async (filePath) => fsPoly.rm(filePath, { force: true })));
  }

  /** ********************
   *                     *
   *     Raw Writing     *
   *                     *
   ********************* */

  private async writeRaw(inputToOutput: Map<File, File>): Promise<File[]> {
    // Return no files if there are none to write
    const inputToOutputEntries = [...inputToOutput.entries()]
      .filter(([, output]) => !(output instanceof ArchiveEntry<Zip>));
    if (!inputToOutputEntries.length) {
      return [];
    }

    const writtenRomFiles: File[] = [];

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < inputToOutputEntries.length; i += 1) {
      const [inputRomFile, outputRomFile] = inputToOutputEntries[i];
      await this.writeRawSingle(inputRomFile, outputRomFile);
      writtenRomFiles.push(outputRomFile);
    }

    // Return all files written
    return writtenRomFiles;
  }

  private async writeRawSingle(inputRomFile: File, outputRomFile: File): Promise<void> {
    // Input and output are the exact same, do nothing
    if (outputRomFile.equals(inputRomFile)) {
      await this.progressBar.logDebug(`${outputRomFile}: same file, skipping`);
      return;
    }

    const outputFilePath = outputRomFile.getFilePath();

    // If the output file already exists and we're not overwriting, do nothing
    const overwrite = this.options.getOverwrite();
    if (!overwrite) {
      if (await fsPoly.exists(outputFilePath)) {
        await this.progressBar.logDebug(`${outputFilePath}: file exists, not overwriting`);
        return;
      }
    }

    await this.ensureOutputDirExists(outputFilePath);
    if (!await this.writeRawFile(inputRomFile, outputFilePath)) {
      return;
    }
    await this.testWrittenRaw(outputFilePath, inputRomFile.getCrc32());
    await this.deleteMovedFile(inputRomFile);
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
    const fileToTest = await File.fileOf(outputFilePath);
    if (fileToTest.getCrc32() !== expectedCrc32) {
      await this.progressBar.logError(`Written file has the CRC ${fileToTest.getCrc32()}, expected ${expectedCrc32}: ${outputFilePath}`);
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
