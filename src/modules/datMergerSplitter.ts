import ProgressBar, {ProgressBarSymbol} from '../console/progressBar.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import DAT from '../types/dats/dat.js';
import Game from '../types/dats/game.js';
import LogiqxDAT from '../types/dats/logiqx/logiqxDat.js';
import Machine from '../types/dats/mame/machine.js';
import Parent from '../types/dats/parent.js';
import ROM from '../types/dats/rom.js';
import Options, {MergeMode} from '../types/options.js';
import Module from './module.js';
import Header from "../types/dats/logiqx/header.js";

/**
 * TODO(cemmer)
 */
export default class DATMergerSplitter extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, DATMergerSplitter.name);
    this.options = options;
  }

  /**
   * TODO(cemmer)
   */
  async merge(dat: DAT): Promise<DAT> {
    this.progressBar.logInfo(`${dat.getNameShort()}: merging & splitting`);

    // Don't do anything if no type provided
    if (this.options.getMergeRoms() === undefined) {
      this.progressBar.logDebug(`${dat.getNameShort()}: no ROM merge option provided, doing nothing`);
      return dat;
    }

    // Parent/clone information is required to merge & split
    if (!dat.hasParentCloneInfo()) {
      this.progressBar.logDebug(`${dat.getNameShort()}: DAT doesn't have parent/clone info, doing nothing`);
      return dat;
    }

    const gameNamesToGames = dat.getGames().reduce((map, game) => {
      map.set(game.getName(), game);
      return map;
    }, new Map<string, Game>());

    await this.progressBar.setSymbol(ProgressBarSymbol.GENERATING);
    await this.progressBar.reset(dat.getGames().length);

    const newGames = dat.getParents()
      .flatMap((parent) => this.mergeParent(parent, gameNamesToGames));
    const newDat = new LogiqxDAT(new Header({
      ...dat.getHeader(),
      romNamesContainDirectories: this.options.getMergeRoms() === MergeMode.MERGED,
    }), newGames);
    this.progressBar.logDebug(`${newDat.getNameShort()}: merged/split to ${newDat.getGames().length.toLocaleString()} game${newDat.getGames().length !== 1 ? 's' : ''}`);

    this.progressBar.logInfo(`${newDat.getNameShort()}: done merging & splitting`);
    return newDat;
  }

  private mergeParent(parent: Parent, gameNamesToGames: Map<string, Game>): Game[] {
    let games = parent.getGames();

    // 'full' types expect device ROMs to be included
    if (this.options.getMergeRoms() === MergeMode.FULLNONMERGED) {
      games = games.map((game) => {
        if (!(game instanceof Machine)) {
          return game;
        }
        return new Game({
          ...game,
          rom: [
            ...game.getDeviceRefs()
              .map((deviceRef) => gameNamesToGames.get(deviceRef.getName()))
              .filter(ArrayPoly.filterNotNullish)
              .flatMap((deviceGame) => deviceGame.getRoms()),
            ...game.getRoms(),
          ],
        });
      });
    }

    // Non-'full' types expect BIOS files to be in their own set
    if (this.options.getMergeRoms() !== MergeMode.FULLNONMERGED) {
      games = games
        .map((game) => {
          if (game.isBios()) {
            return game;
          }
          return new Game({
            ...game,
            rom: game.getRoms()
              .filter((rom) => !rom.getBios()),
          });
        });
    }

    const parentGame = games.filter((game) => game.isParent())[0];
    let cloneGames = games
      .filter((game) => game.isClone());

    // 'split' and 'merged' types should exclude ROMs found in their parent
    if (this.options.getMergeRoms() === MergeMode.SPLIT
      || this.options.getMergeRoms() === MergeMode.MERGED
    ) {
      cloneGames = cloneGames
        .map((childGame) => new Game({
          ...childGame,
          rom: DATMergerSplitter.diffGameRoms(parentGame, childGame),
        }));
    }

    // For everything other than 'merged' we keep the same number of games
    if (this.options.getMergeRoms() !== MergeMode.MERGED) {
      return [parentGame, ...cloneGames];
    }

    // For 'merged' we reduce to one game
    let cloneRoms = cloneGames
      .flatMap((game) => game.getRoms()
        .map((rom) => new ROM({
          ...rom,
          name: `${game.getName()}\\${rom.getName()}`,
        })));
    // And remove any duplicate ROMs, even if the duplicates exist only in clones and not the parent
    const cloneRomHashCodes = cloneRoms.map((rom) => rom.hashCode());
    cloneRoms = cloneRoms
      .filter((rom, idx) => cloneRomHashCodes.indexOf(rom.hashCode()) === idx);
    return [new Game({
      ...parentGame,
      rom: [...cloneRoms, ...parentGame.getRoms()],
    })];
  }

  private static diffGameRoms(parent: Game, child: Game): ROM[] {
    const parentNames = new Set(parent.getRoms().map((rom) => rom.getName()));
    const childMergeNames = new Set(child.getRoms().map((rom) => rom.getMerge() ?? rom.getName()));
    const diffNames = new Set([...childMergeNames.values()]
      .filter((childHash) => !parentNames.has(childHash)));

    return child.getRoms()
      .filter((rom) => diffNames.has(rom.getName()));
  }
}
