import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import type DAT from '../../types/dats/dat.js';
import type Options from '../../types/options.js';
import OutputFactory from '../../types/outputFactory.js';
import type ROMWithFiles from '../../types/romWithFiles.js';
import type WriteCandidate from '../../types/writeCandidate.js';
import Module from '../module.js';

/**
 * Perform any {@link WriteCandidate} manipulations needed after candidates have had patches
 * attached.
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
  process(dat: DAT, candidates: WriteCandidate[]): WriteCandidate[] {
    if (candidates.length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no candidates to post-process`);
      return candidates;
    }

    this.progressBar.logTrace(`${dat.getName()}: processing candidates`);
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_GENERATING);
    this.progressBar.resetProgress(candidates.length);

    // Get the output basename of every ROM
    const outputFileBasenames = candidates.flatMap((candidate) =>
      candidate.getRomsWithFiles().map((romWithFiles) => {
        const outputPathParsed = OutputFactory.getPath(
          this.options,
          dat,
          candidate.getGame(),
          romWithFiles.getRom(),
          romWithFiles.getInputFile(),
        );
        return outputPathParsed.name + outputPathParsed.ext;
      }),
    );

    const processedCandidates = candidates.map((candidate) =>
      this.postProcessCandidate(dat, candidate, outputFileBasenames),
    );

    this.progressBar.logTrace(`${dat.getName()}: done processing candidates`);
    return processedCandidates;
  }

  private postProcessCandidate(
    dat: DAT,
    candidate: WriteCandidate,
    outputFileBasenames: string[],
  ): WriteCandidate {
    const newRomsWithFiles = this.mapRomsWithFiles(
      dat,
      candidate,
      candidate.getRomsWithFiles(),
      outputFileBasenames,
    );

    return candidate.withRomsWithFiles(newRomsWithFiles);
  }

  private mapRomsWithFiles(
    dat: DAT,
    candidate: WriteCandidate,
    romsWithFiles: ROMWithFiles[],
    outputFileBasenames: string[],
  ): ROMWithFiles[] {
    return romsWithFiles.map((romWithFiles) => {
      const newOutputPath = OutputFactory.getPath(
        this.options,
        dat,
        candidate.getGame(),
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
