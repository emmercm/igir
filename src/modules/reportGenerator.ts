import fs from 'fs';
import util from 'util';

import ProgressBar from '../console/progressBar.js';
import DATStatus from '../types/datStatus.js';
import Options from '../types/options.js';
import Module from './module.js';

/**
 * Generate a single report file with information about every DAT processed.
 *
 * This class will not be run concurrently with any other class.
 */
export default class ReportGenerator extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, ReportGenerator.name);
    this.options = options;
  }

  async generate(datsStatuses: DATStatus[]): Promise<void> {
    await this.progressBar.logInfo('Generating report');

    const report = this.options.getOutputReportPath();

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
    await util.promisify(fs.writeFile)(report, contents);
    await this.progressBar.logDebug(`${report}: wrote ${datsStatuses.length.toLocaleString()} status${datsStatuses.length !== 1 ? 'es' : ''}`);

    await this.progressBar.logInfo('Done generating report');
    await this.progressBar.done(report);
    await this.progressBar.freeze();
  }
}
