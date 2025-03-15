import ProgressBar from '../console/progressBar.js';
import DAT from '../types/dats/dat.js';
import Parent from '../types/dats/parent.js';
import DATStatus from '../types/datStatus.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
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
  generate(dat: DAT, parentsToReleaseCandidates: Map<Parent, ReleaseCandidate[]>): DATStatus {
    this.progressBar.logTrace(`${dat.getName()}: generating ROM statuses`);

    const datStatus = new DATStatus(dat, this.options, parentsToReleaseCandidates);

    this.progressBar.logTrace(`${dat.getName()}: done generating ROM statuses`);
    return datStatus;
  }
}
