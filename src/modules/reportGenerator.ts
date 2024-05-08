import ProgressBar from '../console/progressBar.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import FsPoly from '../polyfill/fsPoly.js';
import DATStatus, { GameStatus } from '../types/datStatus.js';
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
    this.progressBar.logTrace('generating report');

    const reportPath = this.options.getReportOutput();

    const anyGamesFoundAtAll = datStatuses
      .some((datStatus) => datStatus.anyGamesFound(this.options));
    const matchedFileCsvs = (await Promise.all(
      datStatuses
        .filter((datStatus) => datStatus.anyGamesFound(this.options) || !anyGamesFoundAtAll)
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

    const usedFiles = new Set(datStatuses
      .flatMap((datStatus) => datStatus.getInputFiles())
      .map((file) => file.getFilePath()));
    const unusedFiles = scannedRomFiles
      .reduce(ArrayPoly.reduceUnique(), [])
      .filter((inputFile) => !usedFiles.has(inputFile))
      .sort();
    const unusedCsv = await DATStatus.filesToCsv(unusedFiles, GameStatus.UNUSED);

    const cleanedCsv = await DATStatus.filesToCsv(cleanedOutputFiles, GameStatus.DELETED);

    this.progressBar.logInfo(`writing report '${reportPath}'`);
    const rows = [...matchedFileCsvs, unusedCsv, cleanedCsv].filter((csv) => csv);
    await FsPoly.writeFile(reportPath, rows.join('\n'));
    this.progressBar.logTrace(`wrote ${datStatuses.length.toLocaleString()} CSV row${datStatuses.length !== 1 ? 's' : ''}: ${reportPath}`);

    this.progressBar.logTrace('done generating report');
    await this.progressBar.done(reportPath);
    await this.progressBar.freeze();
  }
}
