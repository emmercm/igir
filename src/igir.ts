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
import CandidateArchiveFileHasher from './modules/candidates/candidateArchiveFileHasher.js';
import CandidateCombiner from './modules/candidates/candidateCombiner.js';
import CandidateExtensionCorrector from './modules/candidates/candidateExtensionCorrector.js';
import CandidateGenerator from './modules/candidates/candidateGenerator.js';
import CandidateMergeSplitValidator from './modules/candidates/candidateMergeSplitValidator.js';
import CandidatePatchGenerator from './modules/candidates/candidatePatchGenerator.js';
import CandidatePostProcessor from './modules/candidates/candidatePostProcessor.js';
import CandidatePreferer from './modules/candidates/candidatePreferer.js';
import CandidateValidator from './modules/candidates/candidateValidator.js';
import CandidateWriter from './modules/candidates/candidateWriter.js';
import DATCombiner from './modules/dats/datCombiner.js';
import DATFilter from './modules/dats/datFilter.js';
import DATGameInferrer from './modules/dats/datGameInferrer.js';
import DATMergerSplitter from './modules/dats/datMergerSplitter.js';
import DATParentInferrer from './modules/dats/datParentInferrer.js';
import DATScanner from './modules/dats/datScanner.js';
import Dir2DatCreator from './modules/dir2DatCreator.js';
import DirectoryCleaner from './modules/directoryCleaner.js';
import FixdatCreator from './modules/fixdatCreator.js';
import MovedROMDeleter from './modules/movedRomDeleter.js';
import PatchScanner from './modules/patchScanner.js';
import ReportGenerator from './modules/reportGenerator.js';
import ROMHeaderProcessor from './modules/roms/romHeaderProcessor.js';
import ROMIndexer from './modules/roms/romIndexer.js';
import ROMScanner from './modules/roms/romScanner.js';
import StatusGenerator from './modules/statusGenerator.js';
import ArrayPoly from './polyfill/arrayPoly.js';
import FsPoly from './polyfill/fsPoly.js';
import Timer from './timer.js';
import DAT from './types/dats/dat.js';
import Parent from './types/dats/parent.js';
import DATStatus from './types/datStatus.js';
import ExpectedError from './types/expectedError.js';
import File from './types/files/file.js';
import FileCache from './types/files/fileCache.js';
import { ChecksumBitmask } from './types/files/fileChecksums.js';
import FileFactory from './types/files/fileFactory.js';
import IndexedFiles from './types/indexedFiles.js';
import Options, { InputChecksumArchivesMode } from './types/options.js';
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
    if (this.options.shouldLink() && this.options.getSymlink() && process.platform === 'win32') {
      this.logger.trace('checking Windows for symlink permissions');
      if (!(await FsPoly.canSymlink(Temp.getTempDir()))) {
        if (!(await isAdmin())) {
          throw new ExpectedError(
            `${Package.NAME} does not have permissions to create symlinks, please try running as administrator`,
          );
        }
        throw new ExpectedError(`${Package.NAME} does not have permissions to create symlinks`);
      }
      this.logger.trace('Windows has symlink permissions');
    }

    if (this.options.shouldLink() && !this.options.getSymlink()) {
      const outputDirRoot = this.options.getOutputDirRoot();
      if (!(await FsPoly.canHardlink(outputDirRoot))) {
        const outputDisk = FsPoly.diskResolved(outputDirRoot);
        throw new ExpectedError(`${outputDisk} does not support hard-linking`);
      }
    }

    // File cache options
    const fileCache = new FileCache();
    if (this.options.getDisableCache()) {
      this.logger.trace('disabling the file cache');
      fileCache.disable();
    } else {
      const cachePath = await this.getCachePath();
      if (cachePath !== undefined && process.env.NODE_ENV !== 'test') {
        this.logger.trace(`loading the file cache at '${cachePath}'`);
        await fileCache.loadFile(cachePath);
      } else {
        this.logger.trace('not using a file for the file cache');
      }
    }
    const fileFactory = new FileFactory(fileCache);

    // Scan and process input files
    let dats = await this.processDATScanner(fileFactory);
    const indexedRoms = await this.processROMScanner(
      fileFactory,
      this.determineScanningBitmask(dats),
      this.determineScanningChecksumArchives(dats),
    );
    const roms = indexedRoms.getFiles();
    const patches = await this.processPatchScanner(fileFactory);

    // Set up progress bar and input for DAT processing
    const datProcessProgressBar = this.logger.addProgressBar(
      chalk.underline('Processing DATs'),
      ProgressBarSymbol.NONE,
      dats.length,
    );
    if (dats.length === 0) {
      dats = await new DATGameInferrer(this.options, datProcessProgressBar).infer(roms);
    }

    const datsToWrittenFiles = new Map<DAT, File[]>();
    let romOutputDirs: string[] = [];
    let movedRomsToDelete: File[] = [];
    const datsStatuses: DATStatus[] = [];

    // Process every DAT
    datProcessProgressBar.logTrace(
      `processing ${dats.length.toLocaleString()} DAT${dats.length !== 1 ? 's' : ''}`,
    );
    await async.eachLimit(dats, this.options.getDatThreads(), async (dat: DAT): Promise<void> => {
      datProcessProgressBar.incrementProgress();

      const progressBar = this.logger.addProgressBar(
        dat.getNameShort(),
        ProgressBarSymbol.WAITING,
        dat.getParents().length,
      );

      const datWithParents = new DATParentInferrer(this.options, progressBar).infer(dat);
      const mergedSplitDat = new DATMergerSplitter(this.options, progressBar).merge(datWithParents);
      const filteredDat = new DATFilter(this.options, progressBar).filter(mergedSplitDat);

      // Generate and filter ROM candidates
      const parentsToCandidates = await this.generateCandidates(
        progressBar,
        fileFactory,
        filteredDat,
        indexedRoms,
        patches,
      );
      romOutputDirs = [
        ...romOutputDirs,
        ...this.getCandidateOutputDirs(filteredDat, parentsToCandidates),
      ];

      // Write the output files
      const writerResults = await new CandidateWriter(this.options, progressBar).write(
        filteredDat,
        parentsToCandidates,
      );
      movedRomsToDelete = [...movedRomsToDelete, ...writerResults.moved];
      datsToWrittenFiles.set(filteredDat, writerResults.wrote);

      // Write a dir2dat
      const dir2DatPath = await new Dir2DatCreator(this.options, progressBar).create(
        filteredDat,
        parentsToCandidates,
      );
      if (dir2DatPath) {
        datsToWrittenFiles.set(filteredDat, [
          ...(datsToWrittenFiles.get(filteredDat) ?? []),
          await File.fileOf({ filePath: dir2DatPath }),
        ]);
      }

      // Write a fixdat
      const fixdatPath = await new FixdatCreator(this.options, progressBar).create(
        filteredDat,
        parentsToCandidates,
      );
      if (fixdatPath) {
        datsToWrittenFiles.set(filteredDat, [
          ...(datsToWrittenFiles.get(filteredDat) ?? []),
          await File.fileOf({ filePath: fixdatPath }),
        ]);
      }

      // Write the output report
      const datStatus = new StatusGenerator(this.options, progressBar).generate(
        filteredDat,
        parentsToCandidates,
      );
      datsStatuses.push(datStatus);
      progressBar.done(
        [
          datStatus.toConsole(this.options),
          dir2DatPath ? `dir2dat: ${dir2DatPath}` : undefined,
          fixdatPath ? `Fixdat: ${fixdatPath}` : undefined,
        ]
          .filter((line) => line !== undefined && line.length > 0)
          .join('\n'),
      );

      // Progress bar cleanup
      const totalReleaseCandidates = [...parentsToCandidates.values()].reduce(
        (sum, rcs) => sum + rcs.length,
        0,
      );
      if (totalReleaseCandidates > 0) {
        progressBar.freeze();
      } else {
        progressBar.delete();
      }

      datProcessProgressBar.incrementDone();
    });
    datProcessProgressBar.logTrace(
      `done processing ${dats.length.toLocaleString()} DAT${dats.length !== 1 ? 's' : ''}`,
    );

    datProcessProgressBar.doneItems(dats.length, 'DAT', 'processed');
    datProcessProgressBar.delete();

    // Delete moved ROMs
    await this.deleteMovedRoms(roms, movedRomsToDelete, datsToWrittenFiles);

    // Clean the output directories
    const cleanedOutputFiles = await this.processOutputCleaner(romOutputDirs, datsToWrittenFiles);

    // Generate the report
    await this.processReportGenerator(roms, cleanedOutputFiles, datsStatuses);

    ProgressBarCLI.stop();

    Timer.cancelAll();
  }

  private async getCachePath(): Promise<string | undefined> {
    const defaultFileName = process.versions.bun
      ? // As of v1.1.26, Bun uses a different serializer than V8, making cache files incompatible
        // @see https://bun.sh/docs/runtime/nodejs-apis
        `${Package.NAME}.bun.cache`
      : `${Package.NAME}.cache`;

    // First, try to use the provided path
    let cachePath = this.options.getCachePath();
    if (cachePath !== undefined && (await FsPoly.isDirectory(cachePath))) {
      cachePath = path.join(cachePath, defaultFileName);
      this.logger.warn(
        `A directory was provided for the cache path instead of a file, using '${cachePath}' instead`,
      );
    }
    if (cachePath !== undefined) {
      if (await FsPoly.isWritable(cachePath)) {
        return cachePath;
      }
      this.logger.warn("Provided cache path isn't writable, using the default path");
    }

    const cachePathCandidates = [
      // Path to the interpreted JS/TS file
      process.argv.length >= 2 && path.extname(process.argv[1]).match(/\.(js|cjs|mjs|ts)/) !== null
        ? path.join(path.dirname(process.argv[1]), defaultFileName)
        : '',
      // Path to the compiled Bun binary
      process.versions.bun && path.basename(process.execPath) !== 'bun'
        ? path.join(path.dirname(process.execPath), defaultFileName)
        : '',
      path.join(os.homedir(), defaultFileName),
      path.join(process.cwd(), defaultFileName),
    ]
      .filter((filePath) => filePath.length > 0 && !filePath.startsWith(os.tmpdir()))
      .reduce(ArrayPoly.reduceUnique(), []);

    // Next, try to use an already existing path
    const exists = await Promise.all(
      cachePathCandidates.map(async (pathCandidate) => FsPoly.exists(pathCandidate)),
    );
    const existsCachePath = cachePathCandidates.find((_, idx) => exists[idx]);
    if (existsCachePath !== undefined) {
      return existsCachePath;
    }

    // Next, try to find a writable path
    const writable = await Promise.all(
      cachePathCandidates.map(async (pathCandidate) => FsPoly.isWritable(pathCandidate)),
    );
    const writableCachePath = cachePathCandidates.find((_, idx) => writable[idx]);
    if (writableCachePath !== undefined) {
      return writableCachePath;
    }

    return undefined;
  }

  private async processDATScanner(fileFactory: FileFactory): Promise<DAT[]> {
    if (this.options.shouldDir2Dat()) {
      return [];
    }
    if (!this.options.usingDats()) {
      this.logger.warn('No DAT files provided, consider using some for the best results!');
      return [];
    }

    const progressBar = this.logger.addProgressBar('Scanning for DATs');
    let dats = await new DATScanner(this.options, progressBar, fileFactory).scan();
    if (dats.length === 0) {
      throw new ExpectedError('No valid DAT files found!');
    }

    if (dats.length === 1) {
      (
        [
          [this.options.getDirDatName(), '--dir-dat-name'],
          [this.options.getDirDatDescription(), '--dir-dat-description'],
        ] satisfies [boolean, string][]
      )
        .filter(([bool]) => bool)
        .forEach(([, option]) => {
          progressBar.logWarn(
            `${option} is most helpful when processing multiple DATs, only one DAT was found`,
          );
        });
    }

    if (this.options.getDatCombine()) {
      progressBar.reset(1);
      dats = [new DATCombiner(progressBar).combine(dats)];
    }

    progressBar.doneItems(dats.length, 'DAT', this.options.getDatCombine() ? 'combined' : 'found');
    progressBar.freeze();
    return dats;
  }

  private determineScanningBitmask(dats: DAT[]): number {
    const minimumChecksum = this.options.getInputChecksumMin() ?? ChecksumBitmask.NONE;
    const maximumChecksum =
      this.options.getInputChecksumMax() ??
      Object.keys(ChecksumBitmask)
        .filter((bitmask): bitmask is keyof typeof ChecksumBitmask => Number.isNaN(Number(bitmask)))
        .map((bitmask) => ChecksumBitmask[bitmask])
        .at(-1) ??
      minimumChecksum;

    let matchChecksum = minimumChecksum;

    if (this.options.getPatchFileCount() > 0) {
      matchChecksum |= ChecksumBitmask.CRC32;
      this.logger.trace('using patch files, enabling CRC32 file checksums');
    }

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
      const datMinimumRomBitmask = dat.getRequiredRomChecksumBitmask();
      Object.keys(ChecksumBitmask)
        .filter((bitmask): bitmask is keyof typeof ChecksumBitmask => Number.isNaN(Number(bitmask)))
        // Has not been enabled yet
        .filter(
          (bitmask) =>
            ChecksumBitmask[bitmask] > minimumChecksum &&
            ChecksumBitmask[bitmask] <= maximumChecksum,
        )
        .filter((bitmask) => !(matchChecksum & ChecksumBitmask[bitmask]))
        // Should be enabled for this DAT
        .filter((bitmask) => (datMinimumRomBitmask & ChecksumBitmask[bitmask]) > 0)
        .forEach((bitmask) => {
          matchChecksum |= ChecksumBitmask[bitmask];
          this.logger.trace(
            `${dat.getNameShort()}: needs ${bitmask} file checksums for ROMs, enabling`,
          );
        });

      if (this.options.getExcludeDisks()) {
        return;
      }
      const datMinimumDiskBitmask = dat.getRequiredDiskChecksumBitmask();
      Object.keys(ChecksumBitmask)
        .filter((bitmask): bitmask is keyof typeof ChecksumBitmask => Number.isNaN(Number(bitmask)))
        // Has not been enabled yet
        .filter(
          (bitmask) =>
            ChecksumBitmask[bitmask] > minimumChecksum &&
            ChecksumBitmask[bitmask] <= maximumChecksum,
        )
        .filter((bitmask) => !(matchChecksum & ChecksumBitmask[bitmask]))
        // Should be enabled for this DAT
        .filter((bitmask) => (datMinimumDiskBitmask & ChecksumBitmask[bitmask]) > 0)
        .forEach((bitmask) => {
          matchChecksum |= ChecksumBitmask[bitmask];
          this.logger.trace(
            `${dat.getNameShort()}: needs ${bitmask} file checksums for disks, enabling`,
          );
        });
    });

    if (matchChecksum === ChecksumBitmask.NONE) {
      matchChecksum |= ChecksumBitmask.CRC32;
      this.logger.trace(
        'at least one checksum algorithm is required, enabling CRC32 file checksums',
      );
    }

    return matchChecksum;
  }

  private determineScanningChecksumArchives(dats: DAT[]): boolean {
    if (this.options.getInputChecksumArchives() === InputChecksumArchivesMode.NEVER) {
      return false;
    }
    if (this.options.getInputChecksumArchives() === InputChecksumArchivesMode.ALWAYS) {
      return true;
    }
    return dats.some((dat) =>
      dat.getGames().some((game) =>
        game.getRoms().some((rom) => {
          const isArchive = FileFactory.isExtensionArchive(rom.getName());
          if (isArchive) {
            this.logger.trace(
              `${dat.getNameShort()}: contains archives, enabling checksum calculation of raw archive contents`,
            );
          }
          return isArchive;
        }),
      ),
    );
  }

  private async processROMScanner(
    fileFactory: FileFactory,
    checksumBitmask: number,
    checksumArchives: boolean,
  ): Promise<IndexedFiles> {
    const romScannerProgressBarName = 'Scanning for ROMs';
    const romProgressBar = this.logger.addProgressBar(romScannerProgressBarName);

    const rawRomFiles = await new ROMScanner(this.options, romProgressBar, fileFactory).scan(
      checksumBitmask,
      checksumArchives,
    );

    romProgressBar.setName('Detecting ROM headers');
    const romFilesWithHeaders = await new ROMHeaderProcessor(
      this.options,
      romProgressBar,
      fileFactory,
    ).process(rawRomFiles);

    romProgressBar.setName('Indexing ROMs');
    const indexedRomFiles = new ROMIndexer(this.options, romProgressBar).index(romFilesWithHeaders);

    romProgressBar.setName(romScannerProgressBarName); // reset
    romProgressBar.doneItems(romFilesWithHeaders.length, 'file', 'found');
    romProgressBar.freeze();

    return indexedRomFiles;
  }

  private async processPatchScanner(fileFactory: FileFactory): Promise<Patch[]> {
    if (!this.options.getPatchFileCount()) {
      return [];
    }

    const progressBar = this.logger.addProgressBar('Scanning for patches');
    const patches = await new PatchScanner(this.options, progressBar, fileFactory).scan();
    progressBar.doneItems(patches.length, 'patch', 'found');
    progressBar.freeze();
    return patches;
  }

  private async generateCandidates(
    progressBar: ProgressBar,
    fileFactory: FileFactory,
    dat: DAT,
    indexedRoms: IndexedFiles,
    patches: Patch[],
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    const candidates = await new CandidateGenerator(this.options, progressBar).generate(
      dat,
      indexedRoms,
    );

    const patchedCandidates = await new CandidatePatchGenerator(progressBar).generate(
      dat,
      candidates,
      patches,
    );

    const preferredCandidates = new CandidatePreferer(this.options, progressBar).prefer(
      dat,
      patchedCandidates,
    );

    const extensionCorrectedCandidates = await new CandidateExtensionCorrector(
      this.options,
      progressBar,
      fileFactory,
    ).correct(dat, preferredCandidates);

    // Delay calculating checksums for {@link ArchiveFile}s until after {@link CandidatePreferer}
    //  for efficiency
    const hashedCandidates = await new CandidateArchiveFileHasher(
      this.options,
      progressBar,
      fileFactory,
    ).hash(dat, extensionCorrectedCandidates);

    const postProcessedCandidates = new CandidatePostProcessor(this.options, progressBar).process(
      dat,
      hashedCandidates,
    );

    const invalidCandidates = new CandidateValidator(progressBar).validate(
      dat,
      postProcessedCandidates,
    );
    if (invalidCandidates.length > 0) {
      // Return zero candidates if any candidates failed to validate
      return new Map();
    }

    new CandidateMergeSplitValidator(this.options, progressBar).validate(
      dat,
      postProcessedCandidates,
    );

    return new CandidateCombiner(this.options, progressBar).combine(dat, postProcessedCandidates);
  }

  /**
   * Find all ROM output paths for a DAT and its candidates.
   */
  private getCandidateOutputDirs(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): string[] {
    return [...parentsToCandidates.values()]
      .flatMap((releaseCandidates) =>
        releaseCandidates.flatMap((releaseCandidate) =>
          releaseCandidate.getRomsWithFiles().flatMap(
            (romWithFiles) =>
              OutputFactory.getPath(
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
              ).dir,
          ),
        ),
      )
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

    const progressBar = this.logger.addProgressBar('Deleting moved files');
    const deletedFilePaths = await new MovedROMDeleter(progressBar).delete(
      rawRomFiles,
      movedRomsToDelete,
      datsToWrittenFiles,
    );
    progressBar.doneItems(deletedFilePaths.length, 'moved file', 'deleted');
    if (deletedFilePaths.length > 0) {
      progressBar.freeze();
    } else {
      progressBar.delete();
    }
  }

  private async processOutputCleaner(
    dirsToClean: string[],
    datsToWrittenFiles: Map<DAT, File[]>,
  ): Promise<string[]> {
    if (!this.options.shouldWrite() || !this.options.shouldClean() || dirsToClean.length === 0) {
      return [];
    }

    const progressBar = this.logger.addProgressBar('Cleaning output directory');
    const uniqueDirsToClean = dirsToClean.reduce(ArrayPoly.reduceUnique(), []);
    const writtenFilesToExclude = [...datsToWrittenFiles.values()].flat();
    const filesCleaned = await new DirectoryCleaner(this.options, progressBar).clean(
      uniqueDirsToClean,
      writtenFilesToExclude,
    );
    progressBar.doneItems(filesCleaned.length, 'file', 'recycled');
    progressBar.freeze();
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

    const reportProgressBar = this.logger.addProgressBar(
      'Generating report',
      ProgressBarSymbol.WRITING,
    );
    await new ReportGenerator(this.options, reportProgressBar).generate(
      scannedRomFiles,
      cleanedOutputFiles,
      datsStatuses,
    );
  }
}
