import ProgressBar from '../console/progressBar.js';
import DAT from '../types/dats/dat.js';
import DATStatus from '../types/datStatus.js';
import WriteCandidate from '../types/writeCandidate.js';
import Module from './module.js';

/**
 * Generate the status for a DAT, and print a short status to the progress bar.
 */
export default class StatusGenerator extends Module {
  constructor(progressBar: ProgressBar) {
    super(progressBar, StatusGenerator.name);
  }

  /**
   * Generate a {@link DATStatus} for the {@link DAT}.
   */
  generate(dat: DAT, candidates: WriteCandidate[]): DATStatus {
    this.progressBar.logTrace(`${dat.getName()}: generating ROM statuses`);

    const datStatus = new DATStatus(dat, candidates);

    this.progressBar.logTrace(`${dat.getName()}: done generating ROM statuses`);
    return datStatus;
  }
}
