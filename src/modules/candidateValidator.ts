import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import DAT from '../types/dats/dat.js';
import Parent from '../types/dats/parent.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import Module from './module.js';

/**
 * Validate candidates for write-ability after all generation and filtering has happened.
 */
export default class CandidateValidator extends Module {
  constructor(progressBar: ProgressBar) {
    super(progressBar, CandidateValidator.name);
  }

  /**
   * Validate the {@link ReleaseCandidate}s.
   */
  async validate(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<ReleaseCandidate[]> {
    if (parentsToCandidates.size === 0) {
      this.progressBar.logTrace(`${dat.getNameShort()}: no parents to validate candidates for`);
      return [];
    }

    this.progressBar.logTrace(`${dat.getNameShort()}: validating candidates`);
    await this.progressBar.setSymbol(ProgressBarSymbol.VALIDATING);
    await this.progressBar.reset(parentsToCandidates.size);

    const conflictedOutputPaths = this.validateUniqueOutputPaths(dat, parentsToCandidates);
    if (conflictedOutputPaths.length > 0) {
      return conflictedOutputPaths;
    }

    this.progressBar.logTrace(`${dat.getNameShort()}: done validating candidates`);
    return [];
  }

  private validateUniqueOutputPaths(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): ReleaseCandidate[] {
    const outputPathsToCandidates = [...parentsToCandidates.values()]
      .flat()
      .reduce((map, releaseCandidate) => {
        releaseCandidate.getRomsWithFiles().forEach((romWithFiles) => {
          const key = romWithFiles.getOutputFile().getFilePath();
          map.set(key, [...(map.get(key) ?? []), releaseCandidate]);
        });
        return map;
      }, new Map<string, ReleaseCandidate[]>());

    return [...outputPathsToCandidates.entries()]
      .filter(([outputPath, candidates]) => {
        const uniqueCandidates = candidates
          .filter(ArrayPoly.filterUniqueMapped((candidate) => candidate.getGame()))
          .sort();
        if (uniqueCandidates.length < 2) {
          return false;
        }

        let message = `${dat.getNameShort()}: multiple games writing to the same output path: ${outputPath}`;
        uniqueCandidates.forEach((candidate) => { message += `\n  ${candidate.getName()}`; });
        this.progressBar.logError(message);
        return true;
      })
      .flatMap(([, candidates]) => candidates)
      .reduce(ArrayPoly.reduceUnique(), []);
  }
}
