import async from 'async';

import Logger from './console/logger.js';
import ProgressBarCLI from './console/progressBarCLI.js';
import CandidateFilter from './modules/candidateFilter.js';
import CandidateGenerator from './modules/candidateGenerator.js';
import DATScanner from './modules/datScanner.js';
import OutputCleaner from './modules/outputCleaner.js';
import ReportGenerator from './modules/reportGenerator.js';
import ROMScanner from './modules/romScanner.js';
import ROMWriter from './modules/romWriter.js';
import StatusGenerator from './modules/statusGenerator.js';
import DATStatus from './types/datStatus.js';
import DAT from './types/logiqx/dat.js';
import Parent from './types/logiqx/parent.js';
import Options from './types/options.js';
import ROMFile from './types/romFile.js';

export default class Igir {
  private readonly options: Options;

  private readonly logger: Logger;

  constructor(options: Options, logger: Logger) {
    this.options = options;
    this.logger = logger;
  }

  async main() {
    // Find all DAT files and parse them
    const dats = await this.processDATScanner();

    // Find all ROM files and pre-process them
    const romInputs = await this.processROMScanner();

    const datProcessProgressBar = this.logger.addProgressBar('Processing DATs', '⚙️', dats.length);
    const datsToWrittenRoms = new Map<DAT, Map<Parent, ROMFile[]>>();
    const datsStatuses: DATStatus[] = [];

    await async.eachLimit(dats, 3, async (dat, callback) => {
      const progressBar = this.logger.addProgressBar(dat.getNameShort(), '⏳', dat.getParents().length);
      await datProcessProgressBar.increment();

      // For each DAT, find all ROM candidates
      const romCandidates = await new CandidateGenerator(progressBar).generate(dat, romInputs);

      // Filter all ROM candidates
      const romOutputs = await new CandidateFilter(this.options, progressBar)
        .filter(dat, romCandidates);

      // Write the output files
      const writtenRoms = await new ROMWriter(this.options, progressBar).write(dat, romOutputs);
      datsToWrittenRoms.set(dat, writtenRoms);

      // Write the output report
      const status = await new StatusGenerator(this.options, progressBar).output(dat, romOutputs);
      datsStatuses.push(status);

      // Progress bar cleanup
      const parentsWithRomFiles = [...writtenRoms.values()]
        .filter((romFiles) => romFiles.length)
        .length;
      if (parentsWithRomFiles === 0) {
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
    const progressBar = this.logger.addProgressBar('Scanning for DATs', '⏳');
    const dats = await new DATScanner(this.options, progressBar).scan();
    if (!dats.length) {
      ProgressBarCLI.stop();
      throw new Error('No valid DAT files found!');
    }
    await progressBar.doneItems(dats.length, 'DAT', 'found');
    return dats;
  }

  private async processROMScanner(): Promise<ROMFile[]> {
    const progressBar = this.logger.addProgressBar('Scanning for ROMs', '⏳');
    const romInputs = await new ROMScanner(this.options, progressBar).scan();
    await progressBar.doneItems(romInputs.length, 'ROM', 'found');
    return romInputs;
  }

  private async processOutputCleaner(
    datsToWrittenRoms: Map<DAT, Map<Parent, ROMFile[]>>,
  ): Promise<void> {
    if (!this.options.shouldClean()) {
      return;
    }

    const cleanerProgressBar = this.logger.addProgressBar('Cleaning output', '⏳');
    const writtenRomFilesToExclude = [...datsToWrittenRoms.values()]
      .flatMap((parentsToRomFiles) => [...parentsToRomFiles.values()])
      .flatMap((romFiles) => romFiles);
    await new OutputCleaner(this.options, cleanerProgressBar).clean(writtenRomFilesToExclude);
  }

  private async processReportGenerator(datsStatuses: DATStatus[]) {
    if (!this.options.shouldReport()) {
      return;
    }

    const reportProgressBar = this.logger.addProgressBar('Generating report', '📝');
    await new ReportGenerator(this.options, reportProgressBar).generate(datsStatuses);
  }
}
