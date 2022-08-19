import ProgressBar from '../console/progressBar.js';
import DATStatus from '../types/datStatus.js';
import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';

export default class StatusGenerator {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async output(
    dat: DAT,
    parentsToReleaseCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<DATStatus> {
    const datStatus = new DATStatus(dat, parentsToReleaseCandidates);

    await this.progressBar.done(datStatus.toString(this.options));

    return datStatus;
  }
}
