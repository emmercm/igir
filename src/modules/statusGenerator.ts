import type ProgressBar from '../console/progressBar.js';
import type DAT from '../models/dats/dat.js';
import DATStatus from '../models/datStatus.js';
import type Options from '../models/options.js';
import type WriteCandidate from '../models/writeCandidate.js';
import Module from './module.js';

/**
 * Generate the status for a DAT, and print a short status to the progress bar.
 */
export default class StatusGenerator extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, StatusGenerator.name);
    this.options = options;
  }

  /**
   * Generate a {@link DATStatus} for the {@link DAT}.
   */
  generate(dat: DAT, candidates: WriteCandidate[]): DATStatus {
    this.prefixedLogger.trace(`${dat.getName()}: generating ROM statuses`);

    const datStatus = new DATStatus(this.options, dat, candidates);

    this.prefixedLogger.trace(`${dat.getName()}: done generating ROM statuses`);
    return datStatus;
  }
}
