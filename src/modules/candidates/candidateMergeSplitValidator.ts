import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import ArrayPoly from '../../polyfill/arrayPoly.js';
import type DAT from '../../types/dats/dat.js';
import type Game from '../../types/dats/game.js';
import type Options from '../../types/options.js';
import { MergeMode } from '../../types/options.js';
import type WriteCandidate from '../../types/writeCandidate.js';
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
   * Validate the {@link WriteCandidate}s.
   */
  validate(dat: DAT, candidates: WriteCandidate[]): string[] {
    if (candidates.length === 0) {
      this.progressBar.logTrace(
        `${dat.getName()}: no candidates to validate merged & split ROM sets for`,
      );
      return [];
    }

    this.progressBar.logTrace(`${dat.getName()}: validating merged & split ROM sets`);
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_VALIDATING);
    this.progressBar.resetProgress(candidates.length);

    const datGamesIndexed = dat.getGames().reduce((map, game) => {
      map.set(game.getName(), game);
      return map;
    }, new Map<string, Game>());

    const candidatesIndexed = candidates
      .filter((candidate) => candidate.getRomsWithFiles().length > 0)
      .reduce((map, candidate) => {
        map.set(candidate.getGame().getName(), candidate);
        return map;
      }, new Map<string, WriteCandidate>());

    /**
     * For every {@link Game} that has {@link WriteCandidate}s with files
     */
    const missingGames = candidates
      .filter((candidate) => candidate.getRomsWithFiles().length > 0)
      .map((candidate) => candidate.getGame())
      .reduce(ArrayPoly.reduceUnique(), [])
      .flatMap((game) => {
        let missingDependencies: string[] = [];

        // Validate dependent parent was found
        const cloneOf = game.getCloneOf();
        if (
          this.options.getMergeRoms() === MergeMode.SPLIT &&
          cloneOf !== undefined &&
          !candidatesIndexed.has(cloneOf)
        ) {
          missingDependencies = [cloneOf, ...missingDependencies];
        }

        // Validate dependent devices were found
        if (this.options.getMergeRoms() !== MergeMode.FULLNONMERGED) {
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
              const deviceCandidate = candidatesIndexed.get(deviceGame.getName());
              if (deviceCandidate) {
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
            `${dat.getName()}: ${game.getName()}: missing dependent ROM set${missingDependencies.length === 1 ? '' : 's'}: ${missingDependencies.join(', ')}`,
          );
        }
        return missingDependencies;
      });

    this.progressBar.logTrace(`${dat.getName()}: done validating merged & split ROM sets`);
    return missingGames;
  }
}
