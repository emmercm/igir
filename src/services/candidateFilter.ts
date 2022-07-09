import Parent from '../types/dat/parent';
import Options from '../types/options';
import ProgressBar from '../types/progressBar';
import ReleaseCandidate from '../types/releaseCandidate';

export default class CandidateFilter {
  static filter(
    options: Options,
    progressBar: ProgressBar,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Map<Parent, ReleaseCandidate[]> {
    const output = new Map<Parent, ReleaseCandidate[]>();

    progressBar.reset(parentsToCandidates.size).setSymbol('🧼️');

    parentsToCandidates.forEach((releaseCandidates: ReleaseCandidate[], parent: Parent) => {
      progressBar.increment();

      const filteredReleaseCandidates = releaseCandidates
        .filter((rc, idx) => this.preFilter(options, rc, idx))
        .sort((a, b) => this.sort(options, a, b))
        .filter((rc, idx) => this.postFilter(options, rc, idx));
      output.set(parent, filteredReleaseCandidates);
    });

    return output;
  }

  private static preFilter(
    options: Options,
    releaseCandidate: ReleaseCandidate,
    idx: number,
  ): boolean {
    // TODO(cemmer): apply rules like "no BIOS", "no homebrew", etc.
    return true;
  }

  private static sort(options: Options, a: ReleaseCandidate, b: ReleaseCandidate): number {
    // TODO(cemmer): apply sorting by region and language
    return 1;
  }

  private static postFilter(
    options: Options,
    releaseCandidate: ReleaseCandidate,
    idx: number,
  ): boolean {
    // TODO(cemmer): apply limit 1 rules
    return idx === 0;
  }
}
