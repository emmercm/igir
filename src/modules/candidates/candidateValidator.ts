import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import ArrayPoly from '../../polyfill/arrayPoly.js';
import DAT from '../../types/dats/dat.js';
import WriteCandidate from '../../types/writeCandidate.js';
import Module from '../module.js';

/**
 * Validate candidates for write-ability after all generation and filtering has happened.
 */
export default class CandidateValidator extends Module {
  constructor(progressBar: ProgressBar) {
    super(progressBar, CandidateValidator.name);
  }

  /**
   * Validate the {@link WriteCandidate}s.
   */
  validate(dat: DAT, candidates: WriteCandidate[]): WriteCandidate[] {
    if (candidates.length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no candidates to validate`);
      return [];
    }

    this.progressBar.logTrace(`${dat.getName()}: validating candidates`);
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_VALIDATING);
    this.progressBar.reset(candidates.length);

    const conflictedOutputPaths = this.validateUniqueOutputPaths(dat, candidates);
    if (conflictedOutputPaths.length > 0) {
      return conflictedOutputPaths;
    }

    this.progressBar.logTrace(`${dat.getName()}: done validating candidates`);
    return [];
  }

  private validateUniqueOutputPaths(dat: DAT, candidates: WriteCandidate[]): WriteCandidate[] {
    const outputPathsToCandidates = candidates.reduce((map, candidate) => {
      candidate.getRomsWithFiles().forEach((romWithFiles) => {
        const key = romWithFiles.getOutputFile().getFilePath();
        if (!map.has(key)) {
          map.set(key, [candidate]);
        } else {
          map.get(key)?.push(candidate);
        }
      });
      return map;
    }, new Map<string, WriteCandidate[]>());

    return [...outputPathsToCandidates.entries()]
      .filter(([outputPath, candidates]) => {
        const uniqueCandidates = candidates
          .filter(ArrayPoly.filterUniqueMapped((candidate) => candidate.getGame()))
          .sort();
        if (uniqueCandidates.length < 2) {
          return false;
        }

        let message = `${dat.getName()}: multiple games writing to the same output path: ${outputPath}`;
        uniqueCandidates.forEach((candidate) => {
          message += `\n  ${candidate.getName()}`;
        });
        this.progressBar.logError(message);
        return true;
      })
      .flatMap(([, candidates]) => candidates)
      .reduce(ArrayPoly.reduceUnique(), []);
  }
}
