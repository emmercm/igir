import { Semaphore } from 'async-mutex';
import fs, { promises as fsPromises } from 'fs';
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
import Module from './module.js';

/**
 * Copy or move output ROM files, if applicable.
 *
 * This class may be run concurrently with other classes.
 */
export default class ROMWriter extends Module {
  private static readonly semaphore = new Semaphore(Constants.ROM_WRITER_THREADS);

  private readonly options: Options;

  private readonly filesQueuedForDeletion: File[] = [];

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, ROMWriter.name);
    this.options = options;
  }

  async write(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<void> {
    if (!parentsToCandidates.size) {
      return;
    }

    // Return early if we shouldn't write (are only reporting)
    if (!this.options.shouldWrite()) {
      return;
    }

    await this.progressBar.logInfo(`${dat.getName()}: Writing candidates`);
    await this.progressBar.setSymbol(Symbols.WRITING);
    await this.progressBar.reset(parentsToCandidates.size);

    await Promise.all([...parentsToCandidates.values()]
      .map(async (releaseCandidates) => ROMWriter.semaphore.runExclusive(async () => {
        /* eslint-disable no-await-in-loop */
        for (let j = 0; j < releaseCandidates.length; j += 1) {
          const releaseCandidate = releaseCandidates[j];
          await this.writeReleaseCandidate(dat, releaseCandidate);
        }

        await this.progressBar.increment();
      })));

    await this.progressBar.logDebug(`${dat.getName()}: Deleting moved files`);
    await this.progressBar.setSymbol(Symbols.WRITING);
    await this.deleteMovedFiles(dat);

    await this.progressBar.logInfo(`${dat.getName()}: Done writing candidates`);
  }

  private async writeReleaseCandidate(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
  ): Promise<void> {
    const writeNeeded = releaseCandidate.getRomsWithFiles()
      .filter((romWithFiles) => !romWithFiles.getOutputFile().equals(romWithFiles.getInputFile()))
      .some((notEq) => notEq);
    await this.progressBar.logTrace(`${dat.getName()}: ${releaseCandidate.getName()}: ${writeNeeded ? '' : 'no '}write needed`);

    if (writeNeeded) {
      const messageTimeout = this.progressBar.setWaitingMessage(`${releaseCandidate.getName()} ...`);

      await this.writeZip(dat, releaseCandidate);
      await this.writeRaw(dat, releaseCandidate);

      clearTimeout(messageTimeout);
    }
  }

  private static async ensureOutputDirExists(outputFilePath: string): Promise<void> {
    const outputDir = path.dirname(outputFilePath);
    if (!await fsPoly.exists(outputDir)) {
      await fsPromises.mkdir(outputDir, { recursive: true });
    }
  }

  /** ********************
   *                     *
   *     Zip Writing     *
   *                     *
   ********************* */

  private async writeZip(dat: DAT, releaseCandidate: ReleaseCandidate): Promise<void> {
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

    // If the output file already exists and we're not overwriting, do nothing
    if (!this.options.getOverwrite() && await fsPoly.exists(outputZip.getFilePath())) {
      await this.progressBar.logTrace(`${dat.getName()}: ${outputZip.getFilePath()}: file exists, not overwriting`);
      return;
    }

    if (!await this.writeZipFile(dat, outputZip, inputToOutputZipEntries)) {
      return;
    }

    if (this.options.shouldTest()) {
      await this.progressBar.logTrace(`${dat.getName()}: ${outputZip.getFilePath()}: testing`);
      if (!await ROMWriter.testZipContents(outputZip, [...inputToOutputZipEntries.values()])) {
        await this.progressBar.logError(`${dat.getName()}: ${outputZip.getFilePath()}: written zip is invalid`);
        return;
      }
    }

    [...inputToOutputZipEntries.keys()]
      .forEach((inputRomFile) => this.enqueueFileDeletion(inputRomFile));
  }

  private static async testZipContents(
    outputZipArchive: Zip,
    expectedArchiveEntries: ArchiveEntry<Zip>[],
  ): Promise<boolean> {
    const expectedEntriesByPath = expectedArchiveEntries
      .reduce((map, entry) => {
        map.set(entry.getEntryPath(), entry);
        return map;
      }, new Map<string, ArchiveEntry<Zip>>());

    let archiveEntries: ArchiveEntry<Zip>[];
    try {
      archiveEntries = await outputZipArchive.getArchiveEntries();
    } catch (e) {
      return false;
    }

    const actualEntriesByPath = archiveEntries
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
    dat: DAT,
    outputZip: Zip,
    inputToOutputZipEntries: Map<File, ArchiveEntry<Zip>>,
  ): Promise<boolean> {
    // If the zip is already what we're expecting, do nothing
    if (await fsPoly.exists(outputZip.getFilePath())
      && await ROMWriter.testZipContents(outputZip, [...inputToOutputZipEntries.values()])
    ) {
      await this.progressBar.logTrace(`${dat.getName()}: ${outputZip.getFilePath()}: archive already matches expected entries, skipping`);
      return true;
    }

    try {
      await ROMWriter.ensureOutputDirExists(outputZip.getFilePath());
      await outputZip.archiveEntries(this.options, dat, inputToOutputZipEntries);
      return true;
    } catch (e) {
      await this.progressBar.logError(`${dat.getName()}: ${outputZip.getFilePath()}: failed to create zip : ${e}`);
      return false;
    }
  }

  /** ********************
   *                     *
   *     Raw Writing     *
   *                     *
   ********************* */

  private async writeRaw(dat: DAT, releaseCandidate: ReleaseCandidate): Promise<void> {
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
      await this.writeRawSingle(dat, inputRomFile, outputRomFile);
    }
  }

  private async writeRawSingle(dat: DAT, inputRomFile: File, outputRomFile: File): Promise<void> {
    // Input and output are the exact same, do nothing
    if (outputRomFile.equals(inputRomFile)) {
      await this.progressBar.logTrace(`${dat.getName()}: ${outputRomFile}: same file, skipping`);
      return;
    }

    const outputFilePath = outputRomFile.getFilePath();

    // If the output file already exists and we're not overwriting, do nothing
    if (!this.options.getOverwrite() && await fsPoly.exists(outputFilePath)) {
      await this.progressBar.logTrace(`${dat.getName()}: ${outputFilePath}: file exists, not overwriting`);
      return;
    }

    if (!await this.writeRawFile(dat, inputRomFile, outputFilePath)) {
      return;
    }
    await this.testWrittenRaw(dat, outputFilePath, inputRomFile.getCrc32());
    this.enqueueFileDeletion(inputRomFile);
  }

  private async writeRawFile(
    dat: DAT,
    inputRomFile: File,
    outputFilePath: string,
  ): Promise<boolean> {
    try {
      // TODO(cemmer): support raw->raw file moving without streams
      await inputRomFile.extractToStream(async (readStream) => {
        await this.progressBar.logTrace(`${dat.getName()}: ${inputRomFile.toString()}: piping to ${outputFilePath}`);
        await ROMWriter.ensureOutputDirExists(outputFilePath);
        const writeStream = readStream.pipe(fs.createWriteStream(outputFilePath));
        await new Promise<void>((resolve, reject) => {
          writeStream.on('finish', () => resolve());
          writeStream.on('error', (err) => reject(err));
        });
      }, this.options.canRemoveHeader(dat, path.extname(inputRomFile.getExtractedFilePath())));
      return true;
    } catch (e) {
      await this.progressBar.logError(`${dat.getName()}: ${inputRomFile.toString()}: failed to copy to ${outputFilePath} : ${e}`);
      return false;
    }
  }

  private async testWrittenRaw(
    dat: DAT,
    outputFilePath: string,
    expectedCrc32: string,
  ): Promise<void> {
    if (!this.options.shouldTest()) {
      return;
    }

    await this.progressBar.logTrace(`${outputFilePath}: testing`);
    const fileToTest = await File.fileOf(outputFilePath);
    if (fileToTest.getCrc32() !== expectedCrc32) {
      await this.progressBar.logError(`${dat.getName()}: ${outputFilePath}: written file has the CRC ${fileToTest.getCrc32()}, expected ${expectedCrc32}`);
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

  private async deleteMovedFiles(dat: DAT): Promise<void[]> {
    return Promise.all(
      this.filesQueuedForDeletion
        .map((file) => file.getFilePath())
        .filter((filePath, idx, filePaths) => filePaths.indexOf(filePath) === idx)
        .map(async (filePath) => {
          await this.progressBar.logTrace(`${dat.getName()}: ${filePath}: deleting`);
          try {
            await fsPoly.rm(filePath, { force: true });
          } catch (e) {
            await this.progressBar.logError(`${dat.getName()}: ${filePath}: failed to delete`);
          }
        }),
    );
  }
}
