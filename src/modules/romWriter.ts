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

  private readonly filesQueuedForDeletion: File[] = [];

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async write(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<void> {
    await this.progressBar.logInfo(`${dat.getName()}: Writing candidates`);

    if (!parentsToCandidates.size) {
      return;
    }

    // Return early if we shouldn't write (are only reporting)
    if (!this.options.shouldWrite()) {
      return;
    }

    await this.progressBar.setSymbol(Symbols.WRITING);
    await this.progressBar.reset(parentsToCandidates.size);

    await async.each(
      [...parentsToCandidates.entries()],
      async (
        [, releaseCandidates],
        callback: AsyncResultCallback<undefined, Error>,
      ) => {
        await ROMWriter.semaphore.runExclusive(async () => {
          await this.progressBar.increment();

          /* eslint-disable no-await-in-loop */
          for (let j = 0; j < releaseCandidates.length; j += 1) {
            const releaseCandidate = releaseCandidates[j];
            await this.writeReleaseCandidate(dat, releaseCandidate);
          }

          callback();
        });
      },
    );

    await this.progressBar.setSymbol(Symbols.WRITING);
    await this.deleteMovedFiles();
  }

  private async writeReleaseCandidate(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
  ): Promise<void> {
    const writeNeeded = releaseCandidate.getRomsWithFiles()
      .filter((romWithFiles) => !romWithFiles.getOutputFile().equals(romWithFiles.getInputFile()))
      .some((notEq) => notEq);
    await this.progressBar.logDebug(`${dat.getName()} | ${releaseCandidate.getName()}: ${writeNeeded ? '' : 'no '}write needed`);

    if (writeNeeded) {
      // Write is needed, return the File that were written
      await this.writeZip(releaseCandidate);
      await this.writeRaw(releaseCandidate);
    }
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

  private async writeZip(releaseCandidate: ReleaseCandidate): Promise<void> {
    // Return no files if there are none to write
    const inputToOutputZipEntries = new Map<File, ArchiveEntry<Zip>>(
      releaseCandidate.getRomsWithFiles()
        .filter((romWithFiles) => romWithFiles.getOutputFile() instanceof ArchiveEntry<Zip>)
        .map((romWithFiles) => [
          romWithFiles.getInputFile(),
          romWithFiles.getOutputFile() as ArchiveEntry<Zip>,
        ]),
    );
    if (!inputToOutputZipEntries.size) {
      return;
    }

    // Prep the single output file
    const outputZip = [...inputToOutputZipEntries.values()][0].getArchive();

    if (await fsPoly.exists(outputZip.getFilePath())) {
      // If the output file already exists and we're not overwriting, do nothing
      if (!this.options.getOverwrite()) {
        await this.progressBar.logDebug(`${outputZip.getFilePath()}: file exists, not overwriting`);
        return;
      }

      // If the zip is already what we're expecting, do nothing
      // TODO(cemmer): change this to a condition around the write, let it still delete moved files
      if (await ROMWriter.testZipContents(outputZip, inputToOutputZipEntries)) {
        await this.progressBar.logDebug(`${outputZip.getFilePath()}: same file, skipping`);
        return;
      }
    }

    if (!await this.writeZipFile(outputZip, inputToOutputZipEntries)) {
      return;
    }

    if (this.options.shouldTest()) {
      await this.progressBar.logDebug(`${outputZip.getFilePath()}: testing`);
      if (!await ROMWriter.testZipContents(outputZip, inputToOutputZipEntries)) {
        await this.progressBar.logError(`Written zip is invalid: ${outputZip.getFilePath()}`);
        return;
      }
    }

    await this.deleteMovedZipEntries(
      outputZip,
      releaseCandidate.getRomsWithFiles().map((romWithFiles) => romWithFiles.getInputFile()),
    );
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
  ): Promise<boolean> {
    // If the zip is already what we're expecting, do nothing
    if (await fsPoly.exists(outputZip.getFilePath())
      && await ROMWriter.testZipContents(outputZip, inputToOutputZipEntries)
    ) {
      await this.progressBar.logDebug(`${outputZip.getFilePath()}: archive already matches expected entries, skipping`);
      return true;
    }

    try {
      await this.ensureOutputDirExists(outputZip.getFilePath());
      await outputZip.archiveEntries(inputToOutputZipEntries);
      return true;
    } catch (e) {
      await this.progressBar.logError(`Failed to create zip ${outputZip.getFilePath()} : ${e}`);
      return false;
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

  private async writeRaw(releaseCandidate: ReleaseCandidate): Promise<void> {
    // Return no files if there are none to write
    const inputToOutputEntries = releaseCandidate.getRomsWithFiles()
      .filter((romWithFiles) => !(romWithFiles.getOutputFile() instanceof ArchiveEntry<Zip>))
      .map((romWithFiles) => [romWithFiles.getInputFile(), romWithFiles.getOutputFile()]);
    if (!inputToOutputEntries.length) {
      return;
    }

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < inputToOutputEntries.length; i += 1) {
      const [inputRomFile, outputRomFile] = inputToOutputEntries[i];
      await this.writeRawSingle(inputRomFile, outputRomFile);
    }
  }

  private async writeRawSingle(inputRomFile: File, outputRomFile: File): Promise<void> {
    // Input and output are the exact same, do nothing
    if (outputRomFile.equals(inputRomFile)) {
      await this.progressBar.logDebug(`${outputRomFile}: same file, skipping`);
      return;
    }

    const outputFilePath = outputRomFile.getFilePath();

    // If the output file already exists and we're not overwriting, do nothing
    if (!this.options.getOverwrite()) {
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
    this.enqueueFileDeletion(inputRomFile);
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

  // Input files may be needed for multiple output files, such as an archive with hundreds of ROMs
  //  in it. That means we need to "move" (delete) files at the very end.
  private enqueueFileDeletion(inputRomFile: File): void {
    if (!this.options.shouldMove()) {
      return;
    }
    this.filesQueuedForDeletion.push(inputRomFile);
  }

  private async deleteMovedFiles(): Promise<void[]> {
    return Promise.all(
      this.filesQueuedForDeletion
        .map((file) => file.getFilePath())
        .filter((filePath, idx, filePaths) => filePaths.indexOf(filePath) === idx)
        .map(async (filePath) => {
          await this.progressBar.logDebug(`${filePath}: deleting`);
          try {
            await fsPoly.rm(filePath, { force: true });
          } catch (e) {
            await this.progressBar.logDebug(`${filePath}: failed to delete`);
          }
        }),
    );
  }
}
