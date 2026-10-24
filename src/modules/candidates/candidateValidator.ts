import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import type DAT from '../../models/dats/dat.js';
import type Options from '../../models/options.js';
import type ROMWithFiles from '../../models/romWithFiles.js';
import type WriteCandidate from '../../models/writeCandidate.js';
import ArrayUtil from '../../utils/arrayUtil.js';
import Module from '../module.js';

/**
 * Validate candidates for write-ability after all generation and filtering has happened.
 */
export default class CandidateValidator extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, CandidateValidator.name);
    this.options = options;
  }

  /**
   * Validate the {@link WriteCandidate}s.
   */
  validate(dat: DAT, candidates: WriteCandidate[]): WriteCandidate[] {
    if (!this.options.shouldWrite()) {
      // No need to validate, we're not writing
      return [];
    }

    if (candidates.length === 0) {
      this.prefixedLogger.trace(`${dat.getName()}: no candidates to validate`);
      return [];
    }

    this.prefixedLogger.trace(`${dat.getName()}: validating candidates`);
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_VALIDATING);
    this.progressBar.resetProgress(candidates.length);

    const conflictedOutputPaths = this.validateUniqueOutputPaths(dat, candidates);
    if (conflictedOutputPaths.length > 0) {
      return conflictedOutputPaths;
    }

    this.prefixedLogger.trace(`${dat.getName()}: done validating candidates`);
    return [];
  }

  private validateUniqueOutputPaths(dat: DAT, candidates: WriteCandidate[]): WriteCandidate[] {
    const outputPathsToCandidates = candidates.reduce((map, candidate) => {
      for (const romWithFiles of candidate.getRomsWithFiles()) {
        const key = romWithFiles.getOutputFile().getFilePath();
        if (map.has(key)) {
          map.get(key)?.push(candidate);
        } else {
          map.set(key, [candidate]);
        }
      }
      return map;
    }, new Map<string, WriteCandidate[]>());

    return [...outputPathsToCandidates]
      .filter(([outputPath, candidates]) => {
        const uniqueCandidates = candidates
          .filter(ArrayUtil.filterUniqueMapped((candidate) => candidate.getGame()))
          .toSorted((a, b) => a.getName().localeCompare(b.getName()));
        if (uniqueCandidates.length <= 1) {
          return false;
        }

        const [firstCandidate, ...otherCandidates] = uniqueCandidates.map((candidate) =>
          candidate
            .getRomsWithFiles()
            .filter((romWithFiles) => romWithFiles.getOutputFile().getFilePath() === outputPath),
        );
        if (
          otherCandidates.every((romsWithFiles) =>
            CandidateValidator.writeTheSameOutputs(firstCandidate, romsWithFiles),
          )
        ) {
          // Multiple games want to write to the same output path, but they would all write the same
          // file with the same contents, so there's no conflict. This can happen when:
          //  - A CHD is scanned as multiple CHD subtypes (e.g. a "raw" disk and a CD-ROM .bin/.cue,
          //    or a GD-ROM .bin/.cue and .gdi/.bin/.raw), and a game is inferred for each of them
          //  - Different games contain identical files, such as an inferred game for a directory
          //    and an inferred game for one of the files inside it
          //  - Different games match different input files with identical contents, such as
          //    duplicate files or symlinks
          // CandidateWriter will de-duplicate these writes.
          return false;
        }

        let message = `${dat.getName()}: multiple games writing to the same output path: ${outputPath}`;
        for (const candidate of uniqueCandidates) {
          message += `\n  ${candidate.getName()}`;
        }
        this.prefixedLogger.error(message);
        return true;
      })
      .flatMap(([, candidates]) => candidates)
      .reduce(ArrayUtil.reduceUnique(), []);
  }

  /**
   * Return true if both lists of {@link ROMWithFiles} would write the same set of output files with
   * the same contents.
   */
  private static writeTheSameOutputs(
    romsWithFiles: ROMWithFiles[],
    otherRomsWithFiles: ROMWithFiles[],
  ): boolean {
    return (
      // Every file the first candidate writes must also be written, with the same contents, by the
      // other candidate. Otherwise, the other candidate would write different contents, or would
      // be missing a file (such as an archive entry) that the first candidate needs.
      romsWithFiles.every((romWithFiles) =>
        otherRomsWithFiles.some((otherRomWithFiles) =>
          romWithFiles.writesSameOutputAs(otherRomWithFiles),
        ),
      ) &&
      // And the reverse, so that the other candidate doesn't write any extra files that the first
      // candidate doesn't
      otherRomsWithFiles.every((otherRomWithFiles) =>
        romsWithFiles.some((romWithFiles) => otherRomWithFiles.writesSameOutputAs(romWithFiles)),
      )
    );
  }
}
