import async from 'async';
import path from 'path';

import Logger from './console/logger.js';
import { ProgressBarSymbol } from './console/progressBar.js';
import ProgressBarCLI from './console/progressBarCLI.js';
import CandidateFilter from './modules/candidateFilter.js';
import CandidateGenerator from './modules/candidateGenerator.js';
import CombinedCandidateGenerator from './modules/combinedCandidateGenerator.js';
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
import FixDATCreator from "./modules/fixDatCreator.js";

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
      throw new Error('No DAT contains parent/clone information, cannot process --single');
    }

    const datsToWrittenRoms = new Map<DAT, Map<Parent, File[]>>();
    const romOutputDirs: string[] = [];
    const datsStatuses: DATStatus[] = [];

    // Process every DAT
    await datProcessProgressBar.logInfo(`processing ${dats.length.toLocaleString()} DAT${dats.length !== 1 ? 's' : ''}`);
    await async.eachLimit(dats, this.options.getDatThreads(), async (dat, callback) => {
      const progressBar = await this.logger.addProgressBar(
        dat.getNameShort(),
        ProgressBarSymbol.WAITING,
        dat.getParents().length,
      );

      // Generate and filter ROM candidates
      const parentsToCandidates = await new CandidateGenerator(this.options, progressBar)
        .generate(dat, processedRomFiles);
      const parentsToPatchedCandidates = await new PatchCandidateGenerator(progressBar)
        .generate(dat, parentsToCandidates, patches);
      romOutputDirs.push(...this.getCandidateOutputDirs(dat, parentsToPatchedCandidates));
      const parentsToFilteredCandidates = await new CandidateFilter(this.options, progressBar)
        .filter(dat, parentsToPatchedCandidates);
      const parentsToCombinedCandidates = await new CombinedCandidateGenerator(
        this.options,
        progressBar,
      ).generate(dat, parentsToFilteredCandidates);

      // Write the output files
      await new ROMWriter(this.options, progressBar).write(dat, parentsToCombinedCandidates);
      const writtenRoms = [...parentsToCombinedCandidates.entries()]
        .reduce((map, [parent, releaseCandidates]) => {
          const parentWrittenRoms = releaseCandidates
            .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
            .map((romWithFiles) => romWithFiles.getOutputFile());
          map.set(parent, parentWrittenRoms);
          return map;
        }, new Map<Parent, File[]>());
      datsToWrittenRoms.set(dat, writtenRoms);

      // Write a fixdat
      await new FixDATCreator(this.options, progressBar).write(dat, parentsToCombinedCandidates);

      // Write the output report
      const datStatus = await new StatusGenerator(this.options, progressBar)
        .output(dat, parentsToCombinedCandidates);
      datsStatuses.push(datStatus);

      // Progress bar cleanup
      const totalReleaseCandidates = [...parentsToCombinedCandidates.values()]
        .reduce((sum, rcs) => sum + rcs.length, 0);
      if (totalReleaseCandidates > 0) {
        await progressBar.freeze();
      } else {
        progressBar.delete();
      }

      await datProcessProgressBar.increment();
      callback();
    });
    await datProcessProgressBar.logInfo(`done processing ${dats.length.toLocaleString()} DAT${dats.length !== 1 ? 's' : ''}`);

    await datProcessProgressBar.doneItems(dats.length, 'DAT', 'processed');
    datProcessProgressBar.delete();

    // Clean the output directories
    const cleanedOutputFiles = await this.processOutputCleaner(romOutputDirs, datsToWrittenRoms);

    // Generate the report
    await this.processReportGenerator(rawRomFiles, cleanedOutputFiles, datsStatuses);

    ProgressBarCLI.stop();
  }

  private async processDATScanner(): Promise<DAT[]> {
    if (!this.options.usingDats()) {
      this.logger.warn('No DAT files provided, consider using some for the best results!');
      return [];
    }

    const progressBar = await this.logger.addProgressBar('Scanning for DATs');
    const dats = await new DATScanner(this.options, progressBar).scan();
    if (!dats.length) {
      throw new Error('No valid DAT files found!');
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
  ): Promise<string[]> {
    if (!this.options.shouldWrite() || !this.options.shouldClean()) {
      return [];
    }

    const progressBar = await this.logger.addProgressBar('Cleaning output directory');
    const uniqueDirsToClean = dirsToClean.filter((dir, idx, dirs) => dirs.indexOf(dir) === idx);
    const writtenFilesToExclude = [...datsToWrittenRoms.values()]
      .flatMap((parentsToFiles) => [...parentsToFiles.values()])
      .flatMap((files) => files);
    const filesCleaned = await new OutputCleaner(this.options, progressBar)
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
      scannedRomFiles.map((file) => file.getFilePath()),
      cleanedOutputFiles,
      datsStatuses,
    );
  }
}
