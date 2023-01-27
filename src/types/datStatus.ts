import { writeToString } from '@fast-csv/format';
import chalk, { ChalkInstance } from 'chalk';

import DAT from './logiqx/dat.js';
import Game from './logiqx/game.js';
import Parent from './logiqx/parent.js';
import Options from './options.js';
import ReleaseCandidate from './releaseCandidate.js';

// TODO(cemmer): TypeScript v5.0.0 allows us to change the value to a tuple of singular+plural
enum ROMType {
  GAME = 'games',
  BIOS = 'BIOSes',
  RETAIL = 'retail releases',
  PATCHED = 'patched games',
}

export default class DATStatus {
  private readonly dat: DAT;

  private readonly allRomTypesToGames = new Map<ROMType, Game[]>();

  private readonly foundRomTypesToReleaseCandidates = new Map<ROMType, ReleaseCandidate[]>();

  constructor(dat: DAT, parentsToReleaseCandidates: Map<Parent, ReleaseCandidate[]>) {
    this.dat = dat;

    const unpatchedHashCodesToRomsWithInputFiles = [...parentsToReleaseCandidates.values()]
      .flatMap((releaseCandidates) => releaseCandidates)
      .filter((releaseCandidate) => !releaseCandidate.isPatched())
      .reduce((map, releaseCandidate) => {
        const romsWithFiles = releaseCandidate.getRomsWithFiles();
        for (let i = 0; i < romsWithFiles.length; i += 1) {
          map.set(romsWithFiles[i].getRom().hashCode(), releaseCandidate);
        }
        return map;
      }, new Map<string, ReleaseCandidate>());
    dat.getParents().forEach((parent) => {
      parent.getGames().forEach((game) => {
        DATStatus.pushValueIntoMap(this.allRomTypesToGames, game, game);

        const releaseCandidates = game.getRoms()
          .map((rom) => unpatchedHashCodesToRomsWithInputFiles.get(rom.hashCode()))
          .filter((releaseCandidate) => releaseCandidate);
        if (releaseCandidates.length === game.getRoms().length) {
          DATStatus.pushValueIntoMap(
            this.foundRomTypesToReleaseCandidates,
            game,
            // Assume all ROMs had the same ReleaseCandidate
            releaseCandidates[0],
          );
        }
      });
    });

    [...parentsToReleaseCandidates.values()]
      .flatMap((releaseCandidates) => releaseCandidates)
      .filter((releaseCandidate) => releaseCandidate.isPatched())
      .forEach((releaseCandidate) => {
        const game = releaseCandidate.getGame();

        DATStatus.append(this.allRomTypesToGames, ROMType.PATCHED, game);
        DATStatus.append(this.foundRomTypesToReleaseCandidates, ROMType.PATCHED, releaseCandidate);
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

        // If we're not using a DAT then found===all
        if (!options.usingDats()) {
          return `${all.length.toLocaleString()} ${type}`;
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
          releaseCandidate?.isPatched() || false,
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
        'Patched',
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
      ROMType.PATCHED,
    ].filter((romType) => romType) as ROMType[];
  }
}
