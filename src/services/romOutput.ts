import { SingleBar } from 'cli-progress';
import path from 'path';

import DAT from '../types/dat/dat';
import Parent from '../types/dat/parent';
import Options from '../types/options';
import ProgressBar from '../types/progressBar';
import ReleaseCandidate from '../types/releaseCandidate';
import ROMFile from '../types/romFile';

export default class ROMWriter {
  static write(
    options: Options,
    progressBar: ProgressBar,
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Map<Parent, ROMFile[]> {
    const outputDir = path.join(options.getOutput(), dat.getName());

    const output = new Map<Parent, ROMFile[]>();

    progressBar.reset(parentsToCandidates.size).setSymbol('📂');

    parentsToCandidates.forEach((releaseCandidates, parent) => {
      progressBar.increment();

      releaseCandidates.forEach((releaseCandidate) => {
        /**
           * For every romFiles:
           * - Extract if necessary
           * - Rename
           * Zip all together if necessary
           * Don't do anything if dry run
           */
      });
    });

    return output;
  }
}
