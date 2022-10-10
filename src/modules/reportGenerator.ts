import { promises as fsPromises } from 'fs';

import ProgressBarCLI from '../console/progressBarCLI.js';
import DATStatus from '../types/datStatus.js';
import Options from '../types/options.js';

/**
 * Generate a single report file with information about every DAT processed.
 *
 * This class will not be run concurrently with any other class.
 */
export default class ReportGenerator {
  private readonly options: Options;

  private readonly progressBar: ProgressBarCLI;

  constructor(options: Options, progressBar: ProgressBarCLI) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async generate(datsStatuses: DATStatus[]): Promise<void> {
    await this.progressBar.logInfo('Generating report');

    const report = this.options.getOutputReport();

    const contents = (
      await Promise.all(datsStatuses
        .filter((datStatus) => datStatus.anyGamesFound(this.options))
        .sort((a, b) => a.getDATName().localeCompare(b.getDATName()))
        .map(async (datsStatus) => datsStatus.toCSV(this.options)))
    )
      .filter((csv) => csv)
      .map((csv, idx) => {
        // Strip the CSV header from everything except the first file
        if (idx === 0) {
          return csv;
        }
        return csv.split('\n').slice(1).join('\n');
      })
      .join('\n');
    await fsPromises.writeFile(report, contents);

    await this.progressBar.done(report);
  }
}
