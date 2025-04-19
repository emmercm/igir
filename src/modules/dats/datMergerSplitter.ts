import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import ArrayPoly from '../../polyfill/arrayPoly.js';
import DAT from '../../types/dats/dat.js';
import Game from '../../types/dats/game.js';
import LogiqxDAT from '../../types/dats/logiqx/logiqxDat.js';
import Parent from '../../types/dats/parent.js';
import ROM from '../../types/dats/rom.js';
import Options, { MergeMode } from '../../types/options.js';
import Module from '../module.js';

/**
 * Process a {@link DAT} with the ROM merge mode specified.
 */
export default class DATMergerSplitter extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, DATMergerSplitter.name);
    this.options = options;
  }

  /**
   * Un-merge, split, or merge the {@link Game}s within a {@link DAT}.
   */
  merge(dat: DAT): DAT {
    // Don't do anything if no type provided
    if (this.options.getMergeRoms() === undefined) {
      this.progressBar.logTrace(`${dat.getName()}: no ROM merge option provided, doing nothing`);
      return dat;
    }

    // Parent/clone information is required to merge & split
    if (!dat.hasParentCloneInfo()) {
      this.progressBar.logTrace(
        `${dat.getName()}: DAT doesn't have parent/clone info, doing nothing`,
      );
      return dat;
    }

    const gameNamesToGames = dat.getGames().reduce((map, game) => {
      map.set(game.getName(), game);
      return map;
    }, new Map<string, Game>());

    this.progressBar.logTrace(
      `${dat.getName()}: merging & splitting ${dat.getGames().length.toLocaleString()} game${dat.getGames().length === 1 ? '' : 's'}`,
    );
    this.progressBar.setSymbol(ProgressBarSymbol.DAT_MERGE_SPLIT);
    this.progressBar.reset(dat.getGames().length);

    const newGames = dat
      .getParents()
      .flatMap((parent) => this.mergeParent(dat, parent, gameNamesToGames));
    const newDat = new LogiqxDAT(dat.getHeader(), newGames);
    this.progressBar.logTrace(
      `${newDat.getName()}: merged/split to ${newDat.getGames().length.toLocaleString()} game${newDat.getGames().length === 1 ? '' : 's'}`,
    );

    this.progressBar.logTrace(`${newDat.getName()}: done merging & splitting`);
    return newDat;
  }

  private mergeParent(dat: DAT, parent: Parent, gameNamesToGames: Map<string, Game>): Game[] {
    let games = parent.getGames();

    // Sanitization
    games = games.map((game) =>
      game.withProps({
        roms: game
          .getRoms()
          // Get rid of ROMs that haven't been dumped yet
          .filter((rom) => rom.getStatus() !== 'nodump')
          // Get rid of duplicate ROMs. MAME will sometimes duplicate a file with the exact same
          // name, size, and checksum but with a different "region" (e.g. neogeo).
          .filter(ArrayPoly.filterUniqueMapped((rom) => rom.getName())),
        disks: game
          .getDisks()
          // Get rid of ROMs that haven't been dumped yet
          .filter((disk) => disk.getStatus() !== 'nodump'),
      }),
    );

    // 'full' types expect device ROMs to be included
    if (this.options.getMergeRoms() === MergeMode.FULLNONMERGED) {
      games = games.map((game) =>
        game.withProps({
          roms: [
            ...game
              .getDeviceRefs()
              // De-duplicate DeviceRef names
              .map((deviceRef) => deviceRef.getName())
              .reduce(ArrayPoly.reduceUnique(), [])
              // Get ROMs from the DeviceRef
              .map((deviceRefName) => gameNamesToGames.get(deviceRefName))
              .filter((deviceGame) => deviceGame !== undefined)
              .flatMap((deviceGame) =>
                deviceGame.getRoms().filter((rom) => rom.getStatus() !== 'nodump'),
              ),
            ...game.getRoms(),
          ],
        }),
      );
    }

    // Non-'full' types expect BIOS files to be in their own set
    if (this.options.getMergeRoms() !== MergeMode.FULLNONMERGED) {
      games = games.map((game) => {
        const romOf = game.getRomOf();
        if (!romOf) {
          // This game doesn't use an external BIOS
          return game;
        }

        let biosGame = gameNamesToGames.get(romOf);
        if (!biosGame) {
          // Invalid romOf attribute, external BIOS not found
          this.progressBar.logTrace(
            `${dat.getName()}: ${game.getName()} references an invalid BIOS: ${romOf}`,
          );
          return game;
        }
        // If the referenced `romOf` game is not a BIOS, then it must be a parent game.
        // Reduce the non-BIOS parent to only its BIOS ROMs, so that they can be excluded from
        // the child.
        if (!biosGame.getIsBios()) {
          biosGame = biosGame.withProps({
            roms: biosGame.getRoms().filter((rom) => rom.getBios() !== undefined),
          });
        }

        return game.withProps({
          roms: DATMergerSplitter.diffGameRoms(biosGame.getRoms(), game.getRoms()),
        });
      });
    }

    // 'split' and 'merged' types should exclude ROMs & disks found in their parent
    if (
      this.options.getMergeRoms() === MergeMode.SPLIT ||
      this.options.getMergeRoms() === MergeMode.MERGED
    ) {
      games = games.map((game) => {
        const cloneOf = game.getCloneOf();
        if (!cloneOf) {
          // This game doesn't have a parent
          return game;
        }

        const parentGame = gameNamesToGames.get(cloneOf);
        if (!parentGame) {
          // Invalid cloneOf attribute, parent not found
          this.progressBar.logTrace(
            `${dat.getName()}: ${game.getName()} references an invalid parent: ${cloneOf}`,
          );
          return game;
        }

        return game.withProps({
          roms: DATMergerSplitter.diffGameRoms(parentGame.getRoms(), game.getRoms()),
          disks: DATMergerSplitter.diffGameRoms(parentGame.getDisks(), game.getDisks()),
        });
      });
    }

    const parentGame = games.find((game) => game.isParent());
    const cloneGames = games.filter((game) => game.isClone());

    // For everything other than 'merged' we keep the same number of games
    if (this.options.getMergeRoms() !== MergeMode.MERGED) {
      if (parentGame) {
        return [parentGame, ...cloneGames];
      }
      return cloneGames;
    }

    // For 'merged' we reduce to one game
    const cloneRoms = cloneGames.flatMap((game) =>
      game.getRoms().map(
        (rom) =>
          new ROM({
            ...rom,
            name: `${game.getName()}\\${rom.getName()}`,
          }),
      ),
    );
    const allRoms = [...cloneRoms, ...(parentGame ? parentGame.getRoms() : [])];
    // And remove any duplicate ROMs, even if the duplicates exist only in clones and not the parent
    const allRomsDeduplicated = allRoms.filter(
      ArrayPoly.filterUniqueMapped((rom) => rom.hashCode()),
    );
    return [
      new Game({
        ...parentGame,
        roms: allRomsDeduplicated,
      }),
    ];
  }

  private static diffGameRoms(parentRoms: ROM[], childRoms: ROM[]): ROM[] {
    const parentRomNamesToHashCodes = parentRoms.reduce((map, rom) => {
      map.set(rom.getName(), rom.hashCode());
      return map;
    }, new Map<string, string>());

    return childRoms.filter((rom) => {
      const parentName = rom.getMerge() ?? rom.getName();
      const parentHashCode = parentRomNamesToHashCodes.get(parentName);
      if (!parentHashCode) {
        // Parent doesn't have a ROM of the same name -> keep it
        return true;
      }
      if (parentHashCode !== rom.hashCode()) {
        // Parent has a ROM of the same name, but a different checksum -> keep it
        return true;
      }
      return false;
    });
  }
}
