import path from 'node:path';

import { Semaphore } from 'async-mutex';

import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import ElasticSemaphore from '../../elasticSemaphore.js';
import Defaults from '../../globals/defaults.js';
import KeyedMutex from '../../keyedMutex.js';
import ArrayPoly from '../../polyfill/arrayPoly.js';
import FsPoly from '../../polyfill/fsPoly.js';
import DAT from '../../types/dats/dat.js';
import ArchiveEntry from '../../types/files/archives/archiveEntry.js';
import Zip from '../../types/files/archives/zip.js';
import File from '../../types/files/file.js';
import { ChecksumBitmask } from '../../types/files/fileChecksums.js';
import Options from '../../types/options.js';
import WriteCandidate from '../../types/writeCandidate.js';
import Module from '../module.js';

export interface CandidateWriterResults {
  wrote: File[];
  moved: File[];
}

/**
 * Copy or move output ROM files, if applicable.
 */
export default class CandidateWriter extends Module {
  // The maximum number of candidates that can be written at once
  private static readonly THREAD_SEMAPHORE = new Semaphore(Number.MAX_SAFE_INTEGER);

  // WARN(cemmer): there is an undocumented semaphore max value that can be used, the full
  //  4,700,372,992 bytes of a DVD+R will cause runExclusive() to never run or return.
  private static readonly FILESIZE_SEMAPHORE = new ElasticSemaphore(
    Defaults.MAX_READ_WRITE_CONCURRENT_KILOBYTES,
  );

  // When moving input files, process input file paths exclusively
  private static readonly MOVE_MUTEX = new KeyedMutex(1000);

  // When moving input files, keep track of files that have been moved
  private static readonly FILE_PATH_MOVES = new Map<string, string>();

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
  async write(dat: DAT, candidates: WriteCandidate[]): Promise<CandidateWriterResults> {
    const writtenFiles = candidates.flatMap((candidate) =>
      candidate.getRomsWithFiles().map((romWithFiles) => romWithFiles.getOutputFile()),
    );

    if (candidates.length === 0) {
      return {
        wrote: writtenFiles,
        moved: [],
      };
    }

    // Return early if we shouldn't write (are only reporting)
    if (!this.options.shouldWrite()) {
      return {
        wrote: writtenFiles,
        moved: [],
      };
    }

    // Filter to only the candidates that actually have matched files (and therefore output)
    const writableCandidates = candidates.filter(
      (candidate) => candidate.getRomsWithFiles().length > 0,
    );

    this.progressBar.logTrace(
      `${dat.getName()}: writing ${writableCandidates.length.toLocaleString()} candidate${writableCandidates.length !== 1 ? 's' : ''}`,
    );
    if (this.options.shouldTest() && !this.options.getOverwrite()) {
      this.progressBar.setSymbol(ProgressBarSymbol.TESTING);
    } else {
      this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
    }
    this.progressBar.reset(writableCandidates.length);

    await Promise.all(
      writableCandidates.map(async (candidate) =>
        CandidateWriter.THREAD_SEMAPHORE.runExclusive(async () => {
          this.progressBar.incrementProgress();
          this.progressBar.logTrace(`${dat.getName()}: ${candidate.getName()}: writing candidate`);

          await this.writeCandidate(dat, candidate);

          this.progressBar.logTrace(
            `${dat.getName()}: ${candidate.getName()}: done writing candidate`,
          );
          this.progressBar.incrementDone();
        }),
      ),
    );

    this.progressBar.logTrace(
      `${dat.getName()}: done writing ${writableCandidates.length.toLocaleString()} candidate${writableCandidates.length !== 1 ? 's' : ''}`,
    );

    const writtenFilePaths = new Set(writtenFiles.map((writtenFile) => writtenFile.getFilePath()));
    const movedFiles = this.filesQueuedForDeletion
      // Files that were written should not be eligible for move deletion. This protects against
      // the same directory being used for both an input and output directory.
      .filter((fileQueued) => !writtenFilePaths.has(fileQueued.getFilePath()));
    return {
      wrote: writtenFiles,
      moved: movedFiles,
    };
  }

  private async writeCandidate(dat: DAT, candidate: WriteCandidate): Promise<void> {
    const writeNeeded = candidate
      .getRomsWithFiles()
      .some((romWithFiles) => !romWithFiles.getOutputFile().equals(romWithFiles.getInputFile()));
    if (!writeNeeded) {
      this.progressBar.logDebug(
        `${dat.getName()}: ${candidate.getName()}: input and output files are the same, skipping`,
      );
      return;
    }

    const totalKilobytes =
      candidate
        .getRomsWithFiles()
        .reduce((sum, romWithFiles) => sum + romWithFiles.getInputFile().getSize(), 0) / 1024;
    await CandidateWriter.FILESIZE_SEMAPHORE.runExclusive(async () => {
      const waitingMessage = `${candidate.getName()} ...`;
      this.progressBar.addWaitingMessage(waitingMessage);

      if (this.options.shouldLink()) {
        await this.writeLink(dat, candidate);
      } else {
        await this.writeZip(dat, candidate);
        await this.writeRaw(dat, candidate);
      }

      this.progressBar.removeWaitingMessage(waitingMessage);
    }, totalKilobytes);
  }

  private static async ensureOutputDirExists(outputFilePath: string): Promise<void> {
    const outputDir = path.dirname(outputFilePath);
    if (!(await FsPoly.exists(outputDir))) {
      await FsPoly.mkdir(outputDir, { recursive: true });
    }
  }

  /**
   ***********************
   *
   *     Zip Writing     *
   *
   ***********************
   */

  private async writeZip(dat: DAT, candidate: WriteCandidate): Promise<void> {
    // Return no files if there are none to write
    const inputToOutputZipEntries = candidate
      .getRomsWithFiles()
      .filter((romWithFiles) => romWithFiles.getOutputFile() instanceof ArchiveEntry)
      .map((romWithFiles) => [
        romWithFiles.getInputFile(),
        romWithFiles.getOutputFile() as ArchiveEntry<Zip>,
      ]) satisfies [File, ArchiveEntry<Zip>][];
    if (inputToOutputZipEntries.length === 0) {
      this.progressBar.logTrace(
        `${dat.getName()}: ${candidate.getName()}: no zip archives to write`,
      );
      return;
    }

    // Prep the single output file
    const outputZip = inputToOutputZipEntries[0][1].getArchive() as Zip;

    // If the output file already exists, see if we need to do anything
    if (await FsPoly.exists(outputZip.getFilePath())) {
      if (!this.options.getOverwrite() && !this.options.getOverwriteInvalid()) {
        this.progressBar.logDebug(
          `${dat.getName()}: ${candidate.getName()}: ${outputZip.getFilePath()}: not overwriting existing zip file`,
        );
        return;
      }

      if (this.options.getOverwriteInvalid()) {
        const existingTest = await this.testZipContents(
          dat,
          candidate,
          outputZip.getFilePath(),
          inputToOutputZipEntries.map(([, outputEntry]) => outputEntry),
        );
        if (!existingTest) {
          this.progressBar.logDebug(
            `${dat.getName()}: ${candidate.getName()}: ${outputZip.getFilePath()}: not overwriting existing zip file, existing zip has the expected contents`,
          );
          return;
        }
      }
    }

    this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
    let written = false;
    for (let i = 0; i <= this.options.getWriteRetry(); i += 1) {
      written = await this.writeZipFile(dat, candidate, outputZip, inputToOutputZipEntries);

      if (written && !this.options.shouldTest()) {
        // Successfully written, unknown if valid
        break;
      }
      if (written && this.options.shouldTest()) {
        const writtenTest = await this.testZipContents(
          dat,
          candidate,
          outputZip.getFilePath(),
          inputToOutputZipEntries.map((entry) => entry[1]),
        );
        if (!writtenTest) {
          // Successfully validated
          break;
        }
        const message = `${dat.getName()}: ${candidate.getName()}: ${outputZip.getFilePath()}: written zip ${writtenTest}`;
        if (i < this.options.getWriteRetry()) {
          this.progressBar.logWarn(`${message}, retrying`);
        } else {
          this.progressBar.logError(message);
          return; // final error, do not continue
        }
      }
    }
    if (!written) {
      return;
    }

    inputToOutputZipEntries.forEach(([inputRomFile]) => this.enqueueFileDeletion(inputRomFile));
  }

  private async testZipContents(
    dat: DAT,
    candidate: WriteCandidate,
    zipFilePath: string,
    expectedArchiveEntries: ArchiveEntry<Zip>[],
  ): Promise<string | undefined> {
    this.progressBar.logTrace(
      `${dat.getName()}: ${candidate.getName()}: ${zipFilePath}: testing zip`,
    );

    const expectedEntriesByPath = expectedArchiveEntries.reduce((map, entry) => {
      map.set(entry.getEntryPath(), entry);
      return map;
    }, new Map<string, ArchiveEntry<Zip>>());

    const checksumBitmask = expectedArchiveEntries.reduce(
      (bitmask, entry) => bitmask | entry.getChecksumBitmask(),
      ChecksumBitmask.CRC32,
    );

    let archiveEntries: ArchiveEntry<Zip>[];
    try {
      archiveEntries = await new Zip(zipFilePath).getArchiveEntries(checksumBitmask);
    } catch (error) {
      return `failed to get archive contents: ${error}`;
    }

    const actualEntriesByPath = archiveEntries.reduce((map, entry) => {
      map.set(entry.getEntryPath(), entry);
      return map;
    }, new Map<string, ArchiveEntry<Zip>>());
    if (actualEntriesByPath.size !== expectedEntriesByPath.size) {
      return `has ${actualEntriesByPath.size.toLocaleString()} files, expected ${expectedEntriesByPath.size.toLocaleString()}`;
    }

    const entryPaths = [...expectedEntriesByPath.keys()];
    for (const entryPath of entryPaths) {
      const expectedFile = expectedEntriesByPath.get(entryPath)!;

      // Check existence
      if (!actualEntriesByPath.has(entryPath)) {
        return `is missing the file ${entryPath}`;
      }

      // Check checksum
      const actualFile = actualEntriesByPath.get(entryPath)!;
      if (
        actualFile.getSha256() &&
        expectedFile.getSha256() &&
        actualFile.getSha256() !== expectedFile.getSha256()
      ) {
        return `has the SHA256 ${actualFile.getSha256()}, expected ${expectedFile.getSha256()}`;
      }
      if (
        actualFile.getSha1() &&
        expectedFile.getSha1() &&
        actualFile.getSha1() !== expectedFile.getSha1()
      ) {
        return `has the SHA1 ${actualFile.getSha1()}, expected ${expectedFile.getSha1()}`;
      }
      if (
        actualFile.getMd5() &&
        expectedFile.getMd5() &&
        actualFile.getMd5() !== expectedFile.getMd5()
      ) {
        return `has the MD5 ${actualFile.getMd5()}, expected ${expectedFile.getMd5()}`;
      }
      if (
        actualFile.getCrc32() &&
        expectedFile.getCrc32() &&
        expectedFile.getCrc32() !== '00000000' &&
        actualFile.getCrc32() !== expectedFile.getCrc32()
      ) {
        return `has the CRC32 ${actualFile.getCrc32()}, expected ${expectedFile.getCrc32()}`;
      }

      // Check size
      if (actualFile.getCrc32() && expectedFile.getCrc32()) {
        if (!expectedFile.getSize()) {
          this.progressBar.logWarn(
            `${dat.getName()}: ${candidate.getName()}: ${expectedFile.toString()}: can't test, expected size is unknown`,
          );
          continue;
        }
        if (actualFile.getSize() !== expectedFile.getSize()) {
          return `has the file ${entryPath} of size ${actualFile.getSize().toLocaleString()}B, expected ${expectedFile.getSize().toLocaleString()}B`;
        }
      }
    }

    this.progressBar.logTrace(
      `${dat.getName()}: ${candidate.getName()}: ${zipFilePath}: test passed`,
    );
    return undefined;
  }

  private async writeZipFile(
    dat: DAT,
    candidate: WriteCandidate,
    outputZip: Zip,
    inputToOutputZipEntries: [File, ArchiveEntry<Zip>][],
  ): Promise<boolean> {
    this.progressBar.logInfo(
      `${dat.getName()}: ${candidate.getName()}: creating zip archive '${outputZip.getFilePath()}' with the entries:\n${inputToOutputZipEntries.map(([input, output]) => `  '${input.toString()}' (${FsPoly.sizeReadable(input.getSize())}) → '${output.getEntryPath()}'`).join('\n')}`,
    );

    try {
      await CandidateWriter.ensureOutputDirExists(outputZip.getFilePath());
      await outputZip.createArchive(inputToOutputZipEntries);
    } catch (error) {
      this.progressBar.logError(
        `${dat.getName()}: ${candidate.getName()}: ${outputZip.getFilePath()}: failed to create zip: ${error}`,
      );
      return false;
    }

    this.progressBar.logTrace(
      `${dat.getName()}: ${candidate.getName()}: ${outputZip.getFilePath()}: wrote ${inputToOutputZipEntries.length.toLocaleString()} archive entr${inputToOutputZipEntries.length !== 1 ? 'ies' : 'y'}`,
    );
    return true;
  }

  /**
   ***********************
   *
   *     Raw Writing     *
   *
   ***********************
   */

  private async writeRaw(dat: DAT, candidate: WriteCandidate): Promise<void> {
    const inputToOutputEntries = candidate
      .getRomsWithFiles()
      .filter((romWithFiles) => !(romWithFiles.getOutputFile() instanceof ArchiveEntry))
      .map((romWithFiles) => [romWithFiles.getInputFile(), romWithFiles.getOutputFile()]);

    // Return no files if there are none to write
    if (inputToOutputEntries.length === 0) {
      // TODO(cemmer): unit test
      this.progressBar.logTrace(`${dat.getName()}: ${candidate.getName()}: no raw files to write`);
      return;
    }

    // De-duplicate based on the output file. Raw copying archives will produce the same
    //  input->output for every ROM.
    const uniqueInputToOutputEntries = inputToOutputEntries.filter(
      ArrayPoly.filterUniqueMapped(([, outputRomFile]) => outputRomFile.toString()),
    );

    const totalBytes = uniqueInputToOutputEntries
      .flatMap(([, outputFile]) => outputFile)
      .reduce((sum, file) => sum + file.getSize(), 0);
    this.progressBar.logTrace(
      `${dat.getName()}: ${candidate.getName()}: writing ${FsPoly.sizeReadable(totalBytes)} of ${uniqueInputToOutputEntries.length.toLocaleString()} file${uniqueInputToOutputEntries.length !== 1 ? 's' : ''}`,
    );

    // Group the input->output pairs by the input file's path. The goal is to extract entries from
    // the same input archive at the same time, to benefit from batch extraction.
    const uniqueInputToOutputEntriesMap = uniqueInputToOutputEntries.reduce(
      (map, [inputRomFile, outputRomFile]) => {
        const key = inputRomFile.getFilePath();
        if (!map.has(key)) {
          map.set(key, [[inputRomFile, outputRomFile]]);
        } else {
          map.get(key)?.push([inputRomFile, outputRomFile]);
        }
        return map;
      },
      new Map<string, [File, File][]>(),
    );
    for (const groupedInputToOutput of uniqueInputToOutputEntriesMap.values()) {
      await Promise.all(
        groupedInputToOutput.map(async ([inputRomFile, outputRomFile]) =>
          this.writeRawSingle(dat, candidate, inputRomFile, outputRomFile),
        ),
      );
    }
  }

  private async writeRawSingle(
    dat: DAT,
    candidate: WriteCandidate,
    inputRomFile: File,
    outputRomFile: File,
  ): Promise<void> {
    // Input and output are the exact same, maybe do nothing
    if (outputRomFile.equals(inputRomFile)) {
      const wasMoved =
        this.options.shouldMove() &&
        (await CandidateWriter.MOVE_MUTEX.runExclusiveForKey(inputRomFile.getFilePath(), () =>
          CandidateWriter.FILE_PATH_MOVES.get(inputRomFile.getFilePath()),
        )) !== undefined;

      if (!wasMoved) {
        this.progressBar.logDebug(
          `${dat.getName()}: ${candidate.getName()}: ${outputRomFile.toString()}: input and output file is the same, skipping`,
        );
        return;
      }
    }

    const outputFilePath = outputRomFile.getFilePath();

    // If the output file already exists, see if we need to do anything
    if (!this.options.getOverwrite() && (await FsPoly.exists(outputFilePath))) {
      if (!this.options.getOverwrite() && !this.options.getOverwriteInvalid()) {
        this.progressBar.logDebug(
          `${dat.getName()}: ${candidate.getName()}: ${outputFilePath}: not overwriting existing file`,
        );
        return;
      }

      if (this.options.getOverwriteInvalid()) {
        const existingTest = await this.testWrittenRaw(
          dat,
          candidate,
          outputFilePath,
          outputRomFile,
        );
        if (!existingTest) {
          this.progressBar.logDebug(
            `${dat.getName()}: ${candidate.getName()}: ${outputFilePath}: not overwriting existing file, existing file is what was expected`,
          );
          return;
        }
      }
    }

    this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
    let written = false;
    for (let i = 0; i <= this.options.getWriteRetry(); i += 1) {
      if (this.options.shouldMove()) {
        written = await this.moveRawFile(dat, candidate, inputRomFile, outputFilePath);
      } else {
        written = await this.copyRawFile(dat, candidate, inputRomFile, outputFilePath);
      }

      if (written && !this.options.shouldTest()) {
        // Successfully written, unknown if valid
        break;
      }
      if (written && this.options.shouldTest()) {
        const writtenTest = await this.testWrittenRaw(
          dat,
          candidate,
          outputFilePath,
          outputRomFile,
        );
        if (!writtenTest) {
          // Successfully validated
          break;
        }
        const message = `${dat.getName()}: ${candidate.getName()}: ${outputFilePath}: written file ${writtenTest}`;
        if (i < this.options.getWriteRetry()) {
          this.progressBar.logWarn(`${message}, retrying`);
        } else {
          this.progressBar.logError(message);
          return; // final error, do not continue
        }
      }
    }
    if (!written) {
      return;
    }

    this.enqueueFileDeletion(inputRomFile);
  }

  private async moveRawFile(
    dat: DAT,
    candidate: WriteCandidate,
    inputRomFile: File,
    outputFilePath: string,
  ): Promise<boolean> {
    // Lock the input file, we can't handle concurrent moves
    return CandidateWriter.MOVE_MUTEX.runExclusiveForKey(inputRomFile.getFilePath(), async () => {
      const movedFilePath = CandidateWriter.FILE_PATH_MOVES.get(inputRomFile.getFilePath());
      if (movedFilePath) {
        // The file was already moved, we shouldn't move it again
        return this.copyRawFile(
          dat,
          candidate,
          inputRomFile.withFilePath(movedFilePath),
          outputFilePath,
        );
      }

      if (
        inputRomFile instanceof ArchiveEntry ||
        inputRomFile.getFileHeader() !== undefined ||
        inputRomFile.getPatch() !== undefined
      ) {
        // The file can't be moved as-is, it needs to get copied
        return this.copyRawFile(dat, candidate, inputRomFile, outputFilePath);
      }

      this.progressBar.logInfo(
        `${dat.getName()}: ${candidate.getName()}: moving file '${inputRomFile.toString()}' (${FsPoly.sizeReadable(inputRomFile.getSize())}) → '${outputFilePath}'`,
      );

      try {
        await CandidateWriter.ensureOutputDirExists(outputFilePath);

        await FsPoly.mv(inputRomFile.getFilePath(), outputFilePath);
        CandidateWriter.FILE_PATH_MOVES.set(inputRomFile.getFilePath(), outputFilePath);
        return true;
      } catch (error) {
        this.progressBar.logError(
          `${dat.getName()}: ${candidate.getName()}: failed to move file '${inputRomFile.toString()}' → '${outputFilePath}': ${error}`,
        );
        return false;
      }
    });
  }

  private async copyRawFile(
    dat: DAT,
    candidate: WriteCandidate,
    inputRomFile: File,
    outputFilePath: string,
  ): Promise<boolean> {
    this.progressBar.logInfo(
      `${dat.getName()}: ${candidate.getName()}: ${inputRomFile instanceof ArchiveEntry ? 'extracting' : 'copying'} file '${inputRomFile.toString()}' (${FsPoly.sizeReadable(inputRomFile.getSize())}) → '${outputFilePath}'`,
    );

    try {
      await CandidateWriter.ensureOutputDirExists(outputFilePath);

      const tempRawFile = await FsPoly.mktemp(outputFilePath);
      await inputRomFile.extractAndPatchToFile(tempRawFile);
      await FsPoly.mv(tempRawFile, outputFilePath);
      return true;
    } catch (error) {
      this.progressBar.logError(
        `${dat.getName()}: ${candidate.getName()}: failed to ${inputRomFile instanceof ArchiveEntry ? 'extract' : 'copy'} file '${inputRomFile.toString()}' → '${outputFilePath}': ${error}`,
      );
      return false;
    }
  }

  private async testWrittenRaw(
    dat: DAT,
    candidate: WriteCandidate,
    outputFilePath: string,
    expectedFile: File,
  ): Promise<string | undefined> {
    this.progressBar.logTrace(
      `${dat.getName()}: ${candidate.getName()}: ${outputFilePath}: testing raw file`,
    );

    // Check checksum
    let actualFile: File;
    try {
      actualFile = await File.fileOf(
        { filePath: outputFilePath },
        expectedFile.getChecksumBitmask(),
      );
    } catch (error) {
      return `failed to parse: ${error}`;
    }
    if (
      actualFile.getSha256() &&
      expectedFile.getSha256() &&
      actualFile.getSha256() !== expectedFile.getSha256()
    ) {
      return `has the SHA256 ${actualFile.getSha256()}, expected ${expectedFile.getSha256()}`;
    }
    if (
      actualFile.getSha1() &&
      expectedFile.getSha1() &&
      actualFile.getSha1() !== expectedFile.getSha1()
    ) {
      return `has the SHA1 ${actualFile.getSha1()}, expected ${expectedFile.getSha1()}`;
    }
    if (
      actualFile.getMd5() &&
      expectedFile.getMd5() &&
      actualFile.getMd5() !== expectedFile.getMd5()
    ) {
      return `has the MD5 ${actualFile.getMd5()}, expected ${expectedFile.getMd5()}`;
    }
    if (
      actualFile.getCrc32() &&
      expectedFile.getCrc32() &&
      expectedFile.getCrc32() !== '00000000' &&
      actualFile.getCrc32() !== expectedFile.getCrc32()
    ) {
      return `has the CRC32 ${actualFile.getCrc32()}, expected ${expectedFile.getCrc32()}`;
    }

    // Check size
    if (actualFile.getCrc32()) {
      if (actualFile.getCrc32() && !expectedFile.getSize()) {
        this.progressBar.logWarn(
          `${dat.getName()}: ${candidate.getName()}: ${outputFilePath}: can't test, expected size is unknown`,
        );
        return undefined;
      }
      if (actualFile.getSize() !== expectedFile.getSize()) {
        return `is of size ${actualFile.getSize().toLocaleString()}B, expected ${expectedFile.getSize().toLocaleString()}B`;
      }
    }

    this.progressBar.logTrace(
      `${dat.getName()}: ${candidate.getName()}: ${outputFilePath}: test passed`,
    );
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
   ************************
   *
   *     Link Writing     *
   *
   ************************
   */

  private async writeLink(dat: DAT, candidate: WriteCandidate): Promise<void> {
    const inputToOutputEntries = candidate.getRomsWithFiles();

    for (const inputToOutputEntry of inputToOutputEntries) {
      const inputRomFile = inputToOutputEntry.getInputFile();
      const outputRomFile = inputToOutputEntry.getOutputFile();
      await this.writeLinkSingle(dat, candidate, inputRomFile, outputRomFile);
    }
  }

  private async writeLinkSingle(
    dat: DAT,
    candidate: WriteCandidate,
    inputRomFile: File,
    outputRomFile: File,
  ): Promise<void> {
    // Input and output are the exact same, do nothing
    if (outputRomFile.equals(inputRomFile)) {
      this.progressBar.logDebug(
        `${dat.getName()}: ${candidate.getName()}: ${outputRomFile.toString()}: input and output file is the same, skipping`,
      );
      return;
    }

    const linkPath = outputRomFile.getFilePath();
    let targetPath = inputRomFile.getFilePath();
    if (this.options.getSymlink() && this.options.getSymlinkRelative()) {
      await CandidateWriter.ensureOutputDirExists(linkPath);
      targetPath = await FsPoly.symlinkRelativePath(targetPath, linkPath);
    }

    // If the output file already exists, see if we need to do anything
    if (await FsPoly.exists(linkPath)) {
      if (!this.options.getOverwrite() && !this.options.getOverwriteInvalid()) {
        this.progressBar.logDebug(
          `${dat.getName()}: ${candidate.getName()}: ${linkPath}: not overwriting existing file`,
        );
        return;
      }

      if (this.options.getOverwriteInvalid()) {
        let existingTest;
        if (this.options.getSymlink()) {
          existingTest = await CandidateWriter.testWrittenSymlink(linkPath, targetPath);
        } else {
          existingTest = await CandidateWriter.testWrittenHardlink(
            linkPath,
            inputRomFile.getFilePath(),
          );
        }
        if (!existingTest) {
          this.progressBar.logDebug(
            `${dat.getName()}: ${candidate.getName()}: ${linkPath}: not overwriting existing link, existing link is what was expected`,
          );
          return;
        }
      }

      await FsPoly.rm(linkPath, { force: true });
    }

    this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
    for (let i = 0; i <= this.options.getWriteRetry(); i += 1) {
      const written = await this.writeRawLink(dat, candidate, targetPath, linkPath);

      if (written && !this.options.shouldTest()) {
        // Successfully written, unknown if valid
        break;
      }
      if (written && this.options.shouldTest()) {
        let writtenTest;
        if (this.options.getSymlink()) {
          writtenTest = await CandidateWriter.testWrittenSymlink(linkPath, targetPath);
        } else {
          writtenTest = await CandidateWriter.testWrittenHardlink(
            linkPath,
            inputRomFile.getFilePath(),
          );
        }
        if (!writtenTest) {
          // Successfully validated
          break;
        }
        const message = `${dat.getName()}: ${candidate.getName()} ${linkPath}: written link ${writtenTest}`;
        if (i < this.options.getWriteRetry()) {
          this.progressBar.logWarn(`${message}, retrying`);
        } else {
          this.progressBar.logError(message);
          return; // final error, do not continue
        }
      }
    }
  }

  private async writeRawLink(
    dat: DAT,
    candidate: WriteCandidate,
    targetPath: string,
    linkPath: string,
  ): Promise<boolean> {
    try {
      await CandidateWriter.ensureOutputDirExists(linkPath);
      if (this.options.getSymlink()) {
        this.progressBar.logInfo(
          `${dat.getName()}: ${candidate.getName()}: creating symlink '${targetPath}' → '${linkPath}'`,
        );
        await FsPoly.symlink(targetPath, linkPath);
      } else {
        this.progressBar.logInfo(
          `${dat.getName()}: ${candidate.getName()}: creating hard link '${targetPath}' → '${linkPath}'`,
        );
        await FsPoly.hardlink(targetPath, linkPath);
      }
      return true;
    } catch (error) {
      this.progressBar.logError(
        `${dat.getName()}: ${candidate.getName()}: ${linkPath}: failed to link from ${targetPath}: ${error}`,
      );
      return false;
    }
  }

  private static async testWrittenSymlink(
    linkPath: string,
    expectedTargetPath: string,
  ): Promise<string | undefined> {
    if (!(await FsPoly.exists(linkPath))) {
      return "doesn't exist";
    }

    if (!(await FsPoly.isSymlink(linkPath))) {
      return 'is not a symlink';
    }

    const existingSourcePath = await FsPoly.readlink(linkPath);
    if (path.normalize(existingSourcePath) !== path.normalize(expectedTargetPath)) {
      return `has the target path '${existingSourcePath}', expected '${expectedTargetPath}`;
    }

    if (!(await FsPoly.exists(await FsPoly.readlinkResolved(linkPath)))) {
      return `has the target path '${existingSourcePath}' which doesn't exist`;
    }

    return undefined;
  }

  private static async testWrittenHardlink(
    linkPath: string,
    inputRomPath: string,
  ): Promise<string | undefined> {
    if (!(await FsPoly.exists(linkPath))) {
      return "doesn't exist";
    }

    const targetInode = await FsPoly.inode(linkPath);
    const sourceInode = await FsPoly.inode(inputRomPath);
    if (targetInode !== sourceInode) {
      return `references a different file than '${inputRomPath}'`;
    }

    return undefined;
  }
}
