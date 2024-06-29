import os from 'node:os';
import path from 'node:path';

import async from 'async';
import chalk from 'chalk';
import isAdmin from 'is-admin';

import Logger from './console/logger.js';
import ProgressBar, { ProgressBarSymbol } from './console/progressBar.js';
import ProgressBarCLI from './console/progressBarCli.js';
import Package from './globals/package.js';
import Temp from './globals/temp.js';
import CandidateArchiveFileHasher from './modules/candidateArchiveFileHasher.js';
import CandidateCombiner from './modules/candidateCombiner.js';
import CandidateGenerator from './modules/candidateGenerator.js';
import CandidateMergeSplitValidator from './modules/candidateMergeSplitValidator.js';
import CandidatePatchGenerator from './modules/candidatePatchGenerator.js';
import CandidatePostProcessor from './modules/candidatePostProcessor.js';
import CandidatePreferer from './modules/candidatePreferer.js';
import CandidateWriter from './modules/candidateWriter.js';
import DATCombiner from './modules/datCombiner.js';
import DATFilter from './modules/datFilter.js';
import DATGameInferrer from './modules/datGameInferrer.js';
import DATMergerSplitter from './modules/datMergerSplitter.js';
import DATParentInferrer from './modules/datParentInferrer.js';
import DATScanner from './modules/datScanner.js';
import Dir2DatCreator from './modules/dir2DatCreator.js';
import DirectoryCleaner from './modules/directoryCleaner.js';
import FixdatCreator from './modules/fixdatCreator.js';
import MovedROMDeleter from './modules/movedRomDeleter.js';
import PatchScanner from './modules/patchScanner.js';
import ReportGenerator from './modules/reportGenerator.js';
import ROMHeaderProcessor from './modules/romHeaderProcessor.js';
import ROMIndexer from './modules/romIndexer.js';
import ROMScanner from './modules/romScanner.js';
import StatusGenerator from './modules/statusGenerator.js';
import ArrayPoly from './polyfill/arrayPoly.js';
import FsPoly from './polyfill/fsPoly.js';
import Timer from './timer.js';
import DAT from './types/dats/dat.js';
import Parent from './types/dats/parent.js';
import DATStatus from './types/datStatus.js';
import File from './types/files/file.js';
import FileCache from './types/files/fileCache.js';
import { ChecksumBitmask } from './types/files/fileChecksums.js';
import IndexedFiles from './types/indexedFiles.js';
import Options from './types/options.js';
import OutputFactory from './types/outputFactory.js';
import Patch from './types/patches/patch.js';
import ReleaseCandidate from './types/releaseCandidate.js';

/**
 * The main class that coordinates file scanning, processing, and writing.
 */
export default class Igir {
  private readonly options: Options;

  private readonly logger: Logger;

  constructor(options: Options, logger: Logger) {
    this.options = options;
    this.logger = logger;
  }

  /**
   * The main method for this application.
   */
  async main(): Promise<void> {
    Temp.setTempDir(this.options.getTempDir());

    // Windows 10 may require admin privileges to symlink at all
    // @see https://github.com/nodejs/node/issues/18518
    if (this.options.shouldLink()
      && this.options.getSymlink()
      && process.platform === 'win32'
    ) {
      this.logger.trace('checking Windows for symlink permissions');
      if (!await FsPoly.canSymlink(Temp.getTempDir())) {
        if (!await isAdmin()) {
          throw new Error(`${Package.NAME} does not have permissions to create symlinks, please try running as administrator`);
        }
        throw new Error(`${Package.NAME} does not have permissions to create symlinks`);
      }
      this.logger.trace('Windows has symlink permissions');
    }

    // File cache options
    if (this.options.getDisableCache()) {
      this.logger.trace('disabling the file cache');
      FileCache.disable();
    } else {
      const cachePath = await this.getCachePath();
      if (cachePath !== undefined && process.env.NODE_ENV !== 'test') {
        this.logger.trace(`loading the file cache at '${cachePath}'`);
        await FileCache.loadFile(cachePath);
      } else {
        this.logger.trace('not using a file for the file cache');
      }
    }

    // Scan and process input files
    let dats = await this.processDATScanner();
    const indexedRoms = await this.processROMScanner(this.determineScanningBitmask(dats));
    const roms = indexedRoms.getFiles();
    const patches = await this.processPatchScanner();

    // Set up progress bar and input for DAT processing
    const datProcessProgressBar = await this.logger.addProgressBar(chalk.underline('Processing DATs'), ProgressBarSymbol.NONE, dats.length);
    if (dats.length === 0) {
      dats = new DATGameInferrer(this.options, datProcessProgressBar).infer(roms);
    }

    const datsToWrittenFiles = new Map<DAT, File[]>();
    let romOutputDirs: string[] = [];
    let movedRomsToDelete: File[] = [];
    const datsStatuses: DATStatus[] = [];

    // Process every DAT
    datProcessProgressBar.logTrace(`processing ${dats.length.toLocaleString()} DAT${dats.length !== 1 ? 's' : ''}`);
    await async.eachLimit(dats, this.options.getDatThreads(), async (dat, callback) => {
      await datProcessProgressBar.incrementProgress();

      const progressBar = await this.logger.addProgressBar(
        dat.getNameShort(),
        ProgressBarSymbol.WAITING,
        dat.getParents().length,
      );

      const datWithParents = await new DATParentInferrer(this.options, progressBar).infer(dat);
      const mergedSplitDat = await new DATMergerSplitter(this.options, progressBar)
        .merge(datWithParents);
      const filteredDat = await new DATFilter(this.options, progressBar).filter(mergedSplitDat);

      // Generate and filter ROM candidates
      const parentsToCandidates = await this.generateCandidates(
        progressBar,
        filteredDat,
        indexedRoms,
        patches,
      );
      romOutputDirs = [
        ...romOutputDirs,
        ...this.getCandidateOutputDirs(filteredDat, parentsToCandidates),
      ];

      // Write the output files
      const writerResults = await new CandidateWriter(this.options, progressBar)
        .write(filteredDat, parentsToCandidates);
      movedRomsToDelete = [...movedRomsToDelete, ...writerResults.moved];
      datsToWrittenFiles.set(filteredDat, writerResults.wrote);

      // Write a dir2dat
      const dir2DatPath = await new Dir2DatCreator(this.options, progressBar)
        .create(filteredDat);
      if (dir2DatPath) {
        datsToWrittenFiles.set(filteredDat, [
          ...(datsToWrittenFiles.get(filteredDat) ?? []),
          await File.fileOf({ filePath: dir2DatPath }, ChecksumBitmask.NONE),
        ]);
      }

      // Write a fixdat
      const fixdatPath = await new FixdatCreator(this.options, progressBar)
        .create(filteredDat, parentsToCandidates);
      if (fixdatPath) {
        datsToWrittenFiles.set(filteredDat, [
          ...(datsToWrittenFiles.get(filteredDat) ?? []),
          await File.fileOf({ filePath: fixdatPath }, ChecksumBitmask.NONE),
        ]);
      }

      // Write the output report
      const datStatus = new StatusGenerator(this.options, progressBar)
        .generate(filteredDat, parentsToCandidates);
      datsStatuses.push(datStatus);
      await progressBar.done([
        datStatus.toConsole(this.options),
        dir2DatPath ? `dir2dat: ${dir2DatPath}` : undefined,
        fixdatPath ? `Fixdat: ${fixdatPath}` : undefined,
      ].filter((line) => line).join('\n'));

      // Progress bar cleanup
      const totalReleaseCandidates = [...parentsToCandidates.values()]
        .reduce((sum, rcs) => sum + rcs.length, 0);
      if (totalReleaseCandidates > 0) {
        await progressBar.freeze();
      } else {
        progressBar.delete();
      }

      await datProcessProgressBar.incrementDone();
      callback();
    });
    datProcessProgressBar.logTrace(`done processing ${dats.length.toLocaleString()} DAT${dats.length !== 1 ? 's' : ''}`);

    await datProcessProgressBar.doneItems(dats.length, 'DAT', 'processed');
    datProcessProgressBar.delete();

    // Delete moved ROMs
    await this.deleteMovedRoms(roms, movedRomsToDelete, datsToWrittenFiles);

    // Clean the output directories
    const cleanedOutputFiles = await this.processOutputCleaner(romOutputDirs, datsToWrittenFiles);

    // Generate the report
    await this.processReportGenerator(roms, cleanedOutputFiles, datsStatuses);

    await ProgressBarCLI.stop();

    Timer.cancelAll();
  }

  private async getCachePath(): Promise<string | undefined> {
    const defaultFileName = `${Package.NAME}.cache`;

    // Try to use the provided path
    let cachePath = this.options.getCachePath();
    if (cachePath !== undefined && await FsPoly.isDirectory(cachePath)) {
      cachePath = path.join(cachePath, defaultFileName);
      this.logger.warn(`A directory was provided for cache path instead of a file, using '${cachePath}' instead`);
    }
    if (cachePath !== undefined) {
      if (await FsPoly.isWritable(cachePath)) {
        return cachePath;
      }
      this.logger.warn('Provided cache path isn\'t writable, using the default path');
    }

    // Otherwise, use a default path
    return [
      path.join(path.resolve(Package.DIRECTORY), defaultFileName),
      path.join(os.homedir(), defaultFileName),
      path.join(process.cwd(), defaultFileName),
    ]
      .filter((filePath) => filePath && !filePath.startsWith(os.tmpdir()))
      .find(async (filePath) => {
        if (await FsPoly.exists(filePath)) {
          return true;
        }
        return FsPoly.isWritable(filePath);
      });
  }

  private async processDATScanner(): Promise<DAT[]> {
    if (this.options.shouldDir2Dat()) {
      return [];
    }
    if (!this.options.usingDats()) {
      this.logger.warn('No DAT files provided, consider using some for the best results!');
      return [];
    }

    const progressBar = await this.logger.addProgressBar('Scanning for DATs');
    let dats = await new DATScanner(this.options, progressBar).scan();
    if (dats.length === 0) {
      throw new Error('No valid DAT files found!');
    }

    if (dats.length === 1) {
      ([
        [this.options.getDirDatName(), '--dir-dat-name'],
        [this.options.getDirDatDescription(), '--dir-dat-description'],
      ] satisfies [boolean, string][])
        .filter(([bool]) => bool)
        .forEach(([, option]) => {
          progressBar.logWarn(`${option} is most helpful when processing multiple DATs, only one DAT was found`);
        });
    }

    if (this.options.getDatCombine()) {
      await progressBar.reset(1);
      dats = [new DATCombiner(progressBar).combine(dats)];
    }

    await progressBar.doneItems(dats.length, 'DAT', 'found');
    await progressBar.freeze();
    return dats;
  }

  private determineScanningBitmask(dats: DAT[]): number {
    const minimumChecksum = this.options.getInputMinChecksum() ?? ChecksumBitmask.CRC32;
    let matchChecksum = minimumChecksum;

    if (this.options.shouldDir2Dat()) {
      Object.keys(ChecksumBitmask)
        .filter((bitmask): bitmask is keyof typeof ChecksumBitmask => Number.isNaN(Number(bitmask)))
        // Has not been enabled yet
        .filter((bitmask) => ChecksumBitmask[bitmask] >= ChecksumBitmask.CRC32)
        .filter((bitmask) => ChecksumBitmask[bitmask] <= ChecksumBitmask.SHA1)
        .filter((bitmask) => !(matchChecksum & ChecksumBitmask[bitmask]))
        .forEach((bitmask) => {
          matchChecksum |= ChecksumBitmask[bitmask];
          this.logger.trace(`generating a dir2dat, enabling ${bitmask} file checksums`);
        });
    }

    dats.forEach((dat) => {
      const datMinimumBitmask = dat.getRequiredChecksumBitmask();
      Object.keys(ChecksumBitmask)
        .filter((bitmask): bitmask is keyof typeof ChecksumBitmask => Number.isNaN(Number(bitmask)))
        // Has not been enabled yet
        .filter((bitmask) => ChecksumBitmask[bitmask] > minimumChecksum)
        .filter((bitmask) => !(matchChecksum & ChecksumBitmask[bitmask]))
        // Should be enabled for this DAT
        .filter((bitmask) => datMinimumBitmask & ChecksumBitmask[bitmask])
        .forEach((bitmask) => {
          matchChecksum |= ChecksumBitmask[bitmask];
          this.logger.trace(`${dat.getNameShort()}: needs ${bitmask} file checksums, enabling`);
        });
    });

    return matchChecksum;
  }

  private async processROMScanner(checksumBitmask: number): Promise<IndexedFiles> {
    const romScannerProgressBarName = 'Scanning for ROMs';
    const romProgressBar = await this.logger.addProgressBar(romScannerProgressBarName);

    const rawRomFiles = await new ROMScanner(this.options, romProgressBar).scan(checksumBitmask);

    await romProgressBar.setName('Detecting ROM headers');
    const romFilesWithHeaders = await new ROMHeaderProcessor(this.options, romProgressBar)
      .process(rawRomFiles);

    await romProgressBar.setName('Indexing ROMs');
    const indexedRomFiles = await new ROMIndexer(this.options, romProgressBar)
      .index(romFilesWithHeaders);

    await romProgressBar.setName(romScannerProgressBarName); // reset
    await romProgressBar.doneItems(romFilesWithHeaders.length, 'file', 'found');
    await romProgressBar.freeze();

    return indexedRomFiles;
  }

  private async processPatchScanner(): Promise<Patch[]> {
    if (!this.options.getPatchFileCount()) {
      return [];
    }

    const progressBar = await this.logger.addProgressBar('Scanning for patches');
    const patches = await new PatchScanner(this.options, progressBar).scan();
    await progressBar.doneItems(patches.length, 'patch', 'found');
    await progressBar.freeze();
    return patches;
  }

  private async generateCandidates(
    progressBar: ProgressBar,
    dat: DAT,
    indexedRoms: IndexedFiles,
    patches: Patch[],
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    const candidates = await new CandidateGenerator(this.options, progressBar)
      .generate(dat, indexedRoms);

    const patchedCandidates = await new CandidatePatchGenerator(progressBar)
      .generate(dat, candidates, patches);

    const preferredCandidates = await new CandidatePreferer(this.options, progressBar)
      .prefer(dat, patchedCandidates);

    // Delay calculating checksums for {@link ArchiveFile}s until after {@link CandidatePreferer}
    //  for efficiency
    const hashedCandidates = await new CandidateArchiveFileHasher(this.options, progressBar)
      .hash(dat, preferredCandidates);

    const postProcessedCandidates = await new CandidatePostProcessor(this.options, progressBar)
      .process(dat, hashedCandidates);

    await new CandidateMergeSplitValidator(this.options, progressBar)
      .validate(dat, postProcessedCandidates);

    return new CandidateCombiner(this.options, progressBar)
      .combine(dat, postProcessedCandidates);
  }

  /**
   * Find all ROM output paths for a DAT and its candidates.
   */
  private getCandidateOutputDirs(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): string[] {
    return [...parentsToCandidates.values()]
      .flatMap((releaseCandidates) => releaseCandidates
        .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles()
          .flatMap((romWithFiles) => OutputFactory.getPath(
            // Parse the output directory, as supplied by the user, ONLY replacing tokens in the
            // path and NOT respecting any `--dir-*` options.
            new Options({
              commands: [...this.options.getCommands()],
              output: this.options.getOutput(),
            }),
            dat,
            releaseCandidate.getGame(),
            releaseCandidate.getRelease(),
            romWithFiles.getRom(),
            romWithFiles.getInputFile(),
          ).dir)))
      .reduce(ArrayPoly.reduceUnique(), []);
  }

  private async deleteMovedRoms(
    rawRomFiles: File[],
    movedRomsToDelete: File[],
    datsToWrittenFiles: Map<DAT, File[]>,
  ): Promise<void> {
    if (movedRomsToDelete.length === 0) {
      return;
    }

    const progressBar = await this.logger.addProgressBar('Deleting moved files');
    const deletedFilePaths = await new MovedROMDeleter(progressBar)
      .delete(rawRomFiles, movedRomsToDelete, datsToWrittenFiles);
    await progressBar.doneItems(deletedFilePaths.length, 'moved file', 'deleted');
    await progressBar.freeze();
  }

  private async processOutputCleaner(
    dirsToClean: string[],
    datsToWrittenFiles: Map<DAT, File[]>,
  ): Promise<string[]> {
    if (!this.options.shouldWrite() || !this.options.shouldClean()) {
      return [];
    }

    const progressBar = await this.logger.addProgressBar('Cleaning output directory');
    const uniqueDirsToClean = dirsToClean.reduce(ArrayPoly.reduceUnique(), []);
    const writtenFilesToExclude = [...datsToWrittenFiles.values()].flat();
    const filesCleaned = await new DirectoryCleaner(this.options, progressBar)
      .clean(uniqueDirsToClean, writtenFilesToExclude);
    await progressBar.doneItems(filesCleaned.length, 'file', 'recycled');
    await progressBar.freeze();
    return filesCleaned;
  }

  private async processReportGenerator(
    scannedRomFiles: File[],
    cleanedOutputFiles: string[],
    datsStatuses: DATStatus[],
  ): Promise<void> {
    if (!this.options.shouldReport()) {
      return;
    }

    const reportProgressBar = await this.logger.addProgressBar('Generating report', ProgressBarSymbol.WRITING);
    await new ReportGenerator(this.options, reportProgressBar).generate(
      scannedRomFiles,
      cleanedOutputFiles,
      datsStatuses,
    );
  }
}
