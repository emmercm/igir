import path from 'node:path';

import type ProgressBar from '../console/progressBar.js';
import DATStatus, { GameStatus } from '../models/datStatus.js';
import type File from '../models/files/file.js';
import type Options from '../models/options.js';
import ArrayUtil from '../utils/arrayUtil.js';
import FsUtil from '../utils/fsUtil.js';
import IntlUtil from '../utils/intlUtil.js';
import Module from './module.js';

/**
 * Generate a single report file with information about every DAT processed.
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
    scannedRomFiles: File[],
    cleanedOutputFiles: string[],
    datStatuses: DATStatus[],
  ): Promise<void> {
    this.prefixedLogger.trace('generating report');

    const reportPath = this.options.getReportOutput();

    const anyGamesFoundAtAll = datStatuses.some((datStatus) =>
      datStatus.anyGamesFound(this.options),
    );
    const matchedFileCsvs = (
      await Promise.all(
        datStatuses
          .filter((datStatus) => datStatus.anyGamesFound(this.options) || !anyGamesFoundAtAll)
          .toSorted((a, b) => a.getDATName().localeCompare(b.getDATName()))
          .map(async (datsStatus) => await datsStatus.toCsv(this.options)),
      )
    )
      .filter((csv) => csv.length > 0)
      .map((csv, idx) => {
        // Strip the CSV header from everything except the first file
        if (idx === 0) {
          return csv;
        }
        return csv.split('\n').slice(1).join('\n');
      });

    const usedFilePaths = new Set(
      datStatuses
        .flatMap((datStatus) => datStatus.getInputFiles())
        .map((file) => file.getFilePath()),
    );
    const usedHashes = new Set(
      datStatuses.flatMap((datStatus) => datStatus.getInputFiles()).map((file) => file.hashCode()),
    );

    const duplicateFilePaths = scannedRomFiles
      .filter(
        (inputFile) =>
          !usedFilePaths.has(inputFile.getFilePath()) && usedHashes.has(inputFile.hashCode()),
      )
      .map((inputFile) => inputFile.getFilePath())
      .reduce(ArrayUtil.reduceUnique(), [])
      .toSorted();
    const duplicateCsv = await DATStatus.filesToCsv(duplicateFilePaths, GameStatus.DUPLICATE);

    const unusedFilePaths = scannedRomFiles
      .filter(
        (inputFile) =>
          !usedFilePaths.has(inputFile.getFilePath()) && !usedHashes.has(inputFile.hashCode()),
      )
      .map((inputFile) => inputFile.getFilePath())
      .reduce(ArrayUtil.reduceUnique(), [])
      .toSorted();
    const unusedCsv = await DATStatus.filesToCsv(unusedFilePaths, GameStatus.UNUSED);

    const cleanedCsv = await DATStatus.filesToCsv(cleanedOutputFiles, GameStatus.DELETED);

    this.prefixedLogger.info(`writing report '${reportPath}'`);
    const reportPathDir = path.dirname(reportPath);
    if (!(await FsUtil.exists(reportPathDir))) {
      await FsUtil.mkdir(reportPathDir, { recursive: true });
    }
    const rows = [...matchedFileCsvs, duplicateCsv, unusedCsv, cleanedCsv].filter(
      (csv) => csv.length > 0,
    );
    await FsUtil.writeFile(reportPath, rows.join('\n'));
    this.prefixedLogger.trace(
      `wrote ${IntlUtil.toLocaleString(datStatuses.length)} CSV row${datStatuses.length === 1 ? '' : 's'}: ${reportPath}`,
    );

    this.prefixedLogger.trace('done generating report');
    this.progressBar.finish(reportPath);
    this.progressBar.freeze();
  }
}
