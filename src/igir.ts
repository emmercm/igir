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
import File from './types/file.js';
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
    const dats = await this.processDATScanner();
    const rawRomFiles = await this.processROMScanner();

    const datProcessProgressBar = this.logger.addProgressBar('Processing DATs', Symbols.PROCESSING, dats.length);
    const datsToWrittenRoms = new Map<DAT, Map<Parent, File[]>>();
    const datsStatuses: DATStatus[] = [];

    await async.eachLimit(dats, Constants.DAT_THREADS, async (dat, callback) => {
      const progressBar = this.logger.addProgressBar(
        dat.getNameShort(),
        Symbols.WAITING,
        dat.getParents().length,
      );
      await datProcessProgressBar.increment();

      // Process ROM headers
      const processedRomFiles = await new HeaderProcessor(progressBar).process(dat, rawRomFiles);

      // Generate and filter ROM candidates
      const romCandidates = await new CandidateGenerator(progressBar)
        .generate(dat, processedRomFiles);
      const romOutputs = await new CandidateFilter(this.options, progressBar)
        .filter(dat, romCandidates);

      // Write the output files
      const writtenRoms = await new ROMWriter(this.options, progressBar).write(dat, romOutputs);
      datsToWrittenRoms.set(dat, writtenRoms);

      // Write the output report
      const status = await new StatusGenerator(this.options, progressBar).output(dat, romOutputs);
      datsStatuses.push(status);

      // Progress bar cleanup
      const totalReleaseCandidates = [...romOutputs.values()]
        .filter((releaseCandidates) => releaseCandidates.length)
        .length;
      if (totalReleaseCandidates === 0) {
        progressBar.delete();
      }

      callback();
    });

    await datProcessProgressBar.doneItems(dats.length, 'DAT', 'processed');

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
    await progressBar.doneItems(dats.length, 'DAT', 'found');
    return dats;
  }

  private async processROMScanner(): Promise<File[]> {
    const progressBar = this.logger.addProgressBar('Scanning for ROMs', Symbols.WAITING);
    const romInputs = await new ROMScanner(this.options, progressBar).scan();
    // TODO(cemmer): is this reporting the right number? it might be inflated
    await progressBar.doneItems(romInputs.length, 'ROM', 'found');
    return romInputs;
  }

  private async processOutputCleaner(
    datsToWrittenRoms: Map<DAT, Map<Parent, File[]>>,
  ): Promise<void> {
    if (!this.options.shouldClean()) {
      return;
    }

    const cleanerProgressBar = this.logger.addProgressBar('Cleaning output directory', Symbols.WAITING);
    const writtenFilesToExclude = [...datsToWrittenRoms.values()]
      .flatMap((parentsToFiles) => [...parentsToFiles.values()])
      .flatMap((files) => files);
    const filesCleaned = await new OutputCleaner(this.options, cleanerProgressBar)
      .clean(writtenFilesToExclude);
    await cleanerProgressBar.doneItems(filesCleaned, 'file', 'recycled');
  }

  private async processReportGenerator(datsStatuses: DATStatus[]): Promise<void> {
    if (!this.options.shouldReport()) {
      return;
    }

    const reportProgressBar = this.logger.addProgressBar('Generating report', Symbols.WRITING);
    await new ReportGenerator(this.options, reportProgressBar).generate(datsStatuses);
  }
}
