import ProgressBar from '../console/progressBar.js';
import DAT from '../types/dats/dat.js';
import Parent from '../types/dats/parent.js';
import DATStatus from '../types/datStatus.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import Module from './module.js';

/**
 * Generate the status for a DAT, and print a short status to the progress bar.
 *
 * This class may be run concurrently with other classes.
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
  async generate(
    dat: DAT,
    parentsToReleaseCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<DATStatus> {
    this.progressBar.logInfo(`${dat.getNameShort()}: generating ROM statuses`);

    const datStatus = new DATStatus(dat, this.options, parentsToReleaseCandidates);

    await this.progressBar.done(datStatus.toConsole(this.options));

    this.progressBar.logInfo(`${dat.getNameShort()}: done generating ROM statuses`);
    return datStatus;
  }
}
