import async from 'async';
import path from 'path';

import Logger from './console/logger.js';
import { ProgressBarSymbol } from './console/progressBar.js';
import ProgressBarCLI from './console/progressBarCLI.js';
import Constants from './constants.js';
import CandidateFilter from './modules/candidateFilter.js';
import CandidateGenerator from './modules/candidateGenerator.js';
import DATInferrer from './modules/datInferrer.js';
import DATScanner from './modules/datScanner.js';
import HeaderProcessor from './modules/headerProcessor.js';
import OutputCleaner from './modules/outputCleaner.js';
import PatchCandidateGenerator from './modules/patchCandidateGenerator.js';
import PatchScanner from './modules/patchScanner.js';
import ReportGenerator from './modules/reportGenerator.js';
import ROMScanner from './modules/romScanner.js';
import ROMWriter from './modules/romWriter.js';
import StatusGenerator from './modules/statusGenerator.js';
import DATStatus from './types/datStatus.js';
import File from './types/files/file.js';
import DAT from './types/logiqx/dat.js';
import Parent from './types/logiqx/parent.js';
import Options from './types/options.js';
import Patch from './types/patches/patch.js';
import ReleaseCandidate from './types/releaseCandidate.js';

export default class Igir {
  private readonly options: Options;

  private readonly logger: Logger;

  constructor(options: Options, logger: Logger) {
    this.options = options;
    this.logger = logger;
  }

  async main(): Promise<void> {
    // Scan and process input files
    let dats = await this.processDATScanner();
    const rawRomFiles = await this.processROMScanner();
    const patches = await this.processPatchScanner();
    const processedRomFiles = await this.processHeaderProcessor(rawRomFiles);

    // Set up progress bar and input for DAT processing
    const datProcessProgressBar = await this.logger.addProgressBar('Processing DATs', ProgressBarSymbol.PROCESSING, dats.length);
    if (!dats.length) {
      dats = await new DATInferrer(datProcessProgressBar).infer(processedRomFiles);
    }

    if (this.options.getSingle() && !dats.some((dat) => dat.hasParentCloneInfo())) {
      ProgressBarCLI.stop();
      throw new Error('No DAT contains parent/clone information, cannot process --single');
    }

    const datsToWrittenRoms = new Map<DAT, Map<Parent, File[]>>();
    const romOutputDirs: string[] = [];
    const datsStatuses: DATStatus[] = [];

    // Process every DAT
    await datProcessProgressBar.logInfo(`Processing ${dats.length.toLocaleString()} DAT${dats.length !== 1 ? 's' : ''}`);
    await async.eachLimit(dats, Constants.DAT_THREADS, async (dat, callback) => {
      const progressBar = await this.logger.addProgressBar(
        dat.getNameShort(),
        ProgressBarSymbol.WAITING,
        dat.getParents().length,
      );

      // Generate and filter ROM candidates
      const parentsToCandidates = await new CandidateGenerator(this.options, progressBar)
        .generate(dat, processedRomFiles);
      const parentsToCandidatesPatched = await new PatchCandidateGenerator(progressBar)
        .generate(dat, parentsToCandidates, patches);
      romOutputDirs.push(...this.getCandidateOutputDirs(dat, parentsToCandidatesPatched));
      const romOutputs = await new CandidateFilter(this.options, progressBar)
        .filter(dat, parentsToCandidatesPatched);

      // Write the output files
      await new ROMWriter(this.options, progressBar).write(dat, romOutputs);
      const writtenRoms = [...romOutputs.entries()]
        .reduce((map, [parent, releaseCandidates]) => {
          const parentWrittenRoms = releaseCandidates
            .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
            .map((romWithFiles) => romWithFiles.getOutputFile());
          map.set(parent, parentWrittenRoms);
          return map;
        }, new Map<Parent, File[]>());
      datsToWrittenRoms.set(dat, writtenRoms);

      // Write the output report
      const datStatus = await new StatusGenerator(this.options, progressBar)
        .output(dat, romOutputs);
      datsStatuses.push(datStatus);

      // Progress bar cleanup
      const totalReleaseCandidates = [...parentsToCandidatesPatched.values()]
        .reduce((sum, rcs) => sum + rcs.length, 0);
      if (totalReleaseCandidates > 0) {
        await progressBar.freeze();
      } else {
        progressBar.delete();
      }

      await datProcessProgressBar.increment();
      callback();
    });
    await datProcessProgressBar.logInfo(`Done processing ${dats.length.toLocaleString()} DAT${dats.length !== 1 ? 's' : ''}`);

    await datProcessProgressBar.doneItems(dats.length, 'DAT', 'processed');
    datProcessProgressBar.delete();

    // Clean the output directories
    await this.processOutputCleaner(romOutputDirs, datsToWrittenRoms);

    // Generate the report
    await this.processReportGenerator(datsStatuses);

    ProgressBarCLI.stop();
  }

  private async processDATScanner(): Promise<DAT[]> {
    if (!this.options.getDatFileCount()) {
      return [];
    }

    const progressBar = await this.logger.addProgressBar('Scanning for DATs');
    const dats = await new DATScanner(this.options, progressBar).scan();
    if (!dats.length) {
      progressBar.delete();
      if (this.options.usingDats()) {
        ProgressBarCLI.stop();
        throw new Error('No valid DAT files found!');
      }
      await progressBar.logWarn('No DAT files provided, consider using some for the best results!');
      return [];
    }

    await progressBar.doneItems(dats.length, 'unique DAT', 'found');
    await progressBar.freeze();
    return dats;
  }

  private async processROMScanner(): Promise<File[]> {
    const progressBar = await this.logger.addProgressBar('Scanning for ROMs');
    const roms = await new ROMScanner(this.options, progressBar).scan();
    await progressBar.doneItems(roms.length, 'unique ROM', 'found');
    await progressBar.freeze();
    return roms;
  }

  private async processPatchScanner(): Promise<Patch[]> {
    if (!this.options.getPatchFileCount()) {
      return [];
    }

    const progressBar = await this.logger.addProgressBar('Scanning for patches');
    const patches = await new PatchScanner(this.options, progressBar).scan();
    await progressBar.doneItems(patches.length, 'unique patch', 'found');
    await progressBar.freeze();
    return patches;
  }

  private async processHeaderProcessor(romFiles: File[]): Promise<File[]> {
    const progressBar = await this.logger.addProgressBar('Detecting ROM headers');
    const processedRomFiles = await new HeaderProcessor(this.options, progressBar)
      .process(romFiles);
    await progressBar.doneItems(processedRomFiles.length, 'ROM', 'processed');
    await progressBar.freeze();
    return processedRomFiles;
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
          .flatMap((romWithFiles) => this.options.getOutputDirParsed(
            dat,
            romWithFiles.getInputFile().getFilePath(),
            releaseCandidate.getGame(),
            releaseCandidate.getRelease(),
            path.basename(romWithFiles.getOutputFile().getFilePath()),
          ))))
      .filter((outputDir, idx, outputDirs) => outputDirs.indexOf(outputDir) === idx);
  }

  private async processOutputCleaner(
    dirsToClean: string[],
    datsToWrittenRoms: Map<DAT, Map<Parent, File[]>>,
  ): Promise<void> {
    if (!this.options.shouldWrite() || !this.options.shouldClean()) {
      return;
    }

    const progressBar = await this.logger.addProgressBar('Cleaning output directory');
    const uniqueDirsToClean = dirsToClean.filter((dir, idx, dirs) => dirs.indexOf(dir) === idx);
    const writtenFilesToExclude = [...datsToWrittenRoms.values()]
      .flatMap((parentsToFiles) => [...parentsToFiles.values()])
      .flatMap((files) => files);
    const filesCleaned = await new OutputCleaner(this.options, progressBar)
      .clean(uniqueDirsToClean, writtenFilesToExclude);
    await progressBar.doneItems(filesCleaned, 'file', 'recycled');
    await progressBar.freeze();
  }

  private async processReportGenerator(datsStatuses: DATStatus[]): Promise<void> {
    if (!this.options.shouldReport()) {
      return;
    }

    const reportProgressBar = await this.logger.addProgressBar('Generating report', ProgressBarSymbol.WRITING);
    await new ReportGenerator(this.options, reportProgressBar).generate(datsStatuses);
  }
}
