import { writeToString } from '@fast-csv/format';
import type { ChalkInstance } from 'chalk';
import chalk from 'chalk';

import ArrayUtil from '../utils/arrayUtil.js';
import IntlUtil from '../utils/intlUtil.js';
import type DAT from './dats/dat.js';
import type Game from './dats/game.js';
import type Options from './options.js';
import type WriteCandidate from './writeCandidate.js';

const ROMType = {
  GAME: 'games',
  BIOS: 'BIOSes',
  DEVICE: 'devices',
  RETAIL: 'retail releases',
  PATCHED: 'patched games',
} as const;
type ROMTypeValue = (typeof ROMType)[keyof typeof ROMType];

export const GameStatus = {
  // The Game wanted to be written, and it has no ROMs or every ROM was found
  FOUND: 1,
  // Only some of the Game's ROMs were found
  INCOMPLETE: 2,
  // The Game wanted to be written, but there was no matching ReleaseCandidate
  MISSING: 3,
  // The input file was not used in any ReleaseCandidate, but a duplicate file was
  DUPLICATE: 4,
  // The input File was not used in any ReleaseCandidate, and neither was any duplicate file
  UNUSED: 5,
  // The output File was not from any ReleaseCandidate, so it was deleted
  DELETED: 6,
} as const;
type GameStatusKey = keyof typeof GameStatus;
export type GameStatusValue = (typeof GameStatus)[GameStatusKey];
const GameStatusInverted = Object.fromEntries(
  Object.entries(GameStatus).map(([key, value]) => [value, key]),
) as Record<GameStatusValue, GameStatusKey>;

/**
 * The subset of a {@link WriteCandidate} that {@link DATStatus} needs to remember. Holding onto
 * this instead of the {@link WriteCandidate} lets the candidate—and everything it references, such
 * as its {@link Game} and its input and output {@link File}s—be garbage collected as soon as the
 * DAT has been processed.
 */
interface CandidateSummary {
  readonly isPatched: boolean;
  readonly romsWithFilesCount: number;
  readonly inputFilePaths: string[];
  readonly inputFileHashCodes: string[];
  readonly outputFilePaths: string[];
}

/**
 * The subset of a {@link Game} that {@link DATStatus} needs to remember. See
 * {@link CandidateSummary} for why the {@link Game} itself isn't retained.
 */
interface GameSummary {
  readonly name: string;
  readonly romCount: number;
  readonly diskCount: number;
  readonly isBios: boolean;
  readonly isDevice: boolean;
  readonly isRetail: boolean;
  readonly isUnlicensed: boolean;
  readonly isDebug: boolean;
  readonly isDemo: boolean;
  readonly isBeta: boolean;
  readonly isSample: boolean;
  readonly isPrototype: boolean;
  readonly isProgram: boolean;
  readonly isAftermarket: boolean;
  readonly isHomebrew: boolean;
  readonly isBad: boolean;
}

/**
 * One {@link Game} in a {@link DAT}, plus the {@link WriteCandidate} that was generated for it (if
 * any). Patched candidates get their own entry, marked with {@link isPatchedEntry}.
 */
interface GameEntry {
  readonly game: GameSummary;
  readonly candidate?: CandidateSummary;
  readonly isFound: boolean;
  readonly isIncomplete: boolean;
  readonly isPatchedEntry: boolean;
}

/**
 * Parse and hold information about every {@link Game} in a {@link DAT}, as well as which
 * {@link Game}s were found (had a {@link WriteCandidate} created for it).
 *
 * One of these is retained for every DAT processed, for the entire life of the run, so it
 * deliberately holds only plain summaries of the games and candidates rather than the objects
 * themselves.
 */
export default class DATStatus {
  private readonly datName: string;

  private readonly entries: GameEntry[] = [];

  constructor(options: Options, dat: DAT, candidates: WriteCandidate[]) {
    this.datName = dat.getName();

    const indexedCandidates = candidates.reduce((map, candidate) => {
      const key = candidate.getGame().hashCode();
      if (map.has(key)) {
        map.get(key)?.push(candidate);
      } else {
        map.set(key, [candidate]);
      }
      return map;
    }, new Map<string, WriteCandidate[]>());

    // Un-patched ROMs
    for (const game of dat.getGames()) {
      const gameSummary = DATStatus.summarizeGame(game);

      const expectedCount = DATStatus.getExpectedFileCount(gameSummary, options);
      const gameCandidates = indexedCandidates.get(game.hashCode());
      if (gameCandidates === undefined && expectedCount !== 0) {
        // The Game is missing
        this.entries.push({
          game: gameSummary,
          isFound: false,
          isIncomplete: false,
          isPatchedEntry: false,
        });
        continue;
      }

      const gameCandidate = gameCandidates?.at(0);
      const candidateSummary =
        gameCandidate === undefined ? undefined : DATStatus.summarizeCandidate(gameCandidate);

      // The found ReleaseCandidate may be incomplete
      const isIncomplete =
        candidateSummary !== undefined && candidateSummary.romsWithFilesCount !== expectedCount;
      this.entries.push({
        game: gameSummary,
        candidate: candidateSummary,
        isFound: !isIncomplete,
        isIncomplete,
        isPatchedEntry: false,
      });
    }

    // Patched ROMs
    for (const candidate of candidates) {
      if (!candidate.isPatched()) {
        continue;
      }
      this.entries.push({
        game: DATStatus.summarizeGame(candidate.getGame()),
        candidate: DATStatus.summarizeCandidate(candidate),
        isFound: true,
        isIncomplete: false,
        isPatchedEntry: true,
      });
    }
  }

  private static summarizeGame(game: Game): GameSummary {
    return {
      name: game.getName(),
      romCount: game.getRoms().length,
      diskCount: game.getDisks().length,
      isBios: game.getIsBios(),
      isDevice: game.getIsDevice(),
      isRetail: game.isRetail(),
      isUnlicensed: game.isUnlicensed(),
      isDebug: game.isDebug(),
      isDemo: game.isDemo(),
      isBeta: game.isBeta(),
      isSample: game.isSample(),
      isPrototype: game.isPrototype(),
      isProgram: game.isProgram(),
      isAftermarket: game.isAftermarket(),
      isHomebrew: game.isHomebrew(),
      isBad: game.isBad(),
    };
  }

  private static summarizeCandidate(candidate: WriteCandidate): CandidateSummary {
    const romsWithFiles = candidate.getRomsWithFiles();
    return {
      isPatched: candidate.isPatched(),
      romsWithFilesCount: romsWithFiles.length,
      inputFilePaths: romsWithFiles.map((romWithFiles) =>
        romWithFiles.getInputFile().getFilePath(),
      ),
      inputFileHashCodes: romsWithFiles.map((romWithFiles) =>
        romWithFiles.getInputFile().hashCode(),
      ),
      outputFilePaths: romsWithFiles.map((romWithFiles) =>
        romWithFiles.getOutputFile().getFilePath(),
      ),
    };
  }

  /**
   * Return the number of {@link ROM}s and {@link Disk}s that must be present for a
   * {@link Game} to be considered FOUND, taking into account options that exclude
   * certain file types (e.g. `--exclude-disks`).
   */
  private static getExpectedFileCount(game: GameSummary, options: Options): number {
    return game.romCount + (options.getExcludeDisks() ? 0 : game.diskCount);
  }

  private static entryHasType(entry: GameEntry, romType: ROMTypeValue): boolean {
    if (entry.isPatchedEntry) {
      return romType === ROMType.PATCHED;
    }
    switch (romType) {
      case ROMType.GAME: {
        return true;
      }
      case ROMType.BIOS: {
        return entry.game.isBios;
      }
      case ROMType.DEVICE: {
        return entry.game.isDevice;
      }
      case ROMType.RETAIL: {
        return entry.game.isRetail;
      }
      case ROMType.PATCHED: {
        return false;
      }
    }
  }

  getDATName(): string {
    return this.datName;
  }

  /**
   * Return the path of every input {@link File} that was matched to a {@link Game}.
   */
  getInputFilePaths(): string[] {
    return this.matchedCandidates().flatMap((candidate) => candidate.inputFilePaths);
  }

  /**
   * Return the hash code of every input {@link File} that was matched to a {@link Game}.
   */
  getInputFileHashCodes(): string[] {
    return this.matchedCandidates().flatMap((candidate) => candidate.inputFileHashCodes);
  }

  private matchedCandidates(): CandidateSummary[] {
    return this.entries
      .filter((entry) => entry.isFound || entry.isIncomplete)
      .map((entry) => entry.candidate)
      .filter((candidate) => candidate !== undefined);
  }

  /**
   * If any {@link Game} in the entire {@link DAT} was found in the input files.
   */
  anyGamesFound(options: Options): boolean {
    const allowedTypes = DATStatus.getAllowedTypes(options);
    return this.entries.some(
      (entry) =>
        entry.isFound && allowedTypes.some((romType) => DATStatus.entryHasType(entry, romType)),
    );
  }

  /**
   * Return a string of CLI-friendly output to be printed by a {@link Logger}.
   */
  toConsole(options: Options): string {
    return `${DATStatus.getAllowedTypes(options)
      .map((type) => {
        const typeEntries = this.entries.filter((entry) => DATStatus.entryHasType(entry, type));
        if (typeEntries.length === 0) {
          return '';
        }
        const foundCount = typeEntries.filter((entry) => entry.isFound).length;
        if (!options.usingDats()) {
          return `${IntlUtil.toLocaleString(foundCount)} ${type}`;
        }

        const percentage = (foundCount / typeEntries.length) * 100;
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
          return `${color(IntlUtil.toLocaleString(typeEntries.length))} ${type}`;
        }

        return `${color(IntlUtil.toLocaleString(foundCount))}/${IntlUtil.toLocaleString(typeEntries.length)} ${type}`;
      })
      .filter((string_) => string_.length > 0)
      .join(', ')} ${options.shouldWrite() ? 'written' : 'found'}`;
  }

  /**
   * Return the file contents of a CSV with status information for every {@link Game}.
   */
  async toCsv(options: Options): Promise<string> {
    const allowedTypes = DATStatus.getAllowedTypes(options);

    const rows = this.entries
      .filter((entry) => allowedTypes.some((romType) => DATStatus.entryHasType(entry, romType)))
      .toSorted((a, b) => a.game.name.localeCompare(b.game.name))
      .map((entry) => {
        let status: GameStatusValue = GameStatus.MISSING;
        if (entry.isIncomplete) {
          status = GameStatus.INCOMPLETE;
        }
        if (
          (entry.isFound && entry.candidate !== undefined) ||
          DATStatus.getExpectedFileCount(entry.game, options) === 0
        ) {
          status = GameStatus.FOUND;
        }

        const filePaths = (
          entry.candidate === undefined
            ? []
            : options.shouldWrite()
              ? entry.candidate.outputFilePaths
              : entry.candidate.inputFilePaths
        ).reduce(ArrayUtil.reduceUnique(), []);

        return DATStatus.buildCsvRow(
          this.getDATName(),
          entry.game.name,
          status,
          filePaths,
          entry.candidate?.isPatched ?? false,
          entry.game.isBios,
          entry.game.isRetail,
          entry.game.isUnlicensed,
          entry.game.isDebug,
          entry.game.isDemo,
          entry.game.isBeta,
          entry.game.isSample,
          entry.game.isPrototype,
          entry.game.isProgram,
          entry.game.isAftermarket,
          entry.game.isHomebrew,
          entry.game.isBad,
        );
      });
    return await writeToString(rows, {
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
   * Return a string of CSV rows without headers for a certain {@link GameStatusValue}.
   */
  static async filesToCsv(filePaths: string[], status: GameStatusValue): Promise<string> {
    return await writeToString(
      filePaths.map((filePath) => this.buildCsvRow('', '', status, [filePath])),
    );
  }

  private static buildCsvRow(
    datName: string,
    gameName: string,
    status: GameStatusValue,
    filePaths: string[] = [],
    isPatched = false,
    isBios = false,
    isRetail = false,
    isUnlicensed = false,
    isDebug = false,
    isDemo = false,
    isBeta = false,
    isSample = false,
    isPrototype = false,
    isTest = false,
    isAftermarket = false,
    isHomebrew = false,
    isBad = false,
  ): string[] {
    return [
      datName,
      gameName,
      GameStatusInverted[status],
      filePaths.join('|'),
      String(isPatched),
      String(isBios),
      String(isRetail),
      String(isUnlicensed),
      String(isDebug),
      String(isDemo),
      String(isBeta),
      String(isSample),
      String(isPrototype),
      String(isTest),
      String(isAftermarket),
      String(isHomebrew),
      String(isBad),
    ];
  }

  private static getAllowedTypes(options: Options): ROMTypeValue[] {
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
