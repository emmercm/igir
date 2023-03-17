import fs from 'fs';
import util from 'util';

import ProgressBar from '../console/progressBar.js';
import DATStatus from '../types/datStatus.js';
import File from '../types/files/file.js';
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

  async generate(scannedRomFiles: File[], datStatuses: DATStatus[]): Promise<void> {
    await this.progressBar.logInfo('Generating report');

    const report = this.options.getOutputReportPath();

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

    const matchedFiles = datStatuses
      .flatMap((datStatus) => datStatus.getReleaseCandidates())
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .map((romWithFiles) => romWithFiles.getInputFile().getFilePath())
      .reduce((map, filePath) => {
        map.set(filePath, true);
        return map;
      }, new Map<string, boolean>());
    const unmatchedFiles = scannedRomFiles
      .map((romFile) => romFile.getFilePath())
      .filter((filePath, idx, filePaths) => filePaths.indexOf(filePath) === idx)
      .filter((inputFile) => !matchedFiles.has(inputFile))
      .sort();
    const unmatchedCsv = await DATStatus.unmatchedFilesToCsv(unmatchedFiles);

    const rows = [...matchedFileCsvs, unmatchedCsv].filter((csv) => csv);
    await util.promisify(fs.writeFile)(report, rows.join('\n'));
    await this.progressBar.logDebug(`${report}: wrote ${datStatuses.length.toLocaleString()} status${datStatuses.length !== 1 ? 'es' : ''}`);

    await this.progressBar.logInfo('Done generating report');
    await this.progressBar.done(report);
    await this.progressBar.freeze();
  }
}
