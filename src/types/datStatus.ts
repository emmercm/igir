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

  private readonly foundRomTypesToReleaseCandidates = new Map<ROMType, ReleaseCandidate[]>();

  constructor(dat: DAT, parentsToReleaseCandidates: Map<Parent, ReleaseCandidate[]>) {
    this.dat = dat;

    const gameNamesToReleaseCandidates = [...parentsToReleaseCandidates.values()]
      .flatMap((releaseCandidates) => releaseCandidates)
      .reduce((map, releaseCandidate) => {
        map.set(releaseCandidate.getGame().getName(), releaseCandidate);
        return map;
      }, new Map<string, ReleaseCandidate>());

    dat.getParents().forEach((parent) => {
      parent.getGames().forEach((game) => {
        DATStatus.pushValueIntoMap(this.allRomTypesToGames, game, game);

        const releaseCandidate = gameNamesToReleaseCandidates.get(game.getName());
        if (releaseCandidate || !game.getRoms().length) {
          DATStatus.pushValueIntoMap(this.foundRomTypesToReleaseCandidates, game, releaseCandidate);
        }
      });
    });
  }

  private static pushValueIntoMap<T>(map: Map<ROMType, T[]>, game: Game, value: T): void {
    DATStatus.append(map, ROMType.GAME, value);
    if (game.isBios()) {
      DATStatus.append(map, ROMType.BIOS, value);
    }
    if (game.isRetail()) {
      DATStatus.append(map, ROMType.RETAIL, value);
    }
  }

  private static append<T>(map: Map<ROMType, T[]>, romType: ROMType, val: T): void {
    const arr = (map.has(romType) ? map.get(romType) : []) as T[];
    arr.push(val);
    map.set(romType, arr);
  }

  getDATName(): string {
    return this.dat.getNameShort();
  }

  anyGamesFound(options: Options): boolean {
    return DATStatus.getAllowedTypes(options)
      .reduce((result, romType) => {
        const foundReleaseCandidates = (
          this.foundRomTypesToReleaseCandidates.get(romType) as ReleaseCandidate[] || []).length;
        return result || foundReleaseCandidates > 0;
      }, false);
  }

  toString(options: Options): string {
    return `${DATStatus.getAllowedTypes(options)
      .map((type) => {
        const found = this.foundRomTypesToReleaseCandidates.get(type) || [];
        const all = this.allRomTypesToGames.get(type) || [];
        return `${found.length.toLocaleString()}/${all.length.toLocaleString()} ${type}`;
      })
      .join(', ')} found`;
  }

  async toCSV(options: Options): Promise<string> {
    const found = DATStatus.getValuesForAllowedTypes(
      options,
      this.foundRomTypesToReleaseCandidates,
    );

    // TODO(cemmer): output the location of written ROMs
    const rows = DATStatus.getValuesForAllowedTypes(options, this.allRomTypesToGames)
      .filter((game, idx, games) => games.indexOf(game) === idx)
      .map((game) => {
        const releaseCandidate = found.find((rc) => rc.getGame().equals(game));
        return [
          this.getDATName(),
          game.getName(),
          releaseCandidate || !game.getRoms().length ? 'FOUND' : 'MISSING',
          releaseCandidate
            ? (releaseCandidate as ReleaseCandidate).getRomsWithFiles()
              .map((romWithFiles) => romWithFiles.getOutputFile().getFilePath())
              .filter((filePath, idx, filePaths) => filePaths.indexOf(filePath) === idx)
              .join('|')
            : '',
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
        ];
      });
    return writeToString(rows, {
      headers: [
        'DAT Name',
        'Game Name',
        'Status',
        'Output Files',
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

  private static getValuesForAllowedTypes<T>(
    options: Options,
    romTypesToValues: Map<ROMType, T[]>,
  ): T[] {
    return DATStatus.getAllowedTypes(options)
      .map((type) => romTypesToValues.get(type))
      .flatMap((values) => values)
      .filter((value) => value)
      .filter((value, idx, values) => values.indexOf(value) === idx)
      .sort() as T[];
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
