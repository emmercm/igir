import async from 'async';

import Logger from './console/logger.js';
import { Symbols } from './console/progressBar.js';
import ProgressBarCLI from './console/progressBarCLI.js';
import Constants from './constants.js';
import CandidateFilter from './modules/candidateFilter.js';
import CandidateGenerator from './modules/candidateGenerator.js';
import DATScanner from './modules/datScanner.js';
import HeaderProcessor from './modules/headerProcessor.js';
import OutputCleaner from './modules/outputCleaner.js';
import ReportGenerator from './modules/reportGenerator.js';
import ROMScanner from './modules/romScanner.js';
import ROMWriter from './modules/romWriter.js';
import StatusGenerator from './modules/statusGenerator.js';
import DATStatus from './types/datStatus.js';
import File from './types/files/file.js';
import DAT from './types/logiqx/dat.js';
import Parent from './types/logiqx/parent.js';
import Options from './types/options.js';

export default class Igir {
  private readonly options: Options;

  private readonly logger: Logger;

  constructor(options: Options, logger: Logger) {
    this.options = options;
    this.logger = logger;
  }

  async main(): Promise<void> {
    // Scan and process input files
    const dats = await this.processDATScanner();
    const rawRomFiles = await this.processROMScanner();
    const processedRomFiles = await this.processHeaderProcessor(rawRomFiles);

    // Set up progress bar and input for DAT processing
    const datProcessProgressBar = this.logger.addProgressBar('Processing DATs', Symbols.PROCESSING, dats.length);
    const datsToWrittenRoms = new Map<DAT, Map<Parent, File[]>>();
    const datsStatuses: DATStatus[] = [];

    // Process every DAT
    await async.eachLimit(dats, Constants.DAT_THREADS, async (dat, callback) => {
      const progressBar = this.logger.addProgressBar(
        dat.getNameShort(),
        Symbols.WAITING,
        dat.getParents().length,
      );
      await datProcessProgressBar.increment();

      // Generate and filter ROM candidates
      const parentsToCandidates = await new CandidateGenerator(this.options, progressBar)
        .generate(dat, processedRomFiles);
      const romOutputs = await new CandidateFilter(this.options, progressBar)
        .filter(dat, parentsToCandidates);

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
      const totalReleaseCandidates = [...parentsToCandidates.values()]
        .reduce((sum, rcs) => sum + rcs.length, 0);
      if (totalReleaseCandidates > 0) {
        await progressBar.freeze();
      } else {
        progressBar.delete();
      }

      callback();
    });

    await datProcessProgressBar.doneItems(dats.length, 'DAT', 'processed');
    datProcessProgressBar.delete();

    // Clean the output directories
    await this.processOutputCleaner(datsToWrittenRoms);

    // Generate the report
    await this.processReportGenerator(datsStatuses);

    ProgressBarCLI.stop();
  }

  private async processDATScanner(): Promise<DAT[]> {
    const progressBar = this.logger.addProgressBar('Scanning for DATs', Symbols.WAITING);
    const dats = await new DATScanner(this.options, progressBar).scan();
    if (!dats.length) {
      ProgressBarCLI.stop();
      throw new Error('No valid DAT files found!');
    }
    await progressBar.doneItems(dats.length, 'unique DAT', 'found');
    await progressBar.freeze();
    return dats;
  }

  private async processROMScanner(): Promise<File[]> {
    const progressBar = this.logger.addProgressBar('Scanning for ROMs', Symbols.WAITING);
    const romInputs = await new ROMScanner(this.options, progressBar).scan();
    await progressBar.doneItems(romInputs.length, 'unique ROM', 'found');
    await progressBar.freeze();
    return romInputs;
  }

  private async processHeaderProcessor(romFiles: File[]): Promise<File[]> {
    const progressBar = this.logger.addProgressBar('Detecting ROM headers', Symbols.WAITING);
    const processedRomFiles = await new HeaderProcessor(this.options, progressBar)
      .process(romFiles);
    await progressBar.doneItems(processedRomFiles.length, 'ROM', 'processed');
    await progressBar.freeze();
    return processedRomFiles;
  }

  private async processOutputCleaner(
    datsToWrittenRoms: Map<DAT, Map<Parent, File[]>>,
  ): Promise<void> {
    if (!this.options.shouldClean()) {
      return;
    }

    const progressBar = this.logger.addProgressBar('Cleaning output directory', Symbols.WAITING);
    const writtenFilesToExclude = [...datsToWrittenRoms.values()]
      .flatMap((parentsToFiles) => [...parentsToFiles.values()])
      .flatMap((files) => files);
    const filesCleaned = await new OutputCleaner(this.options, progressBar)
      .clean(writtenFilesToExclude);
    await progressBar.doneItems(filesCleaned, 'file', 'recycled');
    await progressBar.freeze();
  }

  private async processReportGenerator(datsStatuses: DATStatus[]): Promise<void> {
    if (!this.options.shouldReport()) {
      return;
    }

    const reportProgressBar = this.logger.addProgressBar('Generating report', Symbols.WRITING);
    await new ReportGenerator(this.options, reportProgressBar).generate(datsStatuses);
  }
}
