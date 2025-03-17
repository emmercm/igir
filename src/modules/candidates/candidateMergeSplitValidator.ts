import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import ArrayPoly from '../../polyfill/arrayPoly.js';
import DAT from '../../types/dats/dat.js';
import Game from '../../types/dats/game.js';
import Machine from '../../types/dats/mame/machine.js';
import Parent from '../../types/dats/parent.js';
import Options, { MergeMode } from '../../types/options.js';
import ReleaseCandidate from '../../types/releaseCandidate.js';
import Module from '../module.js';

/**
 * Validate un-merged, split, and merged ROM sets for playability after all generation and filtering
 * has happened.
 */
export default class CandidateMergeSplitValidator extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, CandidateMergeSplitValidator.name);
    this.options = options;
  }

  /**
   * Validate the {@link ReleaseCandidate}s.
   */
  validate(dat: DAT, parentsToCandidates: Map<Parent, ReleaseCandidate[]>): string[] {
    if (parentsToCandidates.size === 0) {
      this.progressBar.logTrace(
        `${dat.getName()}: no parents to validate merged & split ROM sets for`,
      );
      return [];
    }

    this.progressBar.logTrace(`${dat.getName()}: validating merged & split ROM sets`);
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_VALIDATING);
    this.progressBar.reset(parentsToCandidates.size);

    const datGamesIndexed = dat.getGames().reduce((map, game) => {
      map.set(game.getName(), game);
      return map;
    }, new Map<string, Game>());

    const releaseCandidatesIndexed = [...parentsToCandidates.values()]
      .flat()
      .filter((releaseCandidate) => releaseCandidate.getRomsWithFiles().length > 0)
      .reduce((map, releaseCandidate) => {
        map.set(releaseCandidate.getGame().getName(), releaseCandidate);
        return map;
      }, new Map<string, ReleaseCandidate>());

    // For every Game that has ReleaseCandidate(s) with files
    const missingGames = [...parentsToCandidates.values()]
      .flat()
      .filter((releaseCandidate) => releaseCandidate.getRomsWithFiles().length > 0)
      .map((releaseCandidate) => releaseCandidate.getGame())
      .reduce(ArrayPoly.reduceUnique(), [])
      .flatMap((game) => {
        let missingDependencies: string[] = [];

        // Validate dependent parent was found
        const cloneOf = game.getCloneOf();
        if (
          this.options.getMergeRoms() === MergeMode.SPLIT &&
          cloneOf !== undefined &&
          !releaseCandidatesIndexed.has(cloneOf)
        ) {
          missingDependencies = [cloneOf, ...missingDependencies];
        }

        // Validate dependent devices were found
        if (this.options.getMergeRoms() !== MergeMode.FULLNONMERGED && game instanceof Machine) {
          const missingDeviceGames = game
            .getDeviceRefs()
            .map((deviceRef) => datGamesIndexed.get(deviceRef.getName()))
            .filter(
              (deviceGame): deviceGame is Game =>
                deviceGame !== undefined &&
                // Dependent device has ROM files
                deviceGame.getRoms().length > 0,
            )
            .map((deviceGame) => {
              const deviceReleaseCandidate = releaseCandidatesIndexed.get(deviceGame.getName());
              if (deviceReleaseCandidate) {
                // The device game has candidates, validation passed
                return undefined;
              }
              return deviceGame.getName();
            })
            .filter((deviceGameName) => deviceGameName !== undefined)
            .sort();
          missingDependencies = [...missingDependencies, ...missingDeviceGames];
        }

        if (missingDependencies.length > 0) {
          this.progressBar.logWarn(
            `${dat.getName()}: ${game.getName()}: missing dependent ROM set${missingDependencies.length !== 1 ? 's' : ''}: ${missingDependencies.join(', ')}`,
          );
        }
        return missingDependencies;
      });

    this.progressBar.logTrace(`${dat.getName()}: done validating merged & split ROM sets`);
    return missingGames;
  }
}
