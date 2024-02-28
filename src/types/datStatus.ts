import { writeToString } from '@fast-csv/format';
import chalk, { ChalkInstance } from 'chalk';

import ArrayPoly from '../polyfill/arrayPoly.js';
import DAT from './dats/dat.js';
import Game from './dats/game.js';
import Parent from './dats/parent.js';
import File from './files/file.js';
import Options from './options.js';
import ReleaseCandidate from './releaseCandidate.js';

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
  // The Game was ignored due to 1G1R rules, and it is unknown if there was a matching
  // ReleaseCandidate
  IGNORED,
  // The Game wanted to be written, but there was no matching ReleaseCandidate
  MISSING,
  // The input File was not used in any ReleaseCandidate
  UNUSED,
  // The output File was not from any ReleaseCandidate, so it was deleted
  DELETED,
}

/**
 * Parse and hold information about every {@link Game} in a {@link DAT}, as well as which
 * {@link Game}s were found (had a {@link ReleaseCandidate} created for it).
 */
export default class DATStatus {
  private readonly dat: DAT;

  private readonly allRomTypesToGames = new Map<ROMType, Game[]>();

  // eslint-disable-next-line no-spaced-func
  private readonly foundRomTypesToReleaseCandidates = new Map<
  ROMType,
  (ReleaseCandidate | undefined)[]
  >();

  private readonly incompleteRomTypesToReleaseCandidates = new Map<ROMType, ReleaseCandidate[]>();

  private readonly ignoredHashCodesToGames = new Map<string, Game>();

  constructor(
    dat: DAT,
    options: Options,
    parentsToReleaseCandidates: Map<Parent, ReleaseCandidate[]>,
  ) {
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
          if (gameReleaseCandidates.length > 0 || game.getRoms().length === 0) {
            // The only reason there may be multiple ReleaseCandidates for a Game is if it has
            // multiple regions, but DATStatus doesn't care about regions.
            const gameReleaseCandidate = gameReleaseCandidates.find(() => true);

            if (gameReleaseCandidate
              && gameReleaseCandidate.getRomsWithFiles().length !== game.getRoms().length
            ) {
              // The found ReleaseCandidate is incomplete
              DATStatus.pushValueIntoMap(
                this.incompleteRomTypesToReleaseCandidates,
                game,
                gameReleaseCandidate,
              );
              return;
            }

            // The found ReleaseCandidate is complete
            DATStatus.pushValueIntoMap(
              this.foundRomTypesToReleaseCandidates,
              game,
              gameReleaseCandidate,
            );
            return;
          }

          // When running in 1G1R mode, if this Parent has at least one ReleaseCandidate, but no
          // matching ReleaseCandidate was found for this Game (above), then report it as IGNORED.
          // We can't know if this Game had matching input files, they would have already been
          // discarded, so those files will be reported as UNUSED.
          if (options.getSingle() && releaseCandidates.length > 0) {
            this.ignoredHashCodesToGames.set(game.hashCode(), game);
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

  getInputFiles(): File[] {
    return [
      ...this.foundRomTypesToReleaseCandidates.values(),
      ...this.incompleteRomTypesToReleaseCandidates.values(),
    ]
      .flat()
      .filter(ArrayPoly.filterNotNullish)
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .map((romWithFiles) => romWithFiles.getInputFile());
  }

  /**
   * If any {@link Game} in the entire {@link DAT} was found in the input files.
   */
  anyGamesFound(options: Options): boolean {
    return DATStatus.getAllowedTypes(options)
      .reduce((result, romType) => {
        const foundReleaseCandidates = (
          this.foundRomTypesToReleaseCandidates.get(romType) ?? []).length;
        return result || foundReleaseCandidates > 0;
      }, false);
  }

  /**
   * Return a string of CLI-friendly output to be printed by a {@link Logger}.
   */
  toConsole(options: Options): string {
    return `${DATStatus.getAllowedTypes(options)
      .filter((type) => this.allRomTypesToGames.get(type)?.length)
      .map((type) => {
        const found = this.foundRomTypesToReleaseCandidates.get(type) ?? [];
        const all = (this.allRomTypesToGames.get(type) ?? [])
          // Do not report ignored 1G1R games in the CLI total
          .filter((game) => !this.ignoredHashCodesToGames.has(game.hashCode()));

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

  /**
   * Return the file contents of a CSV with status information for every {@link Game}.
   */
  async toCsv(options: Options): Promise<string> {
    const foundReleaseCandidates = DATStatus.getValuesForAllowedTypes(
      options,
      this.foundRomTypesToReleaseCandidates,
    );

    const incompleteReleaseCandidates = DATStatus.getValuesForAllowedTypes(
      options,
      this.incompleteRomTypesToReleaseCandidates,
    );

    const rows = DATStatus.getValuesForAllowedTypes(options, this.allRomTypesToGames)
      .reduce(ArrayPoly.reduceUnique(), [])
      .sort((a, b) => a.getName().localeCompare(b.getName()))
      .map((game) => {
        let status = GameStatus.MISSING;

        if (this.ignoredHashCodesToGames.has(game.hashCode())) {
          status = GameStatus.IGNORED;
        }

        const incompleteReleaseCandidate = incompleteReleaseCandidates
          .find((rc) => rc.getGame().equals(game));
        if (incompleteReleaseCandidate) {
          status = GameStatus.INCOMPLETE;
        }

        const foundReleaseCandidate = foundReleaseCandidates
          .find((rc) => rc && rc.getGame().equals(game));
        if (foundReleaseCandidate !== undefined || game.getRoms().length === 0) {
          status = GameStatus.FOUND;
        }

        const filePaths = [
          ...(incompleteReleaseCandidate ? incompleteReleaseCandidate.getRomsWithFiles() : []),
          ...(foundReleaseCandidate ? foundReleaseCandidate.getRomsWithFiles() : []),
        ]
          .map((romWithFiles) => (options.shouldWrite()
            ? romWithFiles.getOutputFile()
            : romWithFiles.getInputFile()))
          .map((file) => file.getFilePath())
          .reduce(ArrayPoly.reduceUnique(), []);

        return DATStatus.buildCsvRow(
          this.getDATName(),
          game.getName(),
          status,
          filePaths,
          foundReleaseCandidate?.isPatched() ?? false,
          game.isBios(),
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
      .filter(ArrayPoly.filterNotNullish)
      .reduce(ArrayPoly.reduceUnique(), [])
      .sort();
  }

  private static getAllowedTypes(options: Options): ROMType[] {
    return [
      !options.getOnlyBios() && !options.getOnlyDevice() && !options.getOnlyRetail()
        ? ROMType.GAME : undefined,
      options.getOnlyBios() || (!options.getNoBios() && !options.getOnlyDevice())
        ? ROMType.BIOS : undefined,
      options.getOnlyDevice() || (!options.getOnlyBios() && !options.getNoDevice())
        ? ROMType.DEVICE : undefined,
      options.getOnlyRetail() || (!options.getOnlyBios() && !options.getOnlyDevice())
        ? ROMType.RETAIL : undefined,
      ROMType.PATCHED,
    ].filter(ArrayPoly.filterNotNullish);
  }
}
