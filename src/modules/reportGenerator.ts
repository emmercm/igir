import fs from 'node:fs';
import util from 'node:util';

import ProgressBar from '../console/progressBar.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import DATStatus, { Status } from '../types/datStatus.js';
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

  /**
   * Generate the report.
   */
  async generate(
    scannedRomFiles: string[],
    cleanedOutputFiles: string[],
    datStatuses: DATStatus[],
  ): Promise<void> {
    this.progressBar.logInfo('generating report');

    const report = this.options.getReportOutput();

    const matchedFileCsvs = (await Promise.all(
      datStatuses
        .filter((datStatus) => datStatus.anyGamesFound(this.options))
        .sort((a, b) => a.getDATName().localeCompare(b.getDATName()))
        .map(async (datsStatus) => datsStatus.toCsv(this.options)),
    ))
      .filter((csv) => csv)
      .map((csv, idx) => {
        // Strip the CSV header from everything except the first file
        if (idx === 0) {
          return csv;
        }
        return csv.split('\n').slice(1).join('\n');
      });

    const releaseCandidates = datStatuses
      .flatMap((datStatus) => datStatus.getReleaseCandidates())
      .filter(ArrayPoly.filterNotNullish);
    const usedFiles = new Set(releaseCandidates
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .map((romWithFiles) => romWithFiles.getInputFile().getFilePath()));
    const unusedFiles = scannedRomFiles
      .reduce(ArrayPoly.reduceUnique(), [])
      .filter((inputFile) => !usedFiles.has(inputFile))
      .sort();
    const unusedCsv = await DATStatus.filesToCsv(unusedFiles, Status.UNUSED);

    const cleanedCsv = await DATStatus.filesToCsv(cleanedOutputFiles, Status.DELETED);

    const rows = [...matchedFileCsvs, unusedCsv, cleanedCsv].filter((csv) => csv);
    await util.promisify(fs.writeFile)(report, rows.join('\n'));
    this.progressBar.logDebug(`${report}: wrote ${datStatuses.length.toLocaleString()} CSV row${datStatuses.length !== 1 ? 's' : ''}`);

    this.progressBar.logInfo('done generating report');
    await this.progressBar.done(report);
    await this.progressBar.freeze();
  }
}
