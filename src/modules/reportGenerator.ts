import fs from 'fs';
import moment from 'moment';

import ProgressBarCLI from '../console/progressBarCLI.js';
import Constants from '../constants.js';
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
    const report = this.options.getOutputReport();
    const append = (message: string): void => fs.appendFileSync(report, `${message.trimEnd()}\n`);

    append(`// ${Constants.COMMAND_NAME}, ${moment().format()}\n// ${report}`);

    datsStatuses
      .sort((a, b) => a.getDATName().localeCompare(b.getDATName()))
      .forEach((datsStatus) => {
        append(`\n${datsStatus.toReport(this.options)}`);
      });

    await this.progressBar.done(report);
  }
}
