import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import DAT from '../../types/dats/dat.js';
import Game from '../../types/dats/game.js';
import LogiqxDAT from '../../types/dats/logiqx/logiqxDat.js';
import Options from '../../types/options.js';
import Module from '../module.js';

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
      this.progressBar.logTrace(`${dat.getName()}: not merging discs`);
      return dat;
    }

    if (dat.getGames().length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no games to merge`);
      return dat;
    }

    this.progressBar.logTrace(
      `${dat.getName()}: merging ${dat.getGames().length.toLocaleString()} game${dat.getGames().length !== 1 ? 's' : ''}`,
    );
    this.progressBar.setSymbol(ProgressBarSymbol.DAT_MERGE_SPLIT);
    this.progressBar.reset(dat.getGames().length);

    const groupedGames = this.groupGames(dat.getGames());
    const newDat = new LogiqxDAT(dat.getHeader(), groupedGames);
    this.progressBar.logTrace(
      `${newDat.getName()}: merged to ${newDat.getGames().length.toLocaleString()} game${newDat.getGames().length !== 1 ? 's' : ''}`,
    );

    this.progressBar.logTrace(`${newDat.getName()}: done merging`);
    return newDat;
  }

  private groupGames(games: Game[]): Game[] {
    const gameNamesToGames = games.reduce((map, game) => {
      let gameNameStripped = game
        .getName()
        // Redump
        .replace(/ ?\(Disc [0-9]+\)/i, '')
        // TOSEC
        .replace(/ ?\(Disc [0-9]+ of [0-9]+\)/i, '');

      if (gameNameStripped !== game.getName()) {
        // The game is a multi-disc game, strip some additional patterns
        gameNameStripped = gameNameStripped
          // TOSEC
          .replace(/\[[0-9]+S\]/, '') // Dreamcast ring code
          .trim();
      }

      if (!map.has(gameNameStripped)) {
        map.set(gameNameStripped, [game]);
      } else {
        map.get(gameNameStripped)?.push(game);
      }

      return map;
    }, new Map<string, Game[]>());

    return [...gameNamesToGames.entries()].flatMap(([gameName, games]) => {
      if (games.length === 1) {
        return games[0];
      }

      const roms = games.flatMap((game) => game.getRoms());

      const romNamesToCount = roms.reduce((map, rom) => {
        map.set(rom.getName(), (map.get(rom.getName()) ?? 0) + 1);
        return map;
      }, new Map<string, number>());
      const duplicateRomNames = [...romNamesToCount.entries()]
        .filter(([, count]) => count > 1)
        .map(([romName]) => romName)
        .sort();
      if (duplicateRomNames.length > 1) {
        this.progressBar.logError(
          `${gameName}: can't group discs, games have duplicate ROM filenames:\n${duplicateRomNames.map((name) => `  ${name}`).join('\n')}`,
        );
        return games;
      }

      return new Game({
        name: gameName,
        rom: roms,
      });
    });
  }
}
