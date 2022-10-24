import { writeToString } from '@fast-csv/format';
import chalk from 'chalk';

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

  toConsole(options: Options): string {
    return `${DATStatus.getAllowedTypes(options)
      .filter((type) => this.allRomTypesToGames.get(type)?.length)
      .map((type) => {
        const found = this.foundRomTypesToReleaseCandidates.get(type) || [];
        const all = this.allRomTypesToGames.get(type) || [];

        const percentage = (found.length / all.length) * 100;
        let color = chalk.reset;
        if (percentage >= 100) {
          color = chalk.green;
        } else if (percentage >= 80) {
          color = chalk.rgb(255, 255, 0);
        } else if (percentage >= 60) {
          color = chalk.rgb(255, 209, 0);
        } else if (percentage >= 40) {
          color = chalk.rgb(255, 159, 0);
        } else if (percentage >= 20) {
          color = chalk.rgb(255, 103, 0);
        } else {
          color = color.red;
        }

        return `${color(found.length.toLocaleString())}/${chalk.white(all.length.toLocaleString())} ${type}`;
      })
      .join(', ')} found`;
  }

  async toCSV(options: Options): Promise<string> {
    const found = DATStatus.getValuesForAllowedTypes(
      options,
      this.foundRomTypesToReleaseCandidates,
    );

    const rows = DATStatus.getValuesForAllowedTypes(options, this.allRomTypesToGames)
      .filter((game, idx, games) => games.indexOf(game) === idx)
      .sort((a, b) => a.getName().localeCompare(b.getName()))
      .map((game) => {
        const releaseCandidate = found.find((rc) => rc.getGame().equals(game));
        return [
          this.getDATName(),
          game.getName(),
          releaseCandidate || !game.getRoms().length ? 'FOUND' : 'MISSING',
          releaseCandidate
            ? (releaseCandidate as ReleaseCandidate).getRomsWithFiles()
              .map((romWithFiles) => (options.shouldWrite()
                ? romWithFiles.getOutputFile()
                : romWithFiles.getInputFile()))
              .map((file) => file.getFilePath())
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
        'ROM Files',
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
