import path from 'node:path';

import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import type DAT from '../../models/dats/dat.js';
import type Game from '../../models/dats/game.js';
import MergedDiscGame from '../../models/dats/mergedDiscGame.js';
import type Options from '../../models/options.js';
import IntlUtil from '../../utils/intlUtil.js';
import Module from '../module.js';
import GameGrouper from './utils/gameGrouper.js';

/**
 * Merge multi-disc {@link Game}s in a {@link DAT} into one game.
 */
export default class DATDiscMerger extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, DATDiscMerger.name);
    this.options = options;
  }

  /**
   * Merge {@link Game}s.
   */
  merge(dat: DAT): DAT {
    if (!this.options.getMergeDiscs()) {
      this.prefixedLogger.trace(`${dat.getName()}: not merging discs`);
      return dat;
    }

    if (dat.getGames().length === 0) {
      this.prefixedLogger.trace(`${dat.getName()}: no games to merge`);
      return dat;
    }

    this.prefixedLogger.trace(
      `${dat.getName()}: merging ${IntlUtil.toLocaleString(dat.getGames().length)} game${dat.getGames().length === 1 ? '' : 's'}`,
    );
    this.progressBar.setSymbol(ProgressBarSymbol.DAT_MERGE_SPLIT);
    this.progressBar.resetProgress(dat.getGames().length);

    const groupedGames = this.groupGames(dat.getGames());
    const newDat = dat.withGames(groupedGames);
    this.prefixedLogger.trace(
      `${newDat.getName()}: merged to ${IntlUtil.toLocaleString(newDat.getGames().length)} game${newDat.getGames().length === 1 ? '' : 's'}`,
    );

    this.prefixedLogger.trace(`${newDat.getName()}: done merging`);
    return newDat;
  }

  private groupGames(games: Game[]): Game[] {
    const gameNamesToGames = GameGrouper.groupMultiDiscGames(games, (game) => game.getName());

    return [...gameNamesToGames.entries()].flatMap(([gameName, games]) => {
      if (games.length === 1) {
        return games[0];
      }

      const roms = games.flatMap((game) => game.getRoms());

      // Detect conflicting ROM names
      const romNamesToCount = roms.reduce((map, rom) => {
        map.set(rom.getName(), (map.get(rom.getName()) ?? 0) + 1);
        return map;
      }, new Map<string, number>());
      const duplicateRomNames = [...romNamesToCount.entries()]
        .filter(([, count]) => count > 1)
        .map(([romName]) => romName)
        .toSorted();

      const subGames =
        duplicateRomNames.length > 1
          ? // De-conflict the filenames by adding a subfolder of the original game's name
            games.map((game) =>
              game.withProps({
                roms: game
                  .getRoms()
                  .map((rom) => rom.withName(path.join(game.getName(), rom.getName()))),
              }),
            )
          : games;

      return new MergedDiscGame({
        name: gameName,
        subGames,
      });
    });
  }
}
