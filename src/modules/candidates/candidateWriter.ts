import os from 'node:os';
import path from 'node:path';

import type CandidateWriterSemaphore from '../../async/candidateWriterSemaphore.js';
import KeyedMutex from '../../async/keyedMutex.js';
import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import ArrayPoly from '../../polyfill/arrayPoly.js';
import type { MoveResultValue } from '../../polyfill/fsPoly.js';
import FsPoly, { MoveResult } from '../../polyfill/fsPoly.js';
import type DAT from '../../types/dats/dat.js';
import ArchiveEntry from '../../types/files/archives/archiveEntry.js';
import Zip from '../../types/files/archives/zip.js';
import File from '../../types/files/file.js';
import { ChecksumBitmask } from '../../types/files/fileChecksums.js';
import type { ZipFormatValue } from '../../types/options.js';
import type Options from '../../types/options.js';
import { LinkMode, ZipFormat } from '../../types/options.js';
import type WriteCandidate from '../../types/writeCandidate.js';
import Module from '../module.js';

export interface CandidateWriterResults {
  wrote: File[];
  moved: File[];
}

/**
 * Copy or move output ROM files, if applicable.
 */
export default class CandidateWriter extends Module {
  // Keep track of written files, to warn on conflicts
  private static readonly OUTPUT_PATHS_WRITTEN = new Map<string, DAT>();

  // When moving input files, process input file paths exclusively
  private static readonly MOVE_MUTEX = new KeyedMutex(1000);

  // When moving input files, keep track of files that have been moved
  private static readonly FILE_PATH_MOVES = new Map<string, string>();

  private readonly options: Options;
  private readonly semaphore: CandidateWriterSemaphore;

  private readonly filesQueuedForDeletion: File[] = [];

  constructor(options: Options, progressBar: ProgressBar, semaphore: CandidateWriterSemaphore) {
    super(progressBar, CandidateWriter.name);
    this.options = options;
    this.semaphore = semaphore;
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
    if (!this.options.shouldWrite() && !this.options.shouldTest()) {
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
      `${dat.getName()}: ${this.options.shouldWrite() ? 'writing' : 'testing'} ${writableCandidates.length.toLocaleString()} candidate${writableCandidates.length === 1 ? '' : 's'}`,
    );
    if (this.options.shouldTest() && !this.options.getOverwrite()) {
      this.progressBar.setSymbol(ProgressBarSymbol.TESTING);
    } else {
      this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
    }
    this.progressBar.resetProgress(writableCandidates.length);

    await this.semaphore.map(writableCandidates, async (candidate) => {
      this.progressBar.incrementInProgress();
      this.progressBar.logTrace(
        `${dat.getName()}: ${candidate.getName()}: ${this.options.shouldWrite() ? 'writing' : 'testing'} candidate`,
      );

      if (this.options.shouldLink()) {
        await this.writeLink(dat, candidate);
      } else {
        await this.writeZip(dat, candidate);
        await this.writeRaw(dat, candidate);
      }

      this.progressBar.logTrace(
        `${dat.getName()}: ${candidate.getName()}: done ${this.options.shouldWrite() ? 'writing' : 'testing'} candidate`,
      );
      this.progressBar.incrementCompleted();
    });

    this.progressBar.logTrace(
      `${dat.getName()}: done ${this.options.shouldWrite() ? 'writing' : 'testing'} ${writableCandidates.length.toLocaleString()} candidate${writableCandidates.length === 1 ? '' : 's'}`,
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

    const childBar = this.progressBar.addChildBar({
      name: outputZip.getFilePath(),
      progressFormatter: FsPoly.sizeReadable,
    });
    try {
      // If the output file already exists, see if we need to do anything
      if (await FsPoly.exists(outputZip.getFilePath())) {
        if (
          this.options.shouldWrite() &&
          !this.options.getOverwrite() &&
          !this.options.getOverwriteInvalid()
        ) {
          if (CandidateWriter.OUTPUT_PATHS_WRITTEN.has(outputZip.getFilePath())) {
            this.progressBar.logWarn(
              `${dat.getName()}: ${candidate.getName()}: ${outputZip.getFilePath()}: not overwriting existing zip file already written by '${CandidateWriter.OUTPUT_PATHS_WRITTEN.get(outputZip.getFilePath())?.getName()}'`,
            );
          } else {
            this.progressBar.logDebug(
              `${dat.getName()}: ${candidate.getName()}: ${outputZip.getFilePath()}: not overwriting existing zip file`,
            );
          }
          return;
        }

        if (!this.options.shouldWrite() || this.options.getOverwriteInvalid()) {
          const existingTest = await this.testZipContents(
            dat,
            candidate,
            outputZip.getFilePath(),
            inputToOutputZipEntries.map(([, outputEntry]) => outputEntry),
          );
          if (this.options.shouldWrite() && !existingTest) {
            this.progressBar.logDebug(
              `${dat.getName()}: ${candidate.getName()}: ${outputZip.getFilePath()}: not overwriting existing zip file, the existing zip is correct`,
            );
            return;
          }
          if (!this.options.shouldWrite() && existingTest) {
            this.progressBar.logError(
              `${dat.getName()}: ${candidate.getName()}: ${outputZip.getFilePath()}: ${existingTest}`,
            );
            return;
          }
        }

        if (
          this.options.shouldWrite() &&
          CandidateWriter.OUTPUT_PATHS_WRITTEN.has(outputZip.getFilePath())
        ) {
          this.progressBar.logWarn(
            `${dat.getName()}: ${candidate.getName()}: ${outputZip.getFilePath()}: overwriting existing zip file already written by '${CandidateWriter.OUTPUT_PATHS_WRITTEN.get(outputZip.getFilePath())?.getName()}'`,
          );
        }
      }
      if (!this.options.shouldWrite()) {
        return;
      }

      CandidateWriter.OUTPUT_PATHS_WRITTEN.set(outputZip.getFilePath(), dat);

      this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
      let written = false;
      for (let i = 0; i <= this.options.getWriteRetry(); i += 1) {
        written = await this.writeZipFile(
          dat,
          candidate,
          outputZip,
          inputToOutputZipEntries,
          childBar,
        );

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

      inputToOutputZipEntries.forEach(([inputRomFile]) => {
        this.enqueueFileDeletion(inputRomFile);
      });
    } finally {
      childBar.delete();
    }
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

    const zipFile = new Zip(zipFilePath);

    const expectedEntriesByPath = expectedArchiveEntries.reduce((map, entry) => {
      map.set(entry.getEntryPath(), entry);
      return map;
    }, new Map<string, ArchiveEntry<Zip>>());

    const checksumBitmask = expectedArchiveEntries.reduce<number>(
      (bitmask, entry) => bitmask | entry.getChecksumBitmask(),
      ChecksumBitmask.CRC32,
    );

    let archiveEntries: ArchiveEntry<Zip>[];
    try {
      archiveEntries = await zipFile.getArchiveEntries(checksumBitmask);
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

    for (const [entryPath, expectedFile] of expectedEntriesByPath.entries()) {
      // Check existence
      if (!actualEntriesByPath.has(entryPath)) {
        return `is missing the file ${entryPath}`;
      }

      // Check checksum
      const actualFile = actualEntriesByPath.get(entryPath) as ArchiveEntry<Zip>;
      if (
        actualFile.getSha256() &&
        expectedFile.getSha256() &&
        actualFile.getSha256() !== expectedFile.getSha256()
      ) {
        return `entry '${entryPath}' has the SHA256 ${actualFile.getSha256()}, expected ${expectedFile.getSha256()}`;
      }
      if (
        actualFile.getSha1() &&
        expectedFile.getSha1() &&
        actualFile.getSha1() !== expectedFile.getSha1()
      ) {
        return `entry '${entryPath}' has the SHA1 ${actualFile.getSha1()}, expected ${expectedFile.getSha1()}`;
      }
      if (
        actualFile.getMd5() &&
        expectedFile.getMd5() &&
        actualFile.getMd5() !== expectedFile.getMd5()
      ) {
        return `entry '${entryPath}' has the MD5 ${actualFile.getMd5()}, expected ${expectedFile.getMd5()}`;
      }
      if (
        actualFile.getCrc32() &&
        expectedFile.getCrc32() &&
        expectedFile.getCrc32() !== '00000000' &&
        actualFile.getCrc32() !== expectedFile.getCrc32()
      ) {
        return `entry '${entryPath}' has the CRC32 ${actualFile.getCrc32()}, expected ${expectedFile.getCrc32()}`;
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
          return `entry '${entryPath}' has the file ${entryPath} of size ${actualFile.getSize().toLocaleString()}B, expected ${expectedFile.getSize().toLocaleString()}B`;
        }
      }
    }

    if (this.options.getZipFormat() === ZipFormat.TORRENTZIP && !(await zipFile.isTorrentZip())) {
      return 'is not a valid TorrentZip file';
    }

    if (this.options.getZipFormat() === ZipFormat.RVZSTD && !(await zipFile.isRVZSTD())) {
      return 'is not a valid RVZSTD file';
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
    progressBar: ProgressBar,
  ): Promise<boolean> {
    this.progressBar.logInfo(
      [
        `${dat.getName()}: ${candidate.getName()}: creating zip archive '${outputZip.getFilePath()}' with the entries:`,
        inputToOutputZipEntries.map(([input, output]) => {
          if (input.getFilePath() === output.getFilePath()) {
            return `  '${input.getExtractedFilePath()}' (${FsPoly.sizeReadable(input.getSize())}) → '${output.getExtractedFilePath()}' ${input.getExtractedFilePath() === output.getExtractedFilePath() ? '(rewriting)' : ''}`;
          }
          return `  '${input.toString()}' (${FsPoly.sizeReadable(input.getSize())}) → '${output.getExtractedFilePath()}'`;
        }),
      ].join('\n'),
    );

    this.progressBar.logInfo(
      `${dat.getName()}: ${candidate.getName()}: creating zip archive '${outputZip.getFilePath()}' with the entries:\n${inputToOutputZipEntries.map(([input, output]) => `  '${input.toString()}' (${FsPoly.sizeReadable(input.getSize())}) → '${output.getEntryPath()}'`).join('\n')}`,
    );

    // The same input file may have contention with being raw-moved and used as an input file
    // for a zip (here), so we need to lock all input paths if we're moving
    const lockedFilePaths = this.options.shouldMove()
      ? inputToOutputZipEntries
          .map(([input]) => input.getFilePath())
          .reduce(ArrayPoly.reduceUnique(), [])
      : [];
    return await CandidateWriter.MOVE_MUTEX.runExclusiveForKeys(lockedFilePaths, async () => {
      try {
        await CandidateWriter.ensureOutputDirExists(outputZip.getFilePath());
        const compressorThreads = Math.ceil(
          os.cpus().length / Math.max(this.semaphore.openLocks(), 1),
        );
        await outputZip.createArchive(
          inputToOutputZipEntries,
          this.options.getZipFormat() as ZipFormatValue,
          compressorThreads,
          (progress, total) => {
            progressBar.setCompleted(progress);
            progressBar.setTotal(total);
          },
        );
      } catch (error) {
        this.progressBar.logError(
          `${dat.getName()}: ${candidate.getName()}: ${outputZip.getFilePath()}: failed to create zip: ${error}`,
        );
        return false;
      }

      this.progressBar.logTrace(
        `${dat.getName()}: ${candidate.getName()}: ${outputZip.getFilePath()}: wrote ${inputToOutputZipEntries.length.toLocaleString()} archive entr${inputToOutputZipEntries.length === 1 ? 'y' : 'ies'}`,
      );
      return true;
    });
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
      `${dat.getName()}: ${candidate.getName()}: writing ${FsPoly.sizeReadable(totalBytes)} of ${uniqueInputToOutputEntries.length.toLocaleString()} file${uniqueInputToOutputEntries.length === 1 ? '' : 's'}`,
    );

    // Group the input->output pairs by the input file's path. The goal is to extract entries from
    // the same input archive at the same time, to benefit from batch extraction.
    const uniqueInputToOutputEntriesMap = uniqueInputToOutputEntries.reduce(
      (map, [inputRomFile, outputRomFile]) => {
        const key = inputRomFile.getFilePath();
        if (map.has(key)) {
          map.get(key)?.push([inputRomFile, outputRomFile]);
        } else {
          map.set(key, [[inputRomFile, outputRomFile]]);
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
    if (this.options.shouldWrite() && outputRomFile.equals(inputRomFile)) {
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

    const childBar = this.progressBar.addChildBar({
      name: outputFilePath,
      progressFormatter: FsPoly.sizeReadable,
    });
    try {
      // If the output file already exists, see if we need to do anything
      if (await FsPoly.exists(outputFilePath)) {
        if (
          this.options.shouldWrite() &&
          !this.options.getOverwrite() &&
          !this.options.getOverwriteInvalid()
        ) {
          if (CandidateWriter.OUTPUT_PATHS_WRITTEN.has(outputFilePath)) {
            this.progressBar.logWarn(
              `${dat.getName()}: ${candidate.getName()}: ${outputFilePath}: not overwriting existing file already written by '${CandidateWriter.OUTPUT_PATHS_WRITTEN.get(outputFilePath)?.getName()}'`,
            );
          } else {
            this.progressBar.logDebug(
              `${dat.getName()}: ${candidate.getName()}: ${outputFilePath}: not overwriting existing file`,
            );
          }
          return;
        }

        if (!this.options.shouldWrite() || this.options.getOverwriteInvalid()) {
          const existingTest = await this.testWrittenRaw(
            dat,
            candidate,
            outputFilePath,
            outputRomFile,
          );
          if (this.options.shouldWrite() && !existingTest) {
            this.progressBar.logDebug(
              `${dat.getName()}: ${candidate.getName()}: ${outputFilePath}: not overwriting existing file, the existing file is correct`,
            );
            return;
          }
          if (!this.options.shouldWrite() && existingTest) {
            this.progressBar.logError(
              `${dat.getName()}: ${candidate.getName()}: ${outputFilePath}: ${existingTest}`,
            );
            return;
          }
        }

        if (
          this.options.shouldWrite() &&
          CandidateWriter.OUTPUT_PATHS_WRITTEN.has(outputFilePath)
        ) {
          this.progressBar.logWarn(
            `${dat.getName()}: ${candidate.getName()}: ${outputFilePath}: overwriting existing file already written by '${CandidateWriter.OUTPUT_PATHS_WRITTEN.get(outputFilePath)?.getName()}'`,
          );
        }
      }
      if (!this.options.shouldWrite()) {
        return;
      }

      CandidateWriter.OUTPUT_PATHS_WRITTEN.set(outputFilePath, dat);

      this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
      let written: MoveResultValue | undefined;
      for (let i = 0; i <= this.options.getWriteRetry(); i += 1) {
        if (this.options.shouldMove()) {
          written = await this.moveRawFile(dat, candidate, inputRomFile, outputFilePath, childBar);
        } else {
          written = await this.copyRawFile(dat, candidate, inputRomFile, outputFilePath, childBar);
        }

        if (written !== undefined && !this.options.shouldTest()) {
          // Successfully written, unknown if valid
          break;
        }
        if (written === MoveResult.COPIED && this.options.shouldTest()) {
          // Only test the output file if it was copied, we don't need to test the file if it was
          // just renamed
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
    } finally {
      childBar.delete();
    }
  }

  private async moveRawFile(
    dat: DAT,
    candidate: WriteCandidate,
    inputRomFile: File,
    outputFilePath: string,
    progressBar: ProgressBar,
  ): Promise<MoveResultValue | undefined> {
    // Lock the input file, we can't handle concurrent moves
    return CandidateWriter.MOVE_MUTEX.runExclusiveForKey(inputRomFile.getFilePath(), async () => {
      const movedInputPath = CandidateWriter.FILE_PATH_MOVES.get(inputRomFile.getFilePath());
      if (movedInputPath) {
        if (movedInputPath === outputFilePath) {
          // Do nothing
          return undefined;
        }

        // The file was already moved, we shouldn't move it again
        return this.copyRawFile(
          dat,
          candidate,
          inputRomFile.withFilePath(movedInputPath),
          outputFilePath,
          progressBar,
        );
      }

      if (
        inputRomFile instanceof ArchiveEntry ||
        inputRomFile.getFileHeader() !== undefined ||
        inputRomFile.getPatch() !== undefined
      ) {
        // The file can't be moved as-is, it needs to get copied
        return this.copyRawFile(dat, candidate, inputRomFile, outputFilePath, progressBar);
      }

      this.progressBar.logInfo(
        `${dat.getName()}: ${candidate.getName()}: moving file '${inputRomFile.toString()}' (${FsPoly.sizeReadable(inputRomFile.getSize())}) → '${outputFilePath}'`,
      );

      try {
        await CandidateWriter.ensureOutputDirExists(outputFilePath);

        const moveResult = await FsPoly.mv(
          inputRomFile.getFilePath(),
          outputFilePath,
          (progress) => {
            progressBar.setCompleted(progress);
          },
        );
        CandidateWriter.FILE_PATH_MOVES.set(inputRomFile.getFilePath(), outputFilePath);
        return moveResult;
      } catch (error) {
        this.progressBar.logError(
          `${dat.getName()}: ${candidate.getName()}: failed to move file '${inputRomFile.toString()}' → '${outputFilePath}': ${error}`,
        );
        return undefined;
      }
    });
  }

  private async copyRawFile(
    dat: DAT,
    candidate: WriteCandidate,
    inputRomFile: File,
    outputFilePath: string,
    progressBar: ProgressBar,
  ): Promise<MoveResultValue | undefined> {
    this.progressBar.logInfo(
      `${dat.getName()}: ${candidate.getName()}: ${inputRomFile instanceof ArchiveEntry ? 'extracting' : 'copying'} file '${inputRomFile.toString()}' (${FsPoly.sizeReadable(inputRomFile.getSize())}) → '${outputFilePath}'`,
    );

    try {
      await CandidateWriter.ensureOutputDirExists(outputFilePath);

      const tempRawFile = await FsPoly.mktemp(outputFilePath);
      await inputRomFile.extractAndPatchToFile(tempRawFile, (progress) => {
        progressBar.setCompleted(progress);
      });
      await FsPoly.mv(tempRawFile, outputFilePath);
      return MoveResult.COPIED;
    } catch (error) {
      this.progressBar.logError(
        `${dat.getName()}: ${candidate.getName()}: failed to ${inputRomFile instanceof ArchiveEntry ? 'extract' : 'copy'} file '${inputRomFile.toString()}' → '${outputFilePath}': ${error}`,
      );
      return undefined;
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
    let targetPath = path.resolve(inputRomFile.getFilePath());
    if (this.options.getLinkMode() === LinkMode.SYMLINK && this.options.getSymlinkRelative()) {
      await CandidateWriter.ensureOutputDirExists(linkPath);
      targetPath = await FsPoly.symlinkRelativePath(targetPath, linkPath);
    }

    // If the output file already exists, see if we need to do anything
    if (await FsPoly.exists(linkPath)) {
      if (
        this.options.shouldWrite() &&
        !this.options.getOverwrite() &&
        !this.options.getOverwriteInvalid()
      ) {
        if (CandidateWriter.OUTPUT_PATHS_WRITTEN.has(linkPath)) {
          this.progressBar.logWarn(
            `${dat.getName()}: ${candidate.getName()}: ${linkPath}: not overwriting existing file already written by '${CandidateWriter.OUTPUT_PATHS_WRITTEN.get(linkPath)?.getName()}'`,
          );
        } else {
          this.progressBar.logDebug(
            `${dat.getName()}: ${candidate.getName()}: ${linkPath}: not overwriting existing file`,
          );
        }
        return;
      }

      if (!this.options.shouldWrite() || this.options.getOverwriteInvalid()) {
        let existingTest;
        if (this.options.getLinkMode() === LinkMode.SYMLINK) {
          existingTest = await CandidateWriter.testWrittenSymlink(linkPath, targetPath);
        } else if (this.options.getLinkMode() === LinkMode.HARDLINK) {
          existingTest = await CandidateWriter.testWrittenHardlink(
            linkPath,
            inputRomFile.getFilePath(),
          );
        } else {
          existingTest = await this.testWrittenRaw(dat, candidate, linkPath, outputRomFile);
        }
        if (this.options.shouldWrite() && !existingTest) {
          this.progressBar.logDebug(
            `${dat.getName()}: ${candidate.getName()}: ${linkPath}: not overwriting existing link, the existing link is correct`,
          );
          return;
        }
        if (!this.options.shouldWrite() && existingTest) {
          this.progressBar.logError(
            `${dat.getName()}: ${candidate.getName()}: ${linkPath}: ${existingTest}`,
          );
          return;
        }
      }

      if (this.options.shouldWrite() && CandidateWriter.OUTPUT_PATHS_WRITTEN.has(linkPath)) {
        this.progressBar.logWarn(
          `${dat.getName()}: ${candidate.getName()}: ${linkPath}: overwriting existing zip file already written by '${CandidateWriter.OUTPUT_PATHS_WRITTEN.get(linkPath)?.getName()}'`,
        );
      }
    }
    if (!this.options.shouldWrite()) {
      return;
    }

    CandidateWriter.OUTPUT_PATHS_WRITTEN.set(linkPath, dat);

    this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
    for (let i = 0; i <= this.options.getWriteRetry(); i += 1) {
      const written = await this.writeRawLink(dat, candidate, targetPath, linkPath);

      if (written && !this.options.shouldTest()) {
        // Successfully written, unknown if valid
        break;
      }
      if (written && this.options.shouldTest()) {
        let writtenTest;
        if (this.options.getLinkMode() === LinkMode.SYMLINK) {
          writtenTest = await CandidateWriter.testWrittenSymlink(linkPath, targetPath);
        } else if (this.options.getLinkMode() === LinkMode.HARDLINK) {
          writtenTest = await CandidateWriter.testWrittenHardlink(
            linkPath,
            inputRomFile.getFilePath(),
          );
        } else {
          writtenTest = await this.testWrittenRaw(dat, candidate, linkPath, outputRomFile);
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
      if (this.options.getLinkMode() === LinkMode.SYMLINK) {
        this.progressBar.logInfo(
          `${dat.getName()}: ${candidate.getName()}: creating symlink '${targetPath}' → '${linkPath}'`,
        );
        await FsPoly.symlink(targetPath, linkPath);
      } else if (this.options.getLinkMode() === LinkMode.HARDLINK) {
        this.progressBar.logInfo(
          `${dat.getName()}: ${candidate.getName()}: creating hard link '${targetPath}' → '${linkPath}'`,
        );
        await FsPoly.hardlink(targetPath, linkPath);
      } else {
        this.progressBar.logInfo(
          `${dat.getName()}: ${candidate.getName()}: creating reflink '${targetPath}' → '${linkPath}'`,
        );
        await FsPoly.reflink(targetPath, linkPath);
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
