import DAT from './logiqx/dat.js';
import Game from './logiqx/game.js';
import Parent from './logiqx/parent.js';
import ROM from './logiqx/rom.js';
import Options from './options.js';
import ReleaseCandidate from './releaseCandidate.js';

enum ROMType {
  GAME = 'games',
  BIOS = 'bioses',
  RETAIL = 'retail releases',
}

export default class DATStatus {
  private readonly dat: DAT;

  private readonly allRoms = new Map<ROMType, string[]>();

  private readonly missingRoms = new Map<ROMType, string[]>();

  private static append(map: Map<ROMType, string[]>, romType: ROMType, val: string): void {
    const arr = (map.has(romType) ? map.get(romType) : []) as string[];
    arr.push(val);
    map.set(romType, arr);
  }

  constructor(dat: DAT, parentsToReleaseCandidates: Map<Parent, ReleaseCandidate[]>) {
    this.dat = dat;

    const releaseCandidates = [...parentsToReleaseCandidates.values()]
      .flatMap((rc) => rc);
    const hashCodesToRoms = DATStatus.indexRomsHashCode(releaseCandidates);

    dat.getParents().forEach((parent) => {
      parent.getGames().forEach((game) => {
        DATStatus.pushGameIntoMap(this.allRoms, game);

        const missingRoms = game.getRoms().filter((rom) => !hashCodesToRoms.has(rom.hashCode()));
        if (missingRoms.length > 0) {
          DATStatus.pushGameIntoMap(this.missingRoms, game);
        }
      });
    });
  }

  private static indexRomsHashCode(
    releaseCandidates: ReleaseCandidate[],
  ): Map<string, ROM> {
    return releaseCandidates.reduce((acc, releaseCandidate) => {
      [...releaseCandidate.indexRomsByHashCode().entries()]
        .forEach(([key, val]) => acc.set(key, val));
      return acc;
    }, new Map<string, ROM>());
  }

  private static pushGameIntoMap(map: Map<ROMType, string[]>, game: Game): void {
    DATStatus.append(map, ROMType.GAME, game.getName());
    if (game.isBios()) {
      DATStatus.append(map, ROMType.BIOS, game.getName());
    } else if (game.isRetail()) {
      DATStatus.append(map, ROMType.RETAIL, game.getName());
    }
  }

  getDATName(): string {
    return this.dat.getNameLong();
  }

  toString(options: Options): string {
    return `${DATStatus.getAllowedTypes(options)
      .map((type) => {
        const missing = this.missingRoms.get(type) || [];
        const all = this.allRoms.get(type) || [];
        return `${(all.length - missing.length).toLocaleString()}/${all.length.toLocaleString()} ${type}`;
      })
      .join(', ')} found`;
  }

  toReport(options: Options): string {
    let message = `// ${this.getDATName()}: ${this.dat.getGames().length} games, ${this.dat.getParents().length} parents defined`;

    const allNames = DATStatus.getNamesForAllowedTypes(options, this.allRoms);
    const missingNames = DATStatus.getNamesForAllowedTypes(options, this.missingRoms);

    message += `\n// You are missing ${missingNames.length.toLocaleString()} of ${allNames.length.toLocaleString()} known ${this.getDATName()} items (${DATStatus.getAllowedTypes(options).join(', ')})`;
    if (missingNames.length) {
      message += `\n${missingNames.join('\n')}`;
    }

    return message;
  }

  private static getNamesForAllowedTypes(
    options: Options,
    romTypesToNames: Map<ROMType, string[]>,
  ): string[] {
    return DATStatus.getAllowedTypes(options)
      .map((type) => romTypesToNames.get(type))
      .flatMap((names) => names)
      .filter((name) => name)
      .filter((name, idx, names) => names.indexOf(name) === idx)
      .sort() as string[];
  }

  private static getAllowedTypes(options: Options): ROMType[] {
    return [
      !options.getSingle() && !options.getOnlyBios() && !options.getOnlyRetail()
        ? ROMType.GAME : undefined,
      options.getOnlyBios() || (!options.getNoBios() && !options.getOnlyRetail())
        ? ROMType.BIOS : undefined,
      options.getOnlyRetail() || (!options.getOnlyBios()) ? ROMType.RETAIL : undefined,
    ].filter((romType) => romType) as ROMType[];
  }
}
