import { writeToString } from '@fast-csv/format';

import DAT from './logiqx/dat.js';
import Game from './logiqx/game.js';
import Parent from './logiqx/parent.js';
import Options from './options.js';
import ReleaseCandidate from './releaseCandidate.js';

enum ROMType {
  GAME = 'games',
  BIOS = 'bioses',
  RETAIL = 'retail releases',
}

export default class DATStatus {
  private readonly dat: DAT;

  private readonly allRomTypesToGames = new Map<ROMType, Game[]>();

  private readonly missingRomTypesToGames = new Map<ROMType, Game[]>();

  constructor(dat: DAT, parentsToReleaseCandidates: Map<Parent, ReleaseCandidate[]>) {
    this.dat = dat;

    const gameNamesToReleaseCandidates = [...parentsToReleaseCandidates.values()]
      .flatMap((releaseCandidates) => releaseCandidates)
      .reduce((map, releaseCandidate) => {
        map.set(releaseCandidate.getName(), releaseCandidate);
        return map;
      }, new Map<string, ReleaseCandidate>());

    dat.getParents().forEach((parent) => {
      parent.getGames().forEach((game) => {
        DATStatus.pushGameIntoMap(this.allRomTypesToGames, game);

        const releaseCandidate = gameNamesToReleaseCandidates.get(game.getName());
        if (!releaseCandidate && game.getRoms().length > 0) {
          DATStatus.pushGameIntoMap(this.missingRomTypesToGames, game);
        }
      });
    });
  }

  private static pushGameIntoMap(map: Map<ROMType, Game[]>, game: Game): void {
    DATStatus.append(map, ROMType.GAME, game);
    if (game.isBios()) {
      DATStatus.append(map, ROMType.BIOS, game);
    }
    if (game.isRetail()) {
      DATStatus.append(map, ROMType.RETAIL, game);
    }
  }

  private static append(map: Map<ROMType, Game[]>, romType: ROMType, val: Game): void {
    const arr = (map.has(romType) ? map.get(romType) : []) as Game[];
    arr.push(val);
    map.set(romType, arr);
  }

  getDATName(): string {
    return this.dat.getNameShort();
  }

  anyGamesFound(options: Options): boolean {
    return DATStatus.getAllowedTypes(options)
      .reduce((result, romType) => {
        const allGames = (this.allRomTypesToGames.get(romType) as Game[] || []).length;
        const missingGames = (this.missingRomTypesToGames.get(romType) as Game[] || []).length;
        return result || (allGames - missingGames > 0);
      }, false);
  }

  toString(options: Options): string {
    return `${DATStatus.getAllowedTypes(options)
      .map((type) => {
        const missing = this.missingRomTypesToGames.get(type) || [];
        const all = this.allRomTypesToGames.get(type) || [];
        return `${(all.length - missing.length).toLocaleString()}/${all.length.toLocaleString()} ${type}`;
      })
      .join(', ')} found`;
  }

  async toCSV(options: Options): Promise<string> {
    const missing = DATStatus.getGamesForAllowedTypes(options, this.missingRomTypesToGames);

    // TODO(cemmer): output the location of written ROMs
    const rows = DATStatus.getGamesForAllowedTypes(options, this.allRomTypesToGames)
      .filter((game, idx, games) => games.indexOf(game) === idx)
      .map((game) => ([
        this.getDATName(),
        game.getName(),
        missing.indexOf(game) !== -1 ? 'MISSING' : 'FOUND',
        game.isBios(),
        game.isRetail(),
        game.isUnlicensed(),
        game.isDemo(),
        game.isBeta(),
        game.isSample(),
        game.isPrototype(),
        game.isTest(),
        game.isAftermarket(),
        game.isHomebrew(),
        game.isBad(),
      ]));
    return writeToString(rows, {
      headers: [
        'DAT Name',
        'Game Name',
        'Status',
        'BIOS',
        'Retail Release',
        'Unlicensed',
        'Demo',
        'Beta',
        'Sample',
        'Prototype',
        'Test',
        'Aftermarket',
        'Homebrew',
        'Bad',
      ],
    });
  }

  private static getGamesForAllowedTypes(
    options: Options,
    romTypesToGames: Map<ROMType, Game[]>,
  ): Game[] {
    return DATStatus.getAllowedTypes(options)
      .map((type) => romTypesToGames.get(type))
      .flatMap((games) => games)
      .filter((game) => game)
      .filter((game, idx, games) => games.indexOf(game) === idx)
      .sort() as Game[];
  }

  private static getAllowedTypes(options: Options): ROMType[] {
    return [
      !options.getSingle() && !options.getOnlyBios() && !options.getOnlyRetail()
        ? ROMType.GAME : undefined,
      options.getOnlyBios() || !options.getNoBios() ? ROMType.BIOS : undefined,
      options.getOnlyRetail() || !options.getOnlyBios() ? ROMType.RETAIL : undefined,
    ].filter((romType) => romType) as ROMType[];
  }
}
