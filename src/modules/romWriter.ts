import { Semaphore } from 'async-mutex';
import fs from 'fs';
import path from 'path';
import util from 'util';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Constants from '../constants.js';
import ElasticSemaphore from '../elasticSemaphore.js';
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
  private static readonly THREAD_SEMAPHORE = new Semaphore(Constants.ROM_WRITER_THREADS);

  // WARN(cemmer): there is an undocumented semaphore max value that can be used, the full
  //  4,700,372,992 bytes of a DVD+R will cause runExclusive() to never run or return.
  private static readonly FILESIZE_SEMAPHORE = new ElasticSemaphore(
    Constants.MAX_READ_WRITE_CONCURRENT_KILOBYTES,
  );

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
    await this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
    await this.progressBar.reset(parentsToCandidates.size);

    await Promise.all([...parentsToCandidates.entries()].map(
      async ([parent, releaseCandidates]) => ROMWriter.THREAD_SEMAPHORE.runExclusive(async () => {
        await this.progressBar.logTrace(`${dat.getName()}: ${parent.getName()}: writing ${releaseCandidates.length.toLocaleString()} candidate${releaseCandidates.length !== 1 ? 's' : ''}`);

        /* eslint-disable no-await-in-loop */
        for (let j = 0; j < releaseCandidates.length; j += 1) {
          const releaseCandidate = releaseCandidates[j];
          await this.writeReleaseCandidate(dat, releaseCandidate);
        }

        await this.progressBar.increment();
      }),
    ));

    if (this.filesQueuedForDeletion.length) {
      await this.progressBar.logDebug(`${dat.getName()}: Deleting moved files`);
      await this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
      await this.deleteMovedFiles(dat);
    }

    await this.progressBar.logInfo(`${dat.getName()}: Done writing candidates`);
  }

  private async writeReleaseCandidate(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
  ): Promise<void> {
    const writeNeeded = releaseCandidate.getRomsWithFiles()
      .filter((romWithFiles) => !romWithFiles.getOutputFile().equals(romWithFiles.getInputFile()))
      .some((notEq) => notEq);
    if (!writeNeeded) {
      return;
    }

    const totalKilobytes = releaseCandidate.getRomsWithFiles()
      .reduce((sum, romWithFiles) => sum + romWithFiles.getInputFile().getSize(), 0) / 1024;
    await ROMWriter.FILESIZE_SEMAPHORE.runExclusive(async () => {
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
      await util.promisify(fs.mkdir)(outputDir, { recursive: true });
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

    // If the output file already exists, and we're not overwriting, then do nothing
    if (!this.options.getOverwrite() && await fsPoly.exists(outputZip.getFilePath())) {
      // But if we're testing, test the file we're not overwriting
      if (this.options.shouldTest()) {
        const existingTest = await this.testZipContents(
          dat,
          outputZip,
          [...inputToOutputZipEntries.values()],
        );
        if (existingTest) {
          await this.progressBar.logWarn(`${dat.getName()}: ${outputZip.getFilePath()}: not overwriting existing zip, but existing zip ${existingTest}`);
          return;
        }
        await this.progressBar.logTrace(`${dat.getName()}: ${outputZip.getFilePath()}: not overwriting existing zip, but existing zip has the expected contents`);
        return;
      }
      await this.progressBar.logTrace(`${dat.getName()}: ${outputZip.getFilePath()}: not overwriting existing zip`);
      return;
    }

    if (!await this.writeZipFile(dat, outputZip, inputToOutputZipEntries)) {
      // It's expected that an error was already logged
      return;
    }

    if (this.options.shouldTest()) {
      const writtenTest = await this.testZipContents(
        dat,
        outputZip,
        [...inputToOutputZipEntries.values()],
      );
      if (writtenTest) {
        await this.progressBar.logError(`${dat.getName()}: ${outputZip.getFilePath()}: written zip ${writtenTest}`);
        return;
      }
    }

    [...inputToOutputZipEntries.keys()]
      .forEach((inputRomFile) => this.enqueueFileDeletion(inputRomFile));
  }

  private async testZipContents(
    dat: DAT,
    outputZip: Zip,
    expectedArchiveEntries: ArchiveEntry<Zip>[],
  ): Promise<string | undefined> {
    await this.progressBar.logTrace(`${dat.getName()}: ${outputZip.getFilePath()}: testing zip`);

    const expectedEntriesByPath = expectedArchiveEntries
      .reduce((map, entry) => {
        map.set(entry.getEntryPath(), entry);
        return map;
      }, new Map<string, ArchiveEntry<Zip>>());

    let archiveEntries: ArchiveEntry<Zip>[];
    try {
      archiveEntries = await outputZip.getArchiveEntries();
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
        await this.progressBar.logWarn(`${dat.getName()}: ${expectedFile.toString()}: can't test, expected CRC is unknown`);
        // eslint-disable-next-line no-continue
        continue;
      }
      const actualFile = actualEntriesByPath.get(entryPath) as ArchiveEntry<Zip>;
      if (actualFile.getCrc32() !== expectedFile.getCrc32()) {
        return `has the file ${entryPath} with the CRC ${actualFile.getCrc32()}, expected ${expectedFile.getCrc32()}`;
      }
    }

    await this.progressBar.logTrace(`${dat.getName()}: ${outputZip.getFilePath()}: test passed`);
    return undefined;
  }

  private async writeZipFile(
    dat: DAT,
    outputZip: Zip,
    inputToOutputZipEntries: Map<File, ArchiveEntry<Zip>>,
  ): Promise<boolean> {
    await this.progressBar.logTrace(`${dat.getName()}: ${outputZip.getFilePath()}: writing ${inputToOutputZipEntries.size.toLocaleString()} archive entries`);

    await this.progressBar.logTrace(`${dat.getName()}: ${outputZip.getFilePath()}: writing ${inputToOutputZipEntries.size.toLocaleString()} archive entries`);

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
      // TODO(cemmer): test
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

    // If the output file already exists, and we're not overwriting, do nothing
    if (!this.options.getOverwrite() && await fsPoly.exists(outputFilePath)) {
      if (this.options.shouldTest()) {
        const existingTest = await this.testWrittenRaw(dat, outputFilePath, outputRomFile);
        if (existingTest) {
          await this.progressBar.logWarn(`${dat.getName()}: ${outputFilePath}: not overwriting existing file, but existing file ${existingTest}`);
          return;
        }
        await this.progressBar.logTrace(`${dat.getName()}: ${outputFilePath}: not overwriting existing file, but existing file is what was expected`);
        return;
      }
      await this.progressBar.logTrace(`${dat.getName()}: ${outputFilePath}: not overwriting existing file`);
      return;
    }

    if (!await this.writeRawFile(dat, inputRomFile, outputFilePath)) {
      // It's expected that an error was already logged
      return;
    }
    if (this.options.shouldTest()) {
      const writtenTest = await this.testWrittenRaw(dat, outputFilePath, outputRomFile);
      if (writtenTest) {
        await this.progressBar.logError(`${dat.getName()}: ${outputFilePath}: written file ${writtenTest}`);
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

    await this.progressBar.logTrace(`${dat.getName()}: ${inputRomFile.toString()} writing to ${outputFilePath}`);

    try {
      await ROMWriter.ensureOutputDirExists(outputFilePath);
      const tempRawFile = await fsPoly.mktemp(outputFilePath);
      await inputRomFile.extractAndPatchToFile(tempRawFile, removeHeader);
      await fsPoly.mv(tempRawFile, outputFilePath);
      return true;
    } catch (e) {
      await this.progressBar.logError(`${dat.getName()}: ${inputRomFile.toString()}: failed to copy to ${outputFilePath} : ${e}`);
      return false;
    }
  }

  private async testWrittenRaw(
    dat: DAT,
    outputFilePath: string,
    expectedFile: File,
  ): Promise<string | undefined> {
    await this.progressBar.logTrace(`${dat.getName()}: ${outputFilePath}: testing raw`);

    // Check checksum
    if (expectedFile.getCrc32() === '00000000') {
      await this.progressBar.logWarn(`${dat.getName()}: ${outputFilePath}: can't test, expected CRC is unknown`);
      return undefined;
    }
    const actualFile = await File.fileOf(outputFilePath);
    if (actualFile.getCrc32() !== expectedFile.getCrc32()) {
      return `has the CRC ${actualFile.getCrc32()}, expected ${expectedFile.getCrc32()}`;
    }

    await this.progressBar.logTrace(`${dat.getName()}: ${outputFilePath}: test passed`);
    return undefined;
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
          await this.progressBar.logTrace(`${dat.getName()}: ${filePath}: deleting moved file`);
          try {
            await fsPoly.rm(filePath, { force: true });
          } catch (e) {
            await this.progressBar.logError(`${dat.getName()}: ${filePath}: failed to delete`);
          }
        }),
    );
  }

  /** ************************
   *                         *
   *     Symlink Writing     *
   *                         *
   ************************* */

  private async writeSymlink(dat: DAT, releaseCandidate: ReleaseCandidate): Promise<void> {
    const inputToOutputEntries = releaseCandidate.getRomsWithFiles();

    /* eslint-disable no-await-in-loop */
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
      await this.progressBar.logTrace(`${dat.getName()}: ${outputRomFile}: same file, skipping`);
      return;
    }

    const targetPath = outputRomFile.getFilePath();
    let sourcePath = path.resolve(inputRomFile.getFilePath());
    if (this.options.getSymlinkRelative()) {
      sourcePath = path.relative(path.dirname(targetPath), sourcePath);
    }

    if (await fsPoly.exists(targetPath)) {
      // If the output file already exists, and we're not overwriting, do nothing
      if (!this.options.getOverwrite()) {
        if (this.options.shouldTest()) {
          const existingTest = await ROMWriter.testWrittenSymlink(targetPath, sourcePath);
          if (existingTest) {
            await this.progressBar.logWarn(`${dat.getName()}: ${targetPath}: not overwriting existing symlink, but existing symlink ${existingTest}`);
            return;
          }
          await this.progressBar.logTrace(`${dat.getName()}: ${targetPath}: not overwriting existing symlink, but existing symlink is what was expected`);
          return;
        }
        await this.progressBar.logTrace(`${dat.getName()}: ${targetPath}: not overwriting existing file`);
        return;
      }

      await fsPoly.rm(targetPath);
    }

    try {
      await ROMWriter.ensureOutputDirExists(targetPath);
      await fsPoly.symlink(sourcePath, targetPath);
    } catch (e) {
      await this.progressBar.logError(`${dat.getName()}: ${inputRomFile.toString()}: failed to symlink ${sourcePath} to ${targetPath} : ${e}`);
    }

    if (this.options.shouldTest()) {
      const writtenTest = await ROMWriter.testWrittenSymlink(targetPath, sourcePath);
      if (writtenTest) {
        await this.progressBar.logError(`${dat.getName()}: ${targetPath}: written symlink ${writtenTest}`);
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
