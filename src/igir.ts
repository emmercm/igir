import os from 'node:os';
import path from 'node:path';

import async from 'async';
import chalk from 'chalk';
import isAdmin from 'is-admin';

import CandidateWriterSemaphore from './async/candidateWriterSemaphore.js';
import FileMoveMutex from './async/fileMoveMutex.js';
import MappableSemaphore from './async/mappableSemaphore.js';
import Timer from './async/timer.js';
import type Logger from './console/logger.js';
import MultiBar from './console/multiBar.js';
import type ProgressBar from './console/progressBar.js';
import { ProgressBarSymbol } from './console/progressBar.js';
import Package from './globals/package.js';
import Temp from './globals/temp.js';
import CandidateArchiveFileHasher from './modules/candidates/candidateArchiveFileHasher.js';
import CandidateCombiner from './modules/candidates/candidateCombiner.js';
import CandidateExtensionCorrector from './modules/candidates/candidateExtensionCorrector.js';
import CandidateGenerator from './modules/candidates/candidateGenerator.js';
import CandidateMergeSplitValidator from './modules/candidates/candidateMergeSplitValidator.js';
import CandidatePatchGenerator from './modules/candidates/candidatePatchGenerator.js';
import CandidatePostProcessor from './modules/candidates/candidatePostProcessor.js';
import CandidateValidator from './modules/candidates/candidateValidator.js';
import type { CandidateWriterResults } from './modules/candidates/candidateWriter.js';
import CandidateWriter from './modules/candidates/candidateWriter.js';
import DATCombiner from './modules/dats/datCombiner.js';
import DATDiscMerger from './modules/dats/datDiscMerger.js';
import DATFilter from './modules/dats/datFilter.js';
import DATGameInferrer from './modules/dats/datGameInferrer.js';
import DATMergerSplitter from './modules/dats/datMergerSplitter.js';
import DATParentInferrer from './modules/dats/datParentInferrer.js';
import DATPreferer from './modules/dats/datPreferer.js';
import DATScanner from './modules/dats/datScanner.js';
import Dir2DatCreator from './modules/dir2DatCreator.js';
import DirectoryCleaner from './modules/directoryCleaner.js';
import FixdatCreator from './modules/fixdatCreator.js';
import InputSubdirectoriesDeleter from './modules/inputSubdirectoriesDeleter.js';
import MovedROMDeleter from './modules/movedRomDeleter.js';
import PatchScanner from './modules/patchScanner.js';
import PlaylistCreator from './modules/playlistCreator.js';
import ReportGenerator from './modules/reportGenerator.js';
import ROMHeaderProcessor from './modules/roms/romHeaderProcessor.js';
import ROMIndexer from './modules/roms/romIndexer.js';
import ROMScanner from './modules/roms/romScanner.js';
import ROMTrimProcessor from './modules/roms/romTrimProcessor.js';
import StatusGenerator from './modules/statusGenerator.js';
import ArrayPoly from './polyfill/arrayPoly.js';
import FsPoly from './polyfill/fsPoly.js';
import IntlPoly from './polyfill/intlPoly.js';
import type DAT from './types/dats/dat.js';
import type DATStatus from './types/datStatus.js';
import IgirException from './types/exceptions/igirException.js';
import File from './types/files/file.js';
import FileCache from './types/files/fileCache.js';
import { ChecksumBitmask, ChecksumBitmaskInverted } from './types/files/fileChecksums.js';
import FileFactory from './types/files/fileFactory.js';
import type IndexedFiles from './types/indexedFiles.js';
import Options, { InputChecksumArchivesMode, LinkMode } from './types/options.js';
import OutputFactory from './types/outputFactory.js';
import type Patch from './types/patches/patch.js';
import type WriteCandidate from './types/writeCandidate.js';

/**
 * The main class that coordinates file scanning, processing, and writing.
 */
export default class Igir {
  private readonly options: Options;
  private readonly logger: Logger;
  private readonly multiBar: MultiBar;

  constructor(options: Options, logger: Logger) {
    this.options = options;
    this.logger = logger;
    this.multiBar = MultiBar.create(logger);
  }

  /**
   * The main method for this application.
   */
  async main(): Promise<void> {
    Temp.setTempDir(this.options.getTempDir());

    // Windows 10 may require admin privileges to symlink at all
    // @see https://github.com/nodejs/node/issues/18518
    if (
      this.options.shouldLink() &&
      this.options.getLinkMode() === LinkMode.SYMLINK &&
      process.platform === 'win32'
    ) {
      this.logger.trace('checking Windows for symlink permissions');
      if (!(await FsPoly.canSymlink(Temp.getTempDir()))) {
        if (!(await isAdmin())) {
          throw new IgirException(
            `${Package.NAME} does not have permissions to create symlinks, please try running as administrator`,
          );
        }
        throw new IgirException(`${Package.NAME} does not have permissions to create symlinks`);
      }
      this.logger.trace('Windows has symlink permissions');
    }

    if (this.options.shouldLink() && this.options.getLinkMode() === LinkMode.HARDLINK) {
      const outputDirRoot = this.options.getOutputDirRoot();
      if (!(await FsPoly.canHardlink(outputDirRoot))) {
        const outputDisk = FsPoly.diskResolved(outputDirRoot);
        throw new IgirException(`${outputDisk ?? 'filesystem'} does not support hard-linking`);
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
        if (await FsPoly.exists(cachePath)) {
          this.logger.trace(`loading the existing file cache at '${cachePath}'`);
        } else {
          this.logger.trace(`creating a new file cache at '${cachePath}'`);
        }
        await fileCache.loadFile(cachePath);
      } else {
        this.logger.trace('not using a file for the file cache');
      }
    }
    const fileFactory = new FileFactory(fileCache, this.logger);

    // Semaphores
    const readerSemaphore = new MappableSemaphore(this.options.getReaderThreads());
    const writerSemaphore = new CandidateWriterSemaphore(this.options.getWriterThreads());
    const moveMutex = new FileMoveMutex(this.options.getReaderThreads() * 100);

    // Scan and process input files
    let dats = await this.processDATScanner(fileFactory, readerSemaphore);
    const indexedRoms = await this.processROMScanner(
      fileFactory,
      readerSemaphore,
      this.determineScanningBitmask(dats),
      this.determineScanningChecksumArchives(dats),
    );
    const roms = indexedRoms.getFiles();
    const patches = await this.processPatchScanner(fileFactory, readerSemaphore);

    // Set up progress bar and input for DAT processing
    const datProcessProgressBar = this.multiBar.addSingleBar({
      name: chalk.underline('Processing DATs'),
      symbol: ProgressBarSymbol.NONE,
      total: dats.length,
      progressBarSizeMultiplier: 2,
    });
    if (dats.length === 0) {
      dats = await new DATGameInferrer(this.options, datProcessProgressBar).infer(roms);
      datProcessProgressBar.setTotal(dats.length);
    }
    if (dats.length <= 1) {
      // If there's only one DAT, then it's redundant to show this progress bar
      datProcessProgressBar.delete();
    }

    const candidateWriterResults: CandidateWriterResults = {
      wrote: [],
      moved: [],
    };
    const filesToExcludeFromCleaning: File[] = [];
    let romOutputDirs: string[] = [];
    const datsStatuses: DATStatus[] = [];

    // Process every DAT
    datProcessProgressBar.logTrace(
      `processing ${IntlPoly.toLocaleString(dats.length)} DAT${dats.length === 1 ? '' : 's'}`,
    );
    await async.eachLimit(dats, this.options.getDatThreads(), async (dat: DAT): Promise<void> => {
      datProcessProgressBar.incrementInProgress();

      const progressBar = this.multiBar.addSingleBar({
        name: dat.getDisplayName(),
        symbol: ProgressBarSymbol.WAITING,
        total: dat.getParents().length,
      });
      const processedDat = this.processDAT(progressBar, dat);

      // Generate and filter ROM candidates
      const candidates = await this.generateCandidates(
        progressBar,
        fileFactory,
        readerSemaphore,
        processedDat,
        indexedRoms,
        patches,
      );

      candidates.forEach((candidate) => {
        candidate.getRomsWithFiles().forEach((romWithFiles) => {
          // Files in the output directory that matched to a DAT should be excluded from cleaning.
          // Note that only the correct/output path is excluded, not the current/input path. Files
          // that aren't in the correct location will be deleted.
          if (!romWithFiles.getInputFile().getCanBeCandidateInput()) {
            filesToExcludeFromCleaning.push(romWithFiles.getOutputFile());
          }
        });
      });
      romOutputDirs = [...romOutputDirs, ...this.getCandidateOutputDirs(processedDat, candidates)];

      // Write the output files
      const writerResults = await new CandidateWriter(
        this.options,
        progressBar,
        fileFactory,
        writerSemaphore,
        moveMutex,
      ).write(processedDat, candidates);
      writerResults.moved.forEach((moved) => candidateWriterResults.moved.push(moved));
      writerResults.wrote.forEach((wrote) => candidateWriterResults.wrote.push(wrote));

      // Write playlists
      const playlistPaths = await new PlaylistCreator(this.options, progressBar).create(
        processedDat,
        candidates,
      );
      await Promise.all(
        playlistPaths.map(async (filePath) => {
          filesToExcludeFromCleaning.push(await File.fileOf({ filePath }));
        }),
      );

      // Write a dir2dat
      const dir2DatPath = await new Dir2DatCreator(this.options, progressBar).create(
        processedDat,
        candidates,
      );
      if (dir2DatPath) {
        filesToExcludeFromCleaning.push(await File.fileOf({ filePath: dir2DatPath }));
      }

      // Write a fixdat
      const fixdatPath = await new FixdatCreator(this.options, progressBar).create(
        processedDat,
        candidates,
      );
      if (fixdatPath) {
        filesToExcludeFromCleaning.push(await File.fileOf({ filePath: fixdatPath }));
      }

      // Write the output report
      const datStatus = new StatusGenerator(progressBar).generate(processedDat, candidates);
      datsStatuses.push(datStatus);
      progressBar.finish(
        [
          datStatus.toConsole(this.options),
          dir2DatPath ? `dir2dat: ${dir2DatPath}` : undefined,
          fixdatPath ? `Fixdat: ${fixdatPath}` : undefined,
        ]
          .filter((line) => line !== undefined && line.length > 0)
          .join('\n'),
      );

      // Progress bar cleanup
      if (candidates.length > 0 || this.options.shouldDir2Dat() || this.options.shouldFixdat()) {
        progressBar.freeze();
      } else {
        progressBar.delete();
      }

      progressBar.logTrace('done processing DAT');
      datProcessProgressBar.incrementCompleted();
    });
    datProcessProgressBar.logTrace(
      `done processing ${IntlPoly.toLocaleString(dats.length)} DAT${dats.length === 1 ? '' : 's'}`,
    );

    datProcessProgressBar.finishWithItems(dats.length, 'DAT', 'processed');
    datProcessProgressBar.delete();

    const writtenOutputFiles = candidateWriterResults.wrote.flatMap((wc) =>
      wc.getRomsWithFiles().map((rwf) => rwf.getOutputFile()),
    );

    // Delete moved ROMs
    await this.deleteMovedRoms(indexedRoms, candidateWriterResults.moved, writtenOutputFiles);

    // Clean the output directories
    const cleanedOutputFiles = await this.processOutputCleaner(romOutputDirs, [
      // Do not clean output ROMs
      ...writtenOutputFiles,
      // Do not clean any other files written (dir2dats, fixdats, playlists, etc.)
      ...filesToExcludeFromCleaning,
    ]);

    // Generate the report
    await this.processReportGenerator(roms, cleanedOutputFiles, datsStatuses);

    Timer.cancelAll();
  }

  private async getCachePath(): Promise<string | undefined> {
    const defaultFileName = `${Package.NAME}.cache`;

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
      path.join(os.homedir(), defaultFileName),
      path.join(process.cwd(), defaultFileName),
    ]
      .filter((filePath) => filePath.length > 0 && !filePath.startsWith(os.tmpdir()))
      .reduce(ArrayPoly.reduceUnique(), []);

    // Next, try to use an already existing path
    const exists = await Promise.all(
      cachePathCandidates.map(async (pathCandidate) => await FsPoly.exists(pathCandidate)),
    );
    const existsCachePath = cachePathCandidates.find((_, idx) => exists[idx]);
    if (existsCachePath !== undefined) {
      return existsCachePath;
    }

    // Next, try to find a writable path
    const writable = await Promise.all(
      cachePathCandidates.map(async (pathCandidate) => await FsPoly.isWritable(pathCandidate)),
    );
    const writableCachePath = cachePathCandidates.find((_, idx) => writable[idx]);
    if (writableCachePath !== undefined) {
      return writableCachePath;
    }

    return undefined;
  }

  private async processDATScanner(
    fileFactory: FileFactory,
    readableSemaphore: MappableSemaphore,
  ): Promise<DAT[]> {
    if (this.options.shouldDir2Dat()) {
      return [];
    }
    if (!this.options.usingDats()) {
      this.logger.warn('No DAT files provided, consider using some for the best results!');
      return [];
    }

    const progressBar = this.multiBar.addSingleBar({
      name: 'Scanning for DATs',
    });
    let dats = await new DATScanner(
      this.options,
      progressBar,
      fileFactory,
      readableSemaphore,
    ).scan();
    if (dats.length === 0) {
      throw new IgirException('No valid DAT files found!');
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
      progressBar.resetProgress(1);
      dats = [new DATCombiner(progressBar).combine(dats)];
    }

    progressBar.finishWithItems(
      dats.length,
      'DAT',
      this.options.getDatCombine() ? 'combined' : 'found',
    );
    progressBar.freeze();
    return dats;
  }

  private determineScanningBitmask(dats: DAT[]): number {
    const minimumChecksum = this.options.getInputChecksumMin() ?? ChecksumBitmask.NONE;
    const maximumChecksum =
      this.options.getInputChecksumMax() ??
      Object.values(ChecksumBitmask).at(-1) ??
      minimumChecksum;

    let matchChecksum = minimumChecksum;

    if (this.options.getPatchFileCount() > 0 && !(matchChecksum & ChecksumBitmask.CRC32)) {
      matchChecksum |= ChecksumBitmask.CRC32;
      this.logger.trace('using patch files, enabling CRC32 file checksums');
    }

    if (this.options.shouldDir2Dat()) {
      Object.values(ChecksumBitmask)
        .filter(
          (bitmask) =>
            bitmask >= minimumChecksum &&
            bitmask <= maximumChecksum &&
            // Has not been enabled yet
            !(matchChecksum & bitmask),
        )
        .forEach((bitmask) => {
          matchChecksum |= bitmask;
          this.logger.trace(
            `generating a dir2dat, enabling ${ChecksumBitmaskInverted[bitmask]} file checksums`,
          );
        });
    }

    if (dats.length === 0) {
      Object.values(ChecksumBitmask)
        .filter(
          (bitmask) =>
            bitmask >= minimumChecksum &&
            bitmask <= maximumChecksum &&
            // Has not been enabled yet
            !(matchChecksum & bitmask),
        )
        .forEach((bitmask) => {
          matchChecksum |= bitmask;
          this.logger.trace(
            `no DATs provided, enabling ${ChecksumBitmaskInverted[bitmask]} file checksums`,
          );
        });
    }

    dats.forEach((dat) => {
      const datMinimumRomBitmask = dat.getRequiredRomChecksumBitmask();
      Object.values(ChecksumBitmask)
        .filter(
          (bitmask) =>
            bitmask >= minimumChecksum &&
            bitmask <= maximumChecksum &&
            // Has not been enabled yet
            !(matchChecksum & bitmask) &&
            // Should be enabled for this DAT
            (datMinimumRomBitmask & bitmask) > 0,
        )
        .forEach((bitmask) => {
          matchChecksum |= bitmask;
          this.logger.trace(
            `${dat.getName()}: needs ${ChecksumBitmaskInverted[bitmask]} file checksums for ROMs, enabling`,
          );
        });

      if (this.options.getExcludeDisks()) {
        return;
      }
      const datMinimumDiskBitmask = dat.getRequiredDiskChecksumBitmask();
      Object.values(ChecksumBitmask)
        .filter(
          (bitmask) =>
            bitmask >= minimumChecksum &&
            bitmask <= maximumChecksum &&
            // Has not been enabled yet
            !(matchChecksum & bitmask) &&
            // Should be enabled for this DAT
            (datMinimumDiskBitmask & bitmask) > 0,
        )
        .forEach((bitmask) => {
          matchChecksum |= bitmask;
          this.logger.trace(
            `${dat.getName()}: needs ${ChecksumBitmaskInverted[bitmask]} file checksums for disks, enabling`,
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
              `${dat.getName()}: contains archives, enabling checksum calculation of raw archive contents`,
            );
          }
          return isArchive;
        }),
      ),
    );
  }

  private async processROMScanner(
    fileFactory: FileFactory,
    readerSemaphore: MappableSemaphore,
    checksumBitmask: number,
    checksumArchives: boolean,
  ): Promise<IndexedFiles> {
    const romProgressBar = this.multiBar.addSingleBar({
      name: 'Scanning for ROMs',
    });

    const rawRomFiles = await new ROMScanner(
      this.options,
      romProgressBar,
      fileFactory,
      readerSemaphore,
    ).scan(checksumBitmask, checksumArchives);
    const romScannerProgressBarName = romProgressBar.getName();

    romProgressBar.setName('Detecting ROM headers');
    const romFilesWithHeaders = await new ROMHeaderProcessor(
      this.options,
      romProgressBar,
      fileFactory,
      readerSemaphore,
    ).process(rawRomFiles);

    romProgressBar.setName('Detecting ROM trimming');
    const romFilesWithTrimming = await new ROMTrimProcessor(
      this.options,
      romProgressBar,
      fileFactory,
      readerSemaphore,
    ).process(romFilesWithHeaders);

    romProgressBar.setName('Indexing ROMs');
    const indexedRomFiles = new ROMIndexer(this.options, romProgressBar).index(
      romFilesWithTrimming,
    );

    romProgressBar.setName(romScannerProgressBarName ?? ''); // reset
    romProgressBar.finishWithItems(romFilesWithTrimming.length, 'file', 'found');
    romProgressBar.freeze();

    return indexedRomFiles;
  }

  private async processPatchScanner(
    fileFactory: FileFactory,
    readerSemaphore: MappableSemaphore,
  ): Promise<Patch[]> {
    if (!this.options.getPatchFileCount()) {
      return [];
    }

    const progressBar = this.multiBar.addSingleBar({
      name: 'Scanning for patches',
    });
    const patches = await new PatchScanner(
      this.options,
      progressBar,
      fileFactory,
      readerSemaphore,
    ).scan();
    progressBar.finishWithItems(patches.length, 'patch', 'found');
    progressBar.freeze();
    return patches;
  }

  private processDAT(progressBar: ProgressBar, dat: DAT): DAT {
    return (
      [
        (dat): DAT => new DATParentInferrer(this.options, progressBar).infer(dat),
        (dat): DAT => new DATMergerSplitter(this.options, progressBar).merge(dat),
        (dat): DAT => new DATDiscMerger(this.options, progressBar).merge(dat),
        (dat): DAT => new DATFilter(this.options, progressBar).filter(dat),
        (dat): DAT => new DATPreferer(this.options, progressBar).prefer(dat),
      ] satisfies ((dat: DAT) => DAT)[]
    ).reduce((processedDat, processor) => {
      return processor(processedDat);
    }, dat);
  }

  private async generateCandidates(
    progressBar: ProgressBar,
    fileFactory: FileFactory,
    readerSemaphore: MappableSemaphore,
    dat: DAT,
    indexedRoms: IndexedFiles,
    patches: Patch[],
  ): Promise<WriteCandidate[]> {
    return await (
      [
        // Generate the initial set of candidates
        async (): Promise<WriteCandidate[]> =>
          await new CandidateGenerator(
            this.options,
            progressBar,
            fileFactory,
            readerSemaphore,
          ).generate(dat, indexedRoms),
        // Add patched candidates
        (candidates): WriteCandidate[] =>
          new CandidatePatchGenerator(this.options, progressBar).generate(dat, candidates, patches),
        // Correct output filename extensions
        async (candidates): Promise<WriteCandidate[]> =>
          await new CandidateExtensionCorrector(
            this.options,
            progressBar,
            fileFactory,
            readerSemaphore,
          ).correct(dat, candidates),
        /**
         * Delay calculating checksums for {@link ArchiveFile}s until after the above steps for
         * efficiency
         */
        async (candidates): Promise<WriteCandidate[]> =>
          await new CandidateArchiveFileHasher(
            this.options,
            progressBar,
            fileFactory,
            readerSemaphore,
          ).hash(dat, candidates),
        // Finalize output file paths
        (candidates): WriteCandidate[] =>
          new CandidatePostProcessor(this.options, progressBar).process(dat, candidates),
        // Validate candidates
        (candidates): WriteCandidate[] => {
          const invalidCandidates = new CandidateValidator(this.options, progressBar).validate(
            dat,
            candidates,
          );
          if (invalidCandidates.length > 0) {
            // Return zero candidates if any candidates failed to validate
            return [];
          }
          return candidates;
        },
        // Validate merge/split
        (candidates): WriteCandidate[] => {
          new CandidateMergeSplitValidator(this.options, progressBar).validate(dat, candidates);
          return candidates;
        },
        // Combine candidates into one
        (candidates): WriteCandidate[] =>
          new CandidateCombiner(this.options, progressBar).combine(dat, candidates),
      ] satisfies ((candidates: WriteCandidate[]) => Promise<WriteCandidate[]> | WriteCandidate[])[]
    ).reduce(
      async (candidatesPromise, processor) => {
        const candidates = await candidatesPromise;
        return await processor(candidates);
      },
      Promise.resolve([] as WriteCandidate[]),
    );
  }

  /**
   * Find all ROM output paths for a DAT and its candidates.
   */
  private getCandidateOutputDirs(dat: DAT, candidates: WriteCandidate[]): string[] {
    return candidates
      .flatMap((candidate) =>
        candidate.getRomsWithFiles().flatMap(
          (romWithFiles) =>
            OutputFactory.getPath(
              // Parse the output directory, as supplied by the user, ONLY replacing tokens in the
              // path and NOT respecting any `--dir-*` options.
              new Options({
                commands: [...this.options.getCommands()],
                output: this.options.getOutput(),
                outputConsoleTokens: this.options.getOutputConsoleTokens(),
              }),
              dat,
              candidate.getGame(),
              romWithFiles.getRom(),
              romWithFiles.getInputFile(),
            ).dir,
        ),
      )
      .reduce(ArrayPoly.reduceUnique(), []);
  }

  private async deleteMovedRoms(
    indexedRoms: IndexedFiles,
    movedWriteCandidates: WriteCandidate[],
    writtenFilesToExclude: File[],
  ): Promise<void> {
    if (movedWriteCandidates.length === 0) {
      return;
    }

    const progressBarName = 'Deleting moved files';
    const progressBar = this.multiBar.addSingleBar({ name: progressBarName });
    const deletedFilePaths = await new MovedROMDeleter(this.options, progressBar).delete(
      indexedRoms,
      movedWriteCandidates,
      writtenFilesToExclude,
    );

    progressBar.setName('Deleting empty input subdirectories');
    await new InputSubdirectoriesDeleter(this.options, progressBar).delete(
      movedWriteCandidates.flatMap((wc) => wc.getRomsWithFiles().map((rwf) => rwf.getInputFile())),
    );

    progressBar.setName(progressBarName);
    progressBar.finishWithItems(deletedFilePaths.length, 'moved file', 'deleted');
    if (deletedFilePaths.length > 0) {
      progressBar.freeze();
    } else {
      progressBar.delete();
    }
  }

  private async processOutputCleaner(
    dirsToClean: string[],
    writtenFilesToExclude: File[],
  ): Promise<string[]> {
    if (!this.options.shouldWrite() || !this.options.shouldClean() || dirsToClean.length === 0) {
      return [];
    }

    const progressBar = this.multiBar.addSingleBar({ name: 'Cleaning output directory' });
    const uniqueDirsToClean = dirsToClean.reduce(ArrayPoly.reduceUnique(), []);
    const filesCleaned = await new DirectoryCleaner(this.options, progressBar).clean(
      uniqueDirsToClean,
      writtenFilesToExclude,
    );
    progressBar.finishWithItems(filesCleaned.length, 'file', 'recycled');
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

    const reportProgressBar = this.multiBar.addSingleBar({
      name: 'Generating report',
      symbol: ProgressBarSymbol.WRITING,
    });
    await new ReportGenerator(this.options, reportProgressBar).generate(
      scannedRomFiles,
      cleanedOutputFiles,
      datsStatuses,
    );
  }
}
