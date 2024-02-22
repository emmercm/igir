import path from 'node:path';

import { Semaphore } from 'async-mutex';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Constants from '../constants.js';
import ElasticSemaphore from '../elasticSemaphore.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import fsPoly from '../polyfill/fsPoly.js';
import DAT from '../types/dats/dat.js';
import Parent from '../types/dats/parent.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import Zip from '../types/files/archives/zip.js';
import File from '../types/files/file.js';
import { ChecksumBitmask } from '../types/files/fileChecksums.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import Module from './module.js';

/**
 * Copy or move output ROM files, if applicable.
 *
 * This class may be run concurrently with other classes.
 */
export default class CandidateWriter extends Module {
  private static readonly THREAD_SEMAPHORE = new Semaphore(Number.MAX_SAFE_INTEGER);

  // WARN(cemmer): there is an undocumented semaphore max value that can be used, the full
  //  4,700,372,992 bytes of a DVD+R will cause runExclusive() to never run or return.
  private static readonly FILESIZE_SEMAPHORE = new ElasticSemaphore(
    Constants.MAX_READ_WRITE_CONCURRENT_KILOBYTES,
  );

  private readonly options: Options;

  private readonly filesQueuedForDeletion: File[] = [];

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, CandidateWriter.name);
    this.options = options;

    // This will be the same value globally, but we can't know the value at file import time
    if (options.getWriterThreads() < CandidateWriter.THREAD_SEMAPHORE.getValue()) {
      CandidateWriter.THREAD_SEMAPHORE.setValue(options.getWriterThreads());
    }
  }

  /**
   * Write & test candidates.
   */
  async write(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<File[]> {
    if (parentsToCandidates.size === 0) {
      return [];
    }

    // Return early if we shouldn't write (are only reporting)
    if (!this.options.shouldWrite()) {
      return [];
    }

    // Filter to only the parents that actually have candidates (and therefore output)
    const parentsToWritableCandidates = new Map(
      [...parentsToCandidates.entries()]
        // The parent has candidates
        .filter(([, releaseCandidates]) => releaseCandidates.length)
        // At least some candidates have files
        .filter(([, releaseCandidates]) => releaseCandidates
          .some((releaseCandidate) => releaseCandidate.getRomsWithFiles().length)),
    );

    const totalCandidateCount = [...parentsToWritableCandidates.values()].flat().length;
    this.progressBar.logTrace(`${dat.getNameShort()}: writing ${totalCandidateCount.toLocaleString()} candidate${totalCandidateCount !== 1 ? 's' : ''}`);
    await this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
    await this.progressBar.reset(parentsToWritableCandidates.size);

    await Promise.all([...parentsToWritableCandidates.entries()].map(
      async ([
        parent,
        releaseCandidates,
      ]) => CandidateWriter.THREAD_SEMAPHORE.runExclusive(async () => {
        await this.progressBar.incrementProgress();
        this.progressBar.logTrace(`${dat.getNameShort()}: ${parent.getName()}: writing ${releaseCandidates.length.toLocaleString()} candidate${releaseCandidates.length !== 1 ? 's' : ''}`);

        for (const releaseCandidate of releaseCandidates) {
          await this.writeReleaseCandidate(dat, releaseCandidate);
        }

        this.progressBar.logTrace(`${dat.getNameShort()}: ${parent.getName()}: done writing ${releaseCandidates.length.toLocaleString()} candidate${releaseCandidates.length !== 1 ? 's' : ''}`);
        await this.progressBar.incrementDone();
      }),
    ));

    this.progressBar.logTrace(`${dat.getNameShort()}: done writing ${totalCandidateCount.toLocaleString()} candidate${totalCandidateCount !== 1 ? 's' : ''}`);

    return this.filesQueuedForDeletion;
  }

  private async writeReleaseCandidate(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
  ): Promise<void> {
    const writeNeeded = releaseCandidate.getRomsWithFiles()
      .some((romWithFiles) => !romWithFiles.getOutputFile().equals(romWithFiles.getInputFile()));
    if (!writeNeeded) {
      this.progressBar.logDebug(`${dat.getNameShort()}: ${releaseCandidate.getName()}: input and output files are the same, skipping`);
      return;
    }

    const totalKilobytes = releaseCandidate.getRomsWithFiles()
      .reduce((sum, romWithFiles) => sum + romWithFiles.getInputFile().getSize(), 0) / 1024;
    await CandidateWriter.FILESIZE_SEMAPHORE.runExclusive(async () => {
      const waitingMessage = `${releaseCandidate.getName()} ...`;
      this.progressBar.addWaitingMessage(waitingMessage);

      if (this.options.shouldSymlink()) {
        await this.writeSymlink(dat, releaseCandidate);
      } else {
        await this.writeZip(dat, releaseCandidate);
        await this.writeRaw(dat, releaseCandidate);
      }

      this.progressBar.removeWaitingMessage(waitingMessage);
    }, totalKilobytes);
  }

  private static async ensureOutputDirExists(outputFilePath: string): Promise<void> {
    const outputDir = path.dirname(outputFilePath);
    if (!await fsPoly.exists(outputDir)) {
      await fsPoly.mkdir(outputDir, { recursive: true });
    }
  }

  /**
   ***********************
   *
   *     Zip Writing     *
   *
   ***********************
   */

  private async writeZip(dat: DAT, releaseCandidate: ReleaseCandidate): Promise<void> {
    // Return no files if there are none to write
    const inputToOutputZipEntries = releaseCandidate.getRomsWithFiles()
      .filter((romWithFiles) => romWithFiles.getOutputFile() instanceof ArchiveEntry)
      .map((romWithFiles) => [
        romWithFiles.getInputFile(),
        romWithFiles.getOutputFile() as ArchiveEntry<Zip>,
      ]) satisfies [File, ArchiveEntry<Zip>][];
    if (inputToOutputZipEntries.length === 0) {
      this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: no zip archives to write`);
      return;
    }

    // Prep the single output file
    const outputZip = inputToOutputZipEntries[0][1].getArchive();

    // If the output file already exists, see if we need to do anything
    if (await fsPoly.exists(outputZip.getFilePath())) {
      if (!this.options.getOverwrite() && !this.options.getOverwriteInvalid()) {
        this.progressBar.logDebug(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputZip.getFilePath()}: not overwriting existing zip file`);
        return;
      }

      if (this.options.getOverwriteInvalid()) {
        const existingTest = await this.testZipContents(
          dat,
          releaseCandidate,
          outputZip.getFilePath(),
          inputToOutputZipEntries.map((entry) => entry[1]),
        );
        if (!existingTest) {
          this.progressBar.logDebug(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputZip.getFilePath()}: not overwriting existing zip file, existing zip has the expected contents`);
          return;
        }
      }
    }

    if (!await this.writeZipFile(dat, releaseCandidate, outputZip, inputToOutputZipEntries)) {
      // It's expected that an error was already logged
      return;
    }

    if (this.options.shouldTest()) {
      const writtenTest = await this.testZipContents(
        dat,
        releaseCandidate,
        outputZip.getFilePath(),
        inputToOutputZipEntries.map((entry) => entry[1]),
      );
      if (writtenTest) {
        this.progressBar.logError(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputZip.getFilePath()}: written zip ${writtenTest}`);
        return;
      }
    }

    inputToOutputZipEntries.forEach(([inputRomFile]) => this.enqueueFileDeletion(inputRomFile));
  }

  private async testZipContents(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
    zipFilePath: string,
    expectedArchiveEntries: ArchiveEntry<Zip>[],
  ): Promise<string | undefined> {
    this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${zipFilePath}: testing zip`);

    const expectedEntriesByPath = expectedArchiveEntries
      .reduce((map, entry) => {
        map.set(entry.getEntryPath(), entry);
        return map;
      }, new Map<string, ArchiveEntry<Zip>>());

    let archiveEntries: ArchiveEntry<Zip>[];
    try {
      archiveEntries = await new Zip(zipFilePath).getArchiveEntries(ChecksumBitmask.CRC32);
    } catch (error) {
      return `failed to get archive contents: ${error}`;
    }

    const actualEntriesByPath = archiveEntries
      .reduce((map, entry) => {
        map.set(entry.getEntryPath(), entry);
        return map;
      }, new Map<string, ArchiveEntry<Zip>>());

    if (actualEntriesByPath.size !== expectedEntriesByPath.size) {
      return `has ${actualEntriesByPath.size.toLocaleString()} files, expected ${expectedEntriesByPath.size.toLocaleString()}`;
    }

    const entryPaths = [...expectedEntriesByPath.keys()];
    for (const entryPath of entryPaths) {
      const expectedFile = expectedEntriesByPath.get(entryPath) as ArchiveEntry<Zip>;

      // Check existence
      if (!actualEntriesByPath.has(entryPath)) {
        return `is missing the file ${entryPath}`;
      }

      // Check checksum
      if (expectedFile.getCrc32() === '00000000') {
        this.progressBar.logWarn(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${expectedFile.toString()}: can't test, expected CRC is unknown`);
        // eslint-disable-next-line no-continue
        continue;
      }
      const actualFile = actualEntriesByPath.get(entryPath) as ArchiveEntry<Zip>;
      if (actualFile.getCrc32() !== expectedFile.getCrc32()) {
        return `has the file ${entryPath} with the CRC ${actualFile.getCrc32()}, expected ${expectedFile.getCrc32()}`;
      }

      // Check size
      if (!expectedFile.getSize()) {
        this.progressBar.logWarn(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${expectedFile.toString()}: can't test, expected size is unknown`);
        // eslint-disable-next-line no-continue
        continue;
      }
      if (actualFile.getSize() !== expectedFile.getSize()) {
        return `has the file ${entryPath} of size ${actualFile.getSize().toLocaleString()}B, expected ${expectedFile.getSize().toLocaleString()}B`;
      }
    }

    this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${zipFilePath}: test passed`);
    return undefined;
  }

  private async writeZipFile(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
    outputZip: Zip,
    inputToOutputZipEntries: [File, ArchiveEntry<Zip>][],
  ): Promise<boolean> {
    this.progressBar.logInfo(`${dat.getNameShort()}: ${releaseCandidate.getName()}: creating zip archive '${outputZip.getFilePath()}' with the entries:\n${inputToOutputZipEntries.map(([input]) => `  ${input.toString()}`).join('\n')}`);

    try {
      await CandidateWriter.ensureOutputDirExists(outputZip.getFilePath());
      await outputZip.createArchive(this.options, dat, inputToOutputZipEntries);
    } catch (error) {
      this.progressBar.logError(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputZip.getFilePath()}: failed to create zip: ${error}`);
      return false;
    }

    this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputZip.getFilePath()}: wrote ${inputToOutputZipEntries.length.toLocaleString()} archive entr${inputToOutputZipEntries.length !== 1 ? 'ies' : 'y'}`);
    return true;
  }

  /**
   ***********************
   *
   *     Raw Writing     *
   *
   ***********************
   */

  private async writeRaw(dat: DAT, releaseCandidate: ReleaseCandidate): Promise<void> {
    const inputToOutputEntries = releaseCandidate.getRomsWithFiles()
      .filter((romWithFiles) => !(romWithFiles.getOutputFile() instanceof ArchiveEntry))
      .map((romWithFiles) => [romWithFiles.getInputFile(), romWithFiles.getOutputFile()]);

    // Return no files if there are none to write
    if (inputToOutputEntries.length === 0) {
      // TODO(cemmer): unit test
      this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: no raw files to write`);
      return;
    }

    // De-duplicate based on the output file. Raw copying archives will produce the same
    //  input->output for every ROM.
    const uniqueInputToOutputEntries = inputToOutputEntries
      .filter(ArrayPoly.filterUniqueMapped(([, outputRomFile]) => outputRomFile.toString()));

    const totalBytes = uniqueInputToOutputEntries
      .flatMap(([, outputFile]) => outputFile)
      .reduce((sum, file) => sum + file.getSize(), 0);
    this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: writing ${fsPoly.sizeReadable(totalBytes)} of ${uniqueInputToOutputEntries.length.toLocaleString()} file${uniqueInputToOutputEntries.length !== 1 ? 's' : ''}`);

    for (const [inputRomFile, outputRomFile] of uniqueInputToOutputEntries) {
      await this.writeRawSingle(dat, releaseCandidate, inputRomFile, outputRomFile);
    }
  }

  private async writeRawSingle(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
    inputRomFile: File,
    outputRomFile: File,
  ): Promise<void> {
    // Input and output are the exact same, do nothing
    if (outputRomFile.equals(inputRomFile)) {
      this.progressBar.logDebug(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputRomFile}: input and output file is the same, skipping`);
      return;
    }

    const outputFilePath = outputRomFile.getFilePath();

    // If the output file already exists, see if we need to do anything
    if (!this.options.getOverwrite() && await fsPoly.exists(outputFilePath)) {
      if (!this.options.getOverwrite() && !this.options.getOverwriteInvalid()) {
        this.progressBar.logDebug(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputFilePath}: not overwriting existing file`);
        return;
      }

      if (this.options.getOverwriteInvalid()) {
        const existingTest = await this.testWrittenRaw(
          dat,
          releaseCandidate,
          outputFilePath,
          outputRomFile,
        );
        if (!existingTest) {
          this.progressBar.logDebug(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputFilePath}: not overwriting existing file, existing file is what was expected`);
          return;
        }
      }
    }

    if (!await this.writeRawFile(dat, releaseCandidate, inputRomFile, outputFilePath)) {
      // It's expected that an error was already logged
      return;
    }
    if (this.options.shouldTest()) {
      const writtenTest = await this.testWrittenRaw(
        dat,
        releaseCandidate,
        outputFilePath,
        outputRomFile,
      );
      if (writtenTest) {
        this.progressBar.logError(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputFilePath}: written file ${writtenTest}`);
        return;
      }
    }
    this.enqueueFileDeletion(inputRomFile);
  }

  private async writeRawFile(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
    inputRomFile: File,
    outputFilePath: string,
  ): Promise<boolean> {
    const removeHeader = this.options.canRemoveHeader(
      dat,
      path.extname(inputRomFile.getExtractedFilePath()),
    );

    this.progressBar.logInfo(`${dat.getNameShort()}: ${releaseCandidate.getName()}: copying file '${inputRomFile.toString()}' -> '${outputFilePath}'`);

    try {
      await CandidateWriter.ensureOutputDirExists(outputFilePath);
      const tempRawFile = await fsPoly.mktemp(outputFilePath);
      await inputRomFile.extractAndPatchToFile(tempRawFile, removeHeader);
      await fsPoly.mv(tempRawFile, outputFilePath);
      return true;
    } catch (error) {
      this.progressBar.logError(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputFilePath}: failed to copy from ${inputRomFile.toString()}: ${error}`);
      return false;
    }
  }

  private async testWrittenRaw(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
    outputFilePath: string,
    expectedFile: File,
  ): Promise<string | undefined> {
    this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputFilePath}: testing raw file`);

    // Check checksum
    if (expectedFile.getCrc32() === '00000000') {
      this.progressBar.logWarn(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputFilePath}: can't test, expected CRC is unknown`);
      return undefined;
    }
    const actualFile = await File.fileOf(outputFilePath);
    if (actualFile.getCrc32() !== expectedFile.getCrc32()) {
      return `has the CRC ${actualFile.getCrc32()}, expected ${expectedFile.getCrc32()}`;
    }

    // Check size
    if (!expectedFile.getSize()) {
      this.progressBar.logWarn(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputFilePath}: can't test, expected size is unknown`);
      return undefined;
    }
    if (actualFile.getSize() !== expectedFile.getSize()) {
      return `is of size ${actualFile.getSize().toLocaleString()}B, expected ${expectedFile.getSize().toLocaleString()}B`;
    }

    this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputFilePath}: test passed`);
    return undefined;
  }

  // Input files may be needed for multiple output files, such as an archive with hundreds of ROMs
  //  in it. That means we need to "move" (delete) files at the very end after all DATs have
  //  finished writing.
  private enqueueFileDeletion(inputRomFile: File): void {
    if (!this.options.shouldMove()) {
      return;
    }
    this.filesQueuedForDeletion.push(inputRomFile);
  }

  /**
   ***************************
   *
   *     Symlink Writing     *
   *
   ***************************
   */

  private async writeSymlink(dat: DAT, releaseCandidate: ReleaseCandidate): Promise<void> {
    const inputToOutputEntries = releaseCandidate.getRomsWithFiles();

    for (const inputToOutputEntry of inputToOutputEntries) {
      const inputRomFile = inputToOutputEntry.getInputFile();
      const outputRomFile = inputToOutputEntry.getOutputFile();
      await this.writeSymlinkSingle(dat, releaseCandidate, inputRomFile, outputRomFile);
    }
  }

  private async writeSymlinkSingle(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
    inputRomFile: File,
    outputRomFile: File,
  ): Promise<void> {
    // Input and output are the exact same, do nothing
    if (outputRomFile.equals(inputRomFile)) {
      this.progressBar.logDebug(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${outputRomFile}: input and output file is the same, skipping`);
      return;
    }

    const targetPath = outputRomFile.getFilePath();
    let sourcePath = path.resolve(inputRomFile.getFilePath());
    if (this.options.getSymlinkRelative()) {
      sourcePath = path.relative(path.dirname(targetPath), sourcePath);
    }

    // If the output file already exists, see if we need to do anything
    if (await fsPoly.exists(targetPath)) {
      if (!this.options.getOverwrite() && !this.options.getOverwriteInvalid()) {
        this.progressBar.logDebug(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${targetPath}: not overwriting existing file`);
        return;
      }

      if (this.options.getOverwriteInvalid()) {
        const existingTest = await CandidateWriter.testWrittenSymlink(targetPath, sourcePath);
        if (!existingTest) {
          this.progressBar.logDebug(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${targetPath}: not overwriting existing symlink, existing symlink is what was expected`);
          return;
        }
      }

      await fsPoly.rm(targetPath, { force: true });
    }

    this.progressBar.logInfo(`${dat.getNameShort()}: ${releaseCandidate.getName()}: creating symlink '${sourcePath}' -> '${targetPath}'`);
    try {
      await CandidateWriter.ensureOutputDirExists(targetPath);
      await fsPoly.symlink(sourcePath, targetPath);
    } catch (error) {
      this.progressBar.logError(`${dat.getNameShort()}: ${releaseCandidate.getName()}: ${targetPath}: failed to symlink from ${sourcePath}: ${error}`);
      return;
    }

    if (this.options.shouldTest()) {
      const writtenTest = await CandidateWriter.testWrittenSymlink(targetPath, sourcePath);
      if (writtenTest) {
        this.progressBar.logError(`${dat.getNameShort()}: ${releaseCandidate.getName()} ${targetPath}: written symlink ${writtenTest}`);
      }
    }
  }

  private static async testWrittenSymlink(
    targetPath: string,
    expectedSourcePath: string,
  ): Promise<string | undefined> {
    const existingSourcePath = await fsPoly.readlink(targetPath);
    if (path.normalize(existingSourcePath) !== path.normalize(expectedSourcePath)) {
      return `has the source path '${existingSourcePath}', expected '${expectedSourcePath}`;
    }

    return undefined;
  }
}
