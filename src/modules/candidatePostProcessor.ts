import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
import Options from '../types/options.js';
import OutputFactory from '../types/outputFactory.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMWithFiles from '../types/romWithFiles.js';
import Module from './module.js';

/**
 * Perform any {@link Parent} and {@link ReleaseCandidate} manipulations needed after candidates
 * have had patches attached and have been filtered.
 *
 * This class may be run concurrently with other classes.
 */
export default class CandidatePostProcessor extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, CandidatePostProcessor.name);
    this.options = options;
  }

  async process(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    this.progressBar.logInfo(`${dat.getNameShort()}: processing candidates`);

    if (!parentsToCandidates.size) {
      this.progressBar.logDebug(`${dat.getNameShort()}: no parents, so no candidates to process`);
      return parentsToCandidates;
    }

    await this.progressBar.setSymbol(ProgressBarSymbol.GENERATING);
    await this.progressBar.reset(parentsToCandidates.size);

    const outputFileBasenames = [...parentsToCandidates.values()]
      .flatMap((releaseCandidates) => releaseCandidates)
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles()
        .map((romWithFiles) => {
          const outputPathParsed = OutputFactory.getPath(
            this.options,
            dat,
            releaseCandidate.getGame(),
            releaseCandidate.getRelease(),
            romWithFiles.getRom(),
            romWithFiles.getInputFile(),
          );
          return outputPathParsed.name + outputPathParsed.ext;
        }));

    const processedCandidates = new Map(await Promise.all(
      [...parentsToCandidates.entries()]
        .map(async ([parent, releaseCandidates]): Promise<[Parent, ReleaseCandidate[]]> => {
          const newReleaseCandidates = await Promise.all(
            releaseCandidates.map(async (releaseCandidate) => this.mapReleaseCandidate(
              dat,
              releaseCandidate,
              outputFileBasenames,
            )),
          );
          return [parent, newReleaseCandidates];
        }),
    ));

    this.progressBar.logInfo(`${dat.getNameShort()}: done processing candidates`);
    return processedCandidates;
  }

  private async mapReleaseCandidate(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
    outputFileBasenames: string[],
  ): Promise<ReleaseCandidate> {
    const newRomsWithFiles = await this.mapRomsWithFiles(
      dat,
      releaseCandidate,
      releaseCandidate.getRomsWithFiles(),
      outputFileBasenames,
    );

    return new ReleaseCandidate(
      releaseCandidate.getGame(),
      releaseCandidate.getRelease(),
      newRomsWithFiles,
    );
  }

  private async mapRomsWithFiles(
    dat: DAT,
    releaseCandidate: ReleaseCandidate,
    romsWithFiles: ROMWithFiles[],
    outputFileBasenames: string[],
  ): Promise<ROMWithFiles[]> {
    return Promise.all(
      romsWithFiles.map(async (romWithFiles) => {
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

        const newOutputFile = await romWithFiles.getOutputFile()
          .withFilePath(newOutputPath);
        return new ROMWithFiles(
          romWithFiles.getRom(),
          romWithFiles.getInputFile(),
          newOutputFile,
        );
      }),
    );
  }
}
