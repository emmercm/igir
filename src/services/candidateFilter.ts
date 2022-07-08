import path from 'path';

import DAT from '../types/dat/dat';
import Parent from '../types/dat/parent';
import Options from '../types/options';
import ReleaseCandidate from '../types/releaseCandidate';
import ROMFile from '../types/romFile';

export default class CandidateFilter {
  static filter(
    options: Options,
    candidates: Map<DAT, Map<Parent, ReleaseCandidate[]>>,
  ): Map<DAT, Map<Parent, ROMFile[]>> {
    const output = new Map<DAT, Map<Parent, ROMFile[]>>();

    candidates.forEach((parentToCandidates: Map<Parent, ReleaseCandidate[]>, dat: DAT) => {
      const datName = dat.getName()
        .replace(' (Parent-Clone)', '');
      const outputDir = path.join(options.getOutput(), datName);

      // Pre-filter
      // Sort
      // Post-filter?
    });

    return output;
  }
}
