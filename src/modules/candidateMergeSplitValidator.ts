import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import DAT from '../types/dats/dat.js';
import Game from '../types/dats/game.js';
import Machine from '../types/dats/mame/machine.js';
import Parent from '../types/dats/parent.js';
import Options, { MergeMode } from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import Module from './module.js';

/**
 * Validate un-merged, split, and merged ROM sets for playability after all generation and filtering
 * has happened.
 *
 * This class may be run concurrently with other classes.
 */
export default class CandidateMergeSplitValidator extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, CandidateMergeSplitValidator.name);
    this.options = options;
  }

  /**
   * Validate the {@link ReleaseCandidate}s
   */
  async validate(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<void> {
    this.progressBar.logInfo(`${dat.getNameShort()}: validating merged & split ROM sets`);

    await this.progressBar.setSymbol(ProgressBarSymbol.VALIDATING);
    await this.progressBar.reset(parentsToCandidates.size);

    const datGamesIndexed = dat.getGames().reduce((map, game) => {
      map.set(game.getName(), game);
      return map;
    }, new Map<string, Game>());

    const releaseCandidatesIndexed = [...parentsToCandidates.values()]
      .flatMap((releaseCandidates) => releaseCandidates)
      .filter((releaseCandidate) => releaseCandidate.getRomsWithFiles().length)
      .reduce((map, releaseCandidate) => {
        map.set(releaseCandidate.getGame().getName(), releaseCandidate);
        return map;
      }, new Map<string, ReleaseCandidate>());

    // For every Game that has ReleaseCandidate(s) with files
    [...parentsToCandidates.values()]
      .flatMap((releaseCandidates) => releaseCandidates)
      .filter((releaseCandidate) => releaseCandidate.getRomsWithFiles().length)
      .map((releaseCandidate) => releaseCandidate.getGame())
      .reduce(ArrayPoly.reduceUnique(), [])
      .forEach((game) => {
        let missingDependencies: string[] = [];

        // Validate dependent parent was found
        if (this.options.getMergeRoms() === MergeMode.SPLIT
          && game.isClone()
          && !releaseCandidatesIndexed.has(game.getParent())
        ) {
          missingDependencies = [game.getParent(), ...missingDependencies];
        }

        // Validate dependent devices were found
        if (this.options.getMergeRoms() !== MergeMode.FULLNONMERGED
            && game instanceof Machine
        ) {
          const missingDeviceGames = game.getDeviceRefs()
            .map((deviceRef) => datGamesIndexed.get(deviceRef.getName()))
            .filter(ArrayPoly.filterNotNullish)
            // Dependent device has ROM files
            .filter((deviceGame) => deviceGame.getRoms().length)
            .map((deviceGame) => {
              const deviceReleaseCandidate = releaseCandidatesIndexed.get(deviceGame.getName());
              if (deviceReleaseCandidate) {
                // The device game has candidates, validation passed
                return undefined;
              }
              return deviceGame.getName();
            })
            .filter(ArrayPoly.filterNotNullish)
            .sort();
          missingDependencies = [...missingDependencies, ...missingDeviceGames];
        }

        if (missingDependencies.length) {
          this.progressBar.logWarn(`${game.getName()}: missing dependent ROM set${missingDependencies.length !== 1 ? 's' : ''}: ${missingDependencies.join(', ')}`);
        }
      });

    this.progressBar.logInfo(`${dat.getNameShort()}: done validating merged & split ROM sets`);
  }
}
