import { Semaphore } from 'async-mutex';
import path from 'path';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Constants from '../constants.js';
import ElasticSemaphore from '../elasticSemaphore.js';
import fsPoly from '../polyfill/fsPoly.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import Zip from '../types/files/archives/zip.js';
import File from '../types/files/file.js';
import { ChecksumBitmask } from '../types/files/fileChecksums.js';
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
    if (!parentsToCandidates.size) {
      return [];
    }

    // Return early if we shouldn't write (are only reporting)
    if (!this.options.shouldWrite()) {
      return [];
    }

    // Filter to only the parents that actually have candidates (and therefore output)
    const parentsToWritableCandidates = new Map(
      [...parentsToCandidates.entries()]
        .filter(([, candidates]) => candidates.length),
    );

    const totalCandidateCount = [...parentsToWritableCandidates.values()].flatMap((c) => c).length;
    this.progressBar.logInfo(`${dat.getNameShort()}: writing ${totalCandidateCount.toLocaleString()} candidate${totalCandidateCount !== 1 ? 's' : ''}`);
    await this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
    await this.progressBar.reset(parentsToWritableCandidates.size);

    await Promise.all([...parentsToWritableCandidates.entries()].map(
      async ([
        parent,
        releaseCandidates,
      ]) => CandidateWriter.THREAD_SEMAPHORE.runExclusive(async () => {
        await this.progressBar.incrementProgress();
        this.progressBar.logTrace(`${dat.getNameShort()}: ${parent.getName()}: writing ${releaseCandidates.length.toLocaleString()} candidate${releaseCandidates.length !== 1 ? 's' : ''}`);

        for (let i = 0; i < releaseCandidates.length; i += 1) {
          const releaseCandidate = releaseCandidates[i];
          await this.writeReleaseCandidate(dat, releaseCandidate);
        }

        this.progressBar.logTrace(`${dat.getNameShort()}: ${parent.getName()}: done writing ${releaseCandidates.length.toLocaleString()} candidate${releaseCandidates.length !== 1 ? 's' : ''}`);
        await this.progressBar.incrementDone();
      }),
    ));

    this.progressBar.logInfo(`${dat.getNameShort()}: done writing ${totalCandidateCount.toLocaleString()} candidate${totalCandidateCount !== 1 ? 's' : ''}`);

    return this.filesQueuedForDeletion;
  }

  private async writeReleaseCandidate(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
  ): Promise<void> {
    const writeNeeded = releaseCandidate.getRomsWithFiles()
      .filter((romWithFiles) => !romWithFiles.getOutputFile().equals(romWithFiles.getInputFile()))
      .some((notEq) => notEq);
    if (!writeNeeded) {
      this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: input and output files are the same, skipping`);
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
    if (!inputToOutputZipEntries.length) {
      this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: no zip archives to write`);
      return;
    }

    // Prep the single output file
    const outputZip = inputToOutputZipEntries[0][1].getArchive();

    // If the output file already exists, see if we need to do anything
    if (await fsPoly.exists(outputZip.getFilePath())) {
      if (!this.options.getOverwrite() && !this.options.getOverwriteInvalid()) {
        this.progressBar.logTrace(`${dat.getNameShort()}: ${outputZip.getFilePath()}: not overwriting existing zip`);
        return;
      }

      if (this.options.getOverwriteInvalid()) {
        const existingTest = await this.testZipContents(
          dat,
          outputZip,
          inputToOutputZipEntries.map((entry) => entry[1]),
        );
        if (!existingTest) {
          this.progressBar.logTrace(`${dat.getNameShort()}: ${outputZip.getFilePath()}: not overwriting existing zip, existing zip has the expected contents`);
          return;
        }
      }
    }

    if (!await this.writeZipFile(dat, outputZip, inputToOutputZipEntries)) {
      // It's expected that an error was already logged
      return;
    }

    if (this.options.shouldTest()) {
      const writtenTest = await this.testZipContents(
        dat,
        outputZip,
        inputToOutputZipEntries.map((entry) => entry[1]),
      );
      if (writtenTest) {
        this.progressBar.logError(`${dat.getNameShort()}: ${outputZip.getFilePath()}: written zip ${writtenTest}`);
        return;
      }
    }

    inputToOutputZipEntries.forEach(([inputRomFile]) => this.enqueueFileDeletion(inputRomFile));
  }

  private async testZipContents(
    dat: DAT,
    outputZip: Zip,
    expectedArchiveEntries: ArchiveEntry<Zip>[],
  ): Promise<string | undefined> {
    this.progressBar.logTrace(`${dat.getNameShort()}: ${outputZip.getFilePath()}: testing zip ...`);

    const expectedEntriesByPath = expectedArchiveEntries
      .reduce((map, entry) => {
        map.set(entry.getEntryPath(), entry);
        return map;
      }, new Map<string, ArchiveEntry<Zip>>());

    let archiveEntries: ArchiveEntry<Zip>[];
    try {
      archiveEntries = await outputZip.getArchiveEntries(ChecksumBitmask.CRC32);
    } catch (e) {
      return `failed to get archive contents: ${e}`;
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
    for (let i = 0; i < entryPaths.length; i += 1) {
      const entryPath = entryPaths[i];
      const expectedFile = expectedEntriesByPath.get(entryPath) as ArchiveEntry<Zip>;

      // Check existence
      if (!actualEntriesByPath.has(entryPath)) {
        return `is missing the file ${entryPath}`;
      }

      // Check checksum
      if (expectedFile.getCrc32() === '00000000') {
        this.progressBar.logWarn(`${dat.getNameShort()}: ${expectedFile.toString()}: can't test, expected CRC is unknown`);
        // eslint-disable-next-line no-continue
        continue;
      }
      const actualFile = actualEntriesByPath.get(entryPath) as ArchiveEntry<Zip>;
      if (actualFile.getCrc32() !== expectedFile.getCrc32()) {
        return `has the file ${entryPath} with the CRC ${actualFile.getCrc32()}, expected ${expectedFile.getCrc32()}`;
      }
    }

    this.progressBar.logTrace(`${dat.getNameShort()}: ${outputZip.getFilePath()}: test passed`);
    return undefined;
  }

  private async writeZipFile(
    dat: DAT,
    outputZip: Zip,
    inputToOutputZipEntries: [File, ArchiveEntry<Zip>][],
  ): Promise<boolean> {
    this.progressBar.logTrace(`${dat.getNameShort()}: ${outputZip.getFilePath()}: writing ${inputToOutputZipEntries.length.toLocaleString()} archive entr${inputToOutputZipEntries.length !== 1 ? 'ies' : 'y'} ...`);

    try {
      await CandidateWriter.ensureOutputDirExists(outputZip.getFilePath());
      await outputZip.createArchive(this.options, dat, inputToOutputZipEntries);
    } catch (e) {
      this.progressBar.logError(`${dat.getNameShort()}: ${outputZip.getFilePath()}: failed to create zip: ${e}`);
      return false;
    }

    this.progressBar.logTrace(`${dat.getNameShort()}: ${outputZip.getFilePath()}: wrote ${inputToOutputZipEntries.length.toLocaleString()} archive entr${inputToOutputZipEntries.length !== 1 ? 'ies' : 'y'}`);
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
    if (!inputToOutputEntries.length) {
      // TODO(cemmer): unit test
      this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: no raw files to write`);
      return;
    }

    // De-duplicate based on the output file. Raw copying archives will produce the same
    //  input->output for every ROM.
    const outputRomFiles = inputToOutputEntries
      .map(([, outputRomFile]) => outputRomFile.toString());
    const uniqueInputToOutputEntries = inputToOutputEntries
      .filter((_, idx) => outputRomFiles.indexOf(outputRomFiles[idx]) === idx);

    const totalBytes = uniqueInputToOutputEntries
      .flatMap(([, outputFile]) => outputFile)
      .reduce((sum, file) => sum + file.getSize(), 0);
    this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: writing ${fsPoly.sizeReadable(totalBytes)} of ${uniqueInputToOutputEntries.length.toLocaleString()} file${uniqueInputToOutputEntries.length !== 1 ? 's' : ''}`);

    for (let i = 0; i < uniqueInputToOutputEntries.length; i += 1) {
      const [inputRomFile, outputRomFile] = uniqueInputToOutputEntries[i];
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
      this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: same file, skipping: ${outputRomFile}`);
      return;
    }

    const outputFilePath = outputRomFile.getFilePath();

    // If the output file already exists, see if we need to do anything
    if (!this.options.getOverwrite() && await fsPoly.exists(outputFilePath)) {
      if (!this.options.getOverwrite() && !this.options.getOverwriteInvalid()) {
        this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: not overwriting existing file: ${outputFilePath}`);
        return;
      }

      if (this.options.getOverwriteInvalid()) {
        const existingTest = await this.testWrittenRaw(dat, outputFilePath, outputRomFile);
        if (!existingTest) {
          this.progressBar.logTrace(`${dat.getNameShort()}: ${releaseCandidate.getName()}: not overwriting existing file, existing file is what was expected: ${outputFilePath}`);
          return;
        }
      }
    }

    if (!await this.writeRawFile(dat, inputRomFile, outputFilePath)) {
      // It's expected that an error was already logged
      return;
    }
    if (this.options.shouldTest()) {
      const writtenTest = await this.testWrittenRaw(dat, outputFilePath, outputRomFile);
      if (writtenTest) {
        this.progressBar.logError(`${dat.getNameShort()}: ${releaseCandidate.getName()}: written file ${writtenTest}: ${outputFilePath}`);
        return;
      }
    }
    this.enqueueFileDeletion(inputRomFile);
  }

  private async writeRawFile(
    dat: DAT,
    inputRomFile: File,
    outputFilePath: string,
  ): Promise<boolean> {
    const removeHeader = this.options.canRemoveHeader(
      dat,
      path.extname(inputRomFile.getExtractedFilePath()),
    );

    this.progressBar.logTrace(`${dat.getNameShort()}: ${inputRomFile.toString()} writing to ${outputFilePath}`);

    try {
      await CandidateWriter.ensureOutputDirExists(outputFilePath);
      const tempRawFile = await fsPoly.mktemp(outputFilePath);
      await inputRomFile.extractAndPatchToFile(tempRawFile, removeHeader);
      await fsPoly.mv(tempRawFile, outputFilePath);
      return true;
    } catch (e) {
      this.progressBar.logError(`${dat.getNameShort()}: ${inputRomFile.toString()}: failed to copy to ${outputFilePath}: ${e}`);
      return false;
    }
  }

  private async testWrittenRaw(
    dat: DAT,
    outputFilePath: string,
    expectedFile: File,
  ): Promise<string | undefined> {
    this.progressBar.logTrace(`${dat.getNameShort()}: ${outputFilePath}: testing raw`);

    // Check checksum
    if (expectedFile.getCrc32() === '00000000') {
      this.progressBar.logWarn(`${dat.getNameShort()}: ${outputFilePath}: can't test, expected CRC is unknown`);
      return undefined;
    }
    const actualFile = await File.fileOf(outputFilePath);
    if (actualFile.getCrc32() !== expectedFile.getCrc32()) {
      return `has the CRC ${actualFile.getCrc32()}, expected ${expectedFile.getCrc32()}`;
    }

    this.progressBar.logTrace(`${dat.getNameShort()}: ${outputFilePath}: test passed`);
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

    for (let i = 0; i < inputToOutputEntries.length; i += 1) {
      const inputRomFile = inputToOutputEntries[i].getInputFile();
      const outputRomFile = inputToOutputEntries[i].getOutputFile();
      await this.writeSymlinkSingle(dat, inputRomFile, outputRomFile);
    }
  }

  private async writeSymlinkSingle(
    dat: DAT,
    inputRomFile: File,
    outputRomFile: File,
  ): Promise<void> {
    // Input and output are the exact same, do nothing
    if (outputRomFile.equals(inputRomFile)) {
      this.progressBar.logTrace(`${dat.getNameShort()}: ${outputRomFile}: same file, skipping`);
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
        this.progressBar.logTrace(`${dat.getNameShort()}: ${targetPath}: not overwriting existing file`);
        return;
      }

      if (this.options.getOverwriteInvalid()) {
        const existingTest = await CandidateWriter.testWrittenSymlink(targetPath, sourcePath);
        if (!existingTest) {
          this.progressBar.logTrace(`${dat.getNameShort()}: ${targetPath}: not overwriting existing symlink, existing symlink is what was expected`);
          return;
        }
      }

      await fsPoly.rm(targetPath, { force: true });
    }

    try {
      await CandidateWriter.ensureOutputDirExists(targetPath);
      await fsPoly.symlink(sourcePath, targetPath);
    } catch (e) {
      this.progressBar.logError(`${dat.getNameShort()}: ${inputRomFile.toString()}: failed to symlink ${sourcePath} to ${targetPath}: ${e}`);
      return;
    }

    if (this.options.shouldTest()) {
      const writtenTest = await CandidateWriter.testWrittenSymlink(targetPath, sourcePath);
      if (writtenTest) {
        this.progressBar.logError(`${dat.getNameShort()}: ${targetPath}: written symlink ${writtenTest}`);
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
