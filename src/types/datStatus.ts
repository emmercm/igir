import { writeToString } from '@fast-csv/format';
import chalk, { ChalkInstance } from 'chalk';

import ArrayPoly from '../polyfill/arrayPoly.js';
import DAT from './logiqx/dat.js';
import Game from './logiqx/game.js';
import Parent from './logiqx/parent.js';
import Options from './options.js';
import ReleaseCandidate from './releaseCandidate.js';

enum ROMType {
  GAME = 'games',
  BIOS = 'BIOSes',
  DEVICE = 'devices',
  RETAIL = 'retail releases',
  PATCHED = 'patched games',
}

export enum Status {
  MISSING,
  FOUND,
  UNMATCHED,
  DELETED,
}

export default class DATStatus {
  private readonly dat: DAT;

  private readonly allRomTypesToGames = new Map<ROMType, Game[]>();

  // eslint-disable-next-line no-spaced-func
  private readonly foundRomTypesToReleaseCandidates = new Map<
  ROMType,
  (ReleaseCandidate | undefined)[]
  >();

  constructor(dat: DAT, parentsToReleaseCandidates: Map<Parent, ReleaseCandidate[]>) {
    this.dat = dat;

    // Un-patched ROMs
    [...parentsToReleaseCandidates.entries()]
      .filter(([, releaseCandidates]) => releaseCandidates.every((rc) => !rc.isPatched()))
      .forEach(([parent, releaseCandidates]) => {
        parent.getGames().forEach((game) => {
          DATStatus.pushValueIntoMap(this.allRomTypesToGames, game, game);

          const gameReleaseCandidates = releaseCandidates
            .filter((rc) => !rc.isPatched())
            .filter((rc) => rc.getGame().hashCode() === game.hashCode());
          if (gameReleaseCandidates.length || game.getRoms().length === 0) {
            DATStatus.pushValueIntoMap(
              this.foundRomTypesToReleaseCandidates,
              game,
              // The only reason there may be multiple ReleaseCandidates is for multiple regions,
              //  but DATStatus doesn't care about regions.
              gameReleaseCandidates[0],
            );
          }
        });
      });

    // Patched ROMs
    [...parentsToReleaseCandidates.entries()]
      .filter(([, releaseCandidates]) => releaseCandidates.some((rc) => rc.isPatched()))
      .forEach(([, releaseCandidates]) => {
        // Patched ROMs
        releaseCandidates
          .filter((rc) => rc.isPatched())
          .forEach((releaseCandidate) => {
            const game = releaseCandidate.getGame();
            DATStatus.append(this.allRomTypesToGames, ROMType.PATCHED, game);
            DATStatus.append(
              this.foundRomTypesToReleaseCandidates,
              ROMType.PATCHED,
              releaseCandidate,
            );
          });
      });
  }

  private static pushValueIntoMap<T>(map: Map<ROMType, T[]>, game: Game, value: T): void {
    DATStatus.append(map, ROMType.GAME, value);
    if (game.isBios()) {
      DATStatus.append(map, ROMType.BIOS, value);
    }
    if (game.isDevice()) {
      DATStatus.append(map, ROMType.DEVICE, value);
    }
    if (game.isRetail()) {
      DATStatus.append(map, ROMType.RETAIL, value);
    }
  }

  private static append<T>(map: Map<ROMType, T[]>, romType: ROMType, val: T): void {
    const arr = map.get(romType) ?? [];
    arr.push(val);
    map.set(romType, arr);
  }

  getDATName(): string {
    return this.dat.getNameShort();
  }

  getReleaseCandidates(): (ReleaseCandidate | undefined)[] {
    return [...this.foundRomTypesToReleaseCandidates.values()]
      .flatMap((releaseCandidates) => releaseCandidates);
  }

  anyGamesFound(options: Options): boolean {
    return DATStatus.getAllowedTypes(options)
      .reduce((result, romType) => {
        const foundReleaseCandidates = (
          this.foundRomTypesToReleaseCandidates.get(romType) ?? []).length;
        return result || foundReleaseCandidates > 0;
      }, false);
  }

  toConsole(options: Options): string {
    return `${DATStatus.getAllowedTypes(options)
      .filter((type) => this.allRomTypesToGames.get(type)?.length)
      .map((type) => {
        const found = this.foundRomTypesToReleaseCandidates.get(type) ?? [];
        const all = this.allRomTypesToGames.get(type) ?? [];

        if (!options.usingDats()) {
          return `${found.length.toLocaleString()} ${type}`;
        }

        const percentage = (found.length / all.length) * 100;
        let color: ChalkInstance;
        if (percentage >= 100) {
          color = chalk.rgb(0, 166, 0); // macOS terminal green
        } else if (percentage >= 75) {
          color = chalk.rgb(153, 153, 0); // macOS terminal yellow
        } else if (percentage >= 50) {
          color = chalk.rgb(160, 124, 0);
        } else if (percentage >= 25) {
          color = chalk.rgb(162, 93, 0);
        } else if (percentage > 0) {
          color = chalk.rgb(160, 59, 0);
        } else {
          color = chalk.rgb(153, 0, 0); // macOS terminal red
        }

        // Patched ROMs are always found===all
        if (type === ROMType.PATCHED) {
          return `${color(all.length.toLocaleString())} ${type}`;
        }

        return `${color(found.length.toLocaleString())}/${all.length.toLocaleString()} ${type}`;
      })
      .filter((str) => str)
      .join(', ')} ${options.shouldWrite() ? 'written' : 'found'}`;
  }

  async toCsv(options: Options): Promise<string> {
    const found = DATStatus.getValuesForAllowedTypes(
      options,
      this.foundRomTypesToReleaseCandidates,
    );

    const rows = DATStatus.getValuesForAllowedTypes(options, this.allRomTypesToGames)
      .filter(ArrayPoly.filterUnique)
      .sort((a, b) => a.getName().localeCompare(b.getName()))
      .map((game) => {
        const releaseCandidate = found.find((rc) => rc && rc.getGame().equals(game));
        return DATStatus.buildCsvRow(
          this.getDATName(),
          game.getName(),
          releaseCandidate || !game.getRoms().length ? Status.FOUND : Status.MISSING,
          releaseCandidate
            ? releaseCandidate.getRomsWithFiles()
              .map((romWithFiles) => (options.shouldWrite()
                ? romWithFiles.getOutputFile()
                : romWithFiles.getInputFile()))
              .map((file) => file.getFilePath())
              .filter(ArrayPoly.filterUnique)
            : [],
          releaseCandidate?.isPatched() ?? false,
          game.isBios(),
          game.isRetail(),
          game.isUnlicensed(),
          game.isDebug(),
          game.isDemo(),
          game.isBeta(),
          game.isSample(),
          game.isPrototype(),
          game.isTest(),
          game.isAftermarket(),
          game.isHomebrew(),
          game.isBad(),
        );
      });
    return writeToString(rows, {
      headers: [
        'DAT Name',
        'Game Name',
        'Status',
        'ROM Files',
        'Patched',
        'BIOS',
        'Retail Release',
        'Unlicensed',
        'Debug',
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

  static async filesToCsv(filePaths: string[], status: Status): Promise<string> {
    return writeToString(filePaths.map((filePath) => this.buildCsvRow('', '', status, [filePath])));
  }

  private static buildCsvRow(
    datName: string,
    gameName: string,
    status: Status,
    filePaths: string[] = [],
    patched = false,
    bios = false,
    retail = false,
    unlicensed = false,
    debug = false,
    demo = false,
    beta = false,
    sample = false,
    prototype = false,
    test = false,
    aftermarket = false,
    homebrew = false,
    bad = false,
  ): string[] {
    return [
      datName,
      gameName,
      Status[status],
      filePaths.join('|'),
      String(patched),
      String(bios),
      String(retail),
      String(unlicensed),
      String(debug),
      String(demo),
      String(beta),
      String(sample),
      String(prototype),
      String(test),
      String(aftermarket),
      String(homebrew),
      String(bad),
    ];
  }

  private static getValuesForAllowedTypes<T>(
    options: Options,
    romTypesToValues: Map<ROMType, T[]>,
  ): T[] {
    return DATStatus.getAllowedTypes(options)
      .map((type) => romTypesToValues.get(type))
      .flatMap((values) => values)
      .filter(ArrayPoly.filterNotNullish)
      .filter(ArrayPoly.filterUnique)
      .sort();
  }

  private static getAllowedTypes(options: Options): ROMType[] {
    return [
      !options.getSingle() && !options.getOnlyBios() && !options.getOnlyRetail()
        ? ROMType.GAME : undefined,
      options.getOnlyBios() || !options.getNoBios() ? ROMType.BIOS : undefined,
      !options.getNoDevice() && !options.getOnlyBios() ? ROMType.DEVICE : undefined,
      options.getOnlyRetail() || !options.getOnlyBios() ? ROMType.RETAIL : undefined,
      ROMType.PATCHED,
    ].filter(ArrayPoly.filterNotNullish);
  }
}
