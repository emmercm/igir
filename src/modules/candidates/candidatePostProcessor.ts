import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import DAT from '../../types/dats/dat.js';
import Parent from '../../types/dats/parent.js';
import Options from '../../types/options.js';
import OutputFactory from '../../types/outputFactory.js';
import ReleaseCandidate from '../../types/releaseCandidate.js';
import ROMWithFiles from '../../types/romWithFiles.js';
import Module from '../module.js';

/**
 * Perform any {@link Parent} and {@link ReleaseCandidate} manipulations needed after candidates
 * have had patches attached and have been filtered.
 */
export default class CandidatePostProcessor extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, CandidatePostProcessor.name);
    this.options = options;
  }

  /**
   * Post-process the candidates.
   */
  process(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Map<Parent, ReleaseCandidate[]> {
    if (parentsToCandidates.size === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no parents, so no candidates to process`);
      return parentsToCandidates;
    }

    this.progressBar.logTrace(`${dat.getName()}: processing candidates`);
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_GENERATING);
    this.progressBar.reset(parentsToCandidates.size);

    // Get the output basename of every ROM
    const outputFileBasenames = [...parentsToCandidates.values()]
      .flat()
      .flatMap((releaseCandidate) =>
        releaseCandidate.getRomsWithFiles().map((romWithFiles) => {
          const outputPathParsed = OutputFactory.getPath(
            this.options,
            dat,
            releaseCandidate.getGame(),
            releaseCandidate.getRelease(),
            romWithFiles.getRom(),
            romWithFiles.getInputFile(),
          );
          return outputPathParsed.name + outputPathParsed.ext;
        }),
      );

    const processedCandidates = new Map(
      [...parentsToCandidates.entries()].map(
        ([parent, releaseCandidates]): [Parent, ReleaseCandidate[]] => {
          const newReleaseCandidates = releaseCandidates.map((releaseCandidate) =>
            this.mapReleaseCandidate(dat, releaseCandidate, outputFileBasenames),
          );
          return [parent, newReleaseCandidates];
        },
      ),
    );

    this.progressBar.logTrace(`${dat.getName()}: done processing candidates`);
    return processedCandidates;
  }

  private mapReleaseCandidate(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
    outputFileBasenames: string[],
  ): ReleaseCandidate {
    const newRomsWithFiles = this.mapRomsWithFiles(
      dat,
      releaseCandidate,
      releaseCandidate.getRomsWithFiles(),
      outputFileBasenames,
    );

    return releaseCandidate.withRomsWithFiles(newRomsWithFiles);
  }

  private mapRomsWithFiles(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
    romsWithFiles: ROMWithFiles[],
    outputFileBasenames: string[],
  ): ROMWithFiles[] {
    return romsWithFiles.map((romWithFiles) => {
      const newOutputPath = OutputFactory.getPath(
        this.options,
        dat,
        releaseCandidate.getGame(),
        releaseCandidate.getRelease(),
        romWithFiles.getRom(),
        romWithFiles.getInputFile(),
        outputFileBasenames,
      ).format();
      if (newOutputPath === romWithFiles.getOutputFile().getFilePath()) {
        return romWithFiles;
      }

      const newOutputFile = romWithFiles.getOutputFile().withFilePath(newOutputPath);
      return romWithFiles.withOutputFile(newOutputFile);
    });
  }
}
