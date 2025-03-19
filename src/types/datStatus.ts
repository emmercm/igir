import { writeToString } from '@fast-csv/format';
import chalk, { ChalkInstance } from 'chalk';

import ArrayPoly from '../polyfill/arrayPoly.js';
import DAT from './dats/dat.js';
import Game from './dats/game.js';
import File from './files/file.js';
import Options from './options.js';
import WriteCandidate from './writeCandidate.js';

enum ROMType {
  GAME = 'games',
  BIOS = 'BIOSes',
  DEVICE = 'devices',
  RETAIL = 'retail releases',
  PATCHED = 'patched games',
}

export enum GameStatus {
  // The Game wanted to be written, and it has no ROMs or every ROM was found
  FOUND = 1,
  // Only some of the Game's ROMs were found
  INCOMPLETE,
  // The Game wanted to be written, but there was no matching ReleaseCandidate
  MISSING,
  // The input file was not used in any ReleaseCandidate, but a duplicate file was
  DUPLICATE,
  // The input File was not used in any ReleaseCandidate, and neither was any duplicate file
  UNUSED,
  // The output File was not from any ReleaseCandidate, so it was deleted
  DELETED,
}

/**
 * Parse and hold information about every {@link Game} in a {@link DAT}, as well as which
 * {@link Game}s were found (had a {@link WriteCandidate} created for it).
 */
export default class DATStatus {
  private readonly dat: DAT;

  private readonly allRomTypesToGames = new Map<ROMType, Game[]>();

  private readonly foundRomTypesToCandidates = new Map<ROMType, (WriteCandidate | undefined)[]>();

  private readonly incompleteRomTypesToCandidates = new Map<ROMType, WriteCandidate[]>();

  constructor(dat: DAT, candidates: WriteCandidate[]) {
    this.dat = dat;

    const indexedCandidates = candidates.reduce((map, candidate) => {
      const key = candidate.getGame().hashCode();
      if (!map.has(key)) {
        map.set(key, [candidate]);
      } else {
        map.get(key)?.push(candidate);
      }
      return map;
    }, new Map<string, WriteCandidate[]>());

    // Un-patched ROMs
    dat.getGames().forEach((game: Game) => {
      DATStatus.pushValueIntoMap(this.allRomTypesToGames, game, game);

      const gameCandidates = indexedCandidates.get(game.hashCode());
      if (gameCandidates !== undefined || game.getRoms().length === 0) {
        const gameCandidate = gameCandidates?.at(0);

        if (gameCandidate && gameCandidate.getRomsWithFiles().length !== game.getRoms().length) {
          // The found ReleaseCandidate is incomplete
          DATStatus.pushValueIntoMap(this.incompleteRomTypesToCandidates, game, gameCandidate);
          return;
        }

        // The found ReleaseCandidate is complete
        DATStatus.pushValueIntoMap(this.foundRomTypesToCandidates, game, gameCandidate);
        return;
      }
    });

    // Patched ROMs
    candidates
      .filter((candidate) => candidate.isPatched())
      .forEach((candidate) => {
        const game = candidate.getGame();
        DATStatus.append(this.allRomTypesToGames, ROMType.PATCHED, game);
        DATStatus.append(this.foundRomTypesToCandidates, ROMType.PATCHED, candidate);
      });
  }

  private static pushValueIntoMap<T>(map: Map<ROMType, T[]>, game: Game, value: T): void {
    DATStatus.append(map, ROMType.GAME, value);
    if (game.getIsBios()) {
      DATStatus.append(map, ROMType.BIOS, value);
    }
    if (game.getIsDevice()) {
      DATStatus.append(map, ROMType.DEVICE, value);
    }
    if (game.isRetail()) {
      DATStatus.append(map, ROMType.RETAIL, value);
    }
  }

  private static append<T>(map: Map<ROMType, T[]>, romType: ROMType, val: T): void {
    if (!map.has(romType)) {
      map.set(romType, [val]);
    } else {
      map.get(romType)?.push(val);
    }
  }

  getDATName(): string {
    return this.dat.getName();
  }

  getInputFiles(): File[] {
    return [
      ...this.foundRomTypesToCandidates.values(),
      ...this.incompleteRomTypesToCandidates.values(),
    ]
      .flat()
      .filter((candidate) => candidate !== undefined)
      .flatMap((candidate) => candidate.getRomsWithFiles())
      .map((romWithFiles) => romWithFiles.getInputFile());
  }

  /**
   * If any {@link Game} in the entire {@link DAT} was found in the input files.
   */
  anyGamesFound(options: Options): boolean {
    return DATStatus.getAllowedTypes(options).reduce((result, romType) => {
      const foundCandidates = this.foundRomTypesToCandidates.get(romType)?.length ?? 0;
      return result || foundCandidates > 0;
    }, false);
  }

  /**
   * Return a string of CLI-friendly output to be printed by a {@link Logger}.
   */
  toConsole(options: Options): string {
    return `${DATStatus.getAllowedTypes(options)
      .filter(
        (type) =>
          this.allRomTypesToGames.has(type) && this.allRomTypesToGames.get(type)!.length > 0,
      )
      .map((type) => {
        const found = this.foundRomTypesToCandidates.get(type) ?? [];
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
      .filter((str) => str.length > 0)
      .join(', ')} ${options.shouldWrite() ? 'written' : 'found'}`;
  }

  /**
   * Return the file contents of a CSV with status information for every {@link Game}.
   */
  async toCsv(options: Options): Promise<string> {
    const foundCandidates = DATStatus.getValuesForAllowedTypes(
      options,
      this.foundRomTypesToCandidates,
    );

    const incompleteCandidates = DATStatus.getValuesForAllowedTypes(
      options,
      this.incompleteRomTypesToCandidates,
    );

    const rows = DATStatus.getValuesForAllowedTypes(options, this.allRomTypesToGames)
      .reduce(ArrayPoly.reduceUnique(), [])
      .sort((a, b) => a.getName().localeCompare(b.getName()))
      .map((game) => {
        let status = GameStatus.MISSING;

        const incompleteCandidate = incompleteCandidates.find((candidate) =>
          candidate.getGame().equals(game),
        );
        if (incompleteCandidate) {
          status = GameStatus.INCOMPLETE;
        }

        const foundCandidate = foundCandidates.find((candidate) =>
          candidate?.getGame().equals(game),
        );
        if (foundCandidate !== undefined || game.getRoms().length === 0) {
          status = GameStatus.FOUND;
        }

        const filePaths = [
          ...(incompleteCandidate ? incompleteCandidate.getRomsWithFiles() : []),
          ...(foundCandidate ? foundCandidate.getRomsWithFiles() : []),
        ]
          .map((romWithFiles) =>
            options.shouldWrite() ? romWithFiles.getOutputFile() : romWithFiles.getInputFile(),
          )
          .map((file) => file.getFilePath())
          .reduce(ArrayPoly.reduceUnique(), []);

        return DATStatus.buildCsvRow(
          this.getDATName(),
          game.getName(),
          status,
          filePaths,
          foundCandidate?.isPatched() ?? false,
          game.getIsBios(),
          game.isRetail(),
          game.isUnlicensed(),
          game.isDebug(),
          game.isDemo(),
          game.isBeta(),
          game.isSample(),
          game.isPrototype(),
          game.isProgram(),
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
        'Program',
        'Aftermarket',
        'Homebrew',
        'Bad',
      ],
    });
  }

  /**
   * Return a string of CSV rows without headers for a certain {@link GameStatus}.
   */
  static async filesToCsv(filePaths: string[], status: GameStatus): Promise<string> {
    return writeToString(filePaths.map((filePath) => this.buildCsvRow('', '', status, [filePath])));
  }

  private static buildCsvRow(
    datName: string,
    gameName: string,
    status: GameStatus,
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
      GameStatus[status],
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
      .flatMap((type) => romTypesToValues.get(type))
      .filter((value) => value !== undefined)
      .reduce(ArrayPoly.reduceUnique(), [])
      .sort();
  }

  private static getAllowedTypes(options: Options): ROMType[] {
    return [
      !options.getOnlyBios() && !options.getOnlyDevice() && !options.getOnlyRetail()
        ? ROMType.GAME
        : undefined,
      options.getOnlyBios() || (!options.getNoBios() && !options.getOnlyDevice())
        ? ROMType.BIOS
        : undefined,
      options.getOnlyDevice() || (!options.getOnlyBios() && !options.getNoDevice())
        ? ROMType.DEVICE
        : undefined,
      options.getOnlyRetail() || (!options.getOnlyBios() && !options.getOnlyDevice())
        ? ROMType.RETAIL
        : undefined,
      ROMType.PATCHED,
    ].filter((romType) => romType !== undefined);
  }
}
