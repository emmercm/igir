import DAT from './logiqx/dat.js';
import Parent from './logiqx/parent.js';
import ROM from './logiqx/rom.js';
import Options from './options.js';
import ReleaseCandidate from './releaseCandidate.js';

enum ROMType {
  GAME = 'games',
  BIOS = 'bioses',
  RETAIL = 'retail releases',
  PROTOTYPE = 'prototypes',
}

export default class DATStatus {
  private readonly dat: DAT;

  private readonly allRoms = new Map<ROMType, string[]>();

  private readonly missingRoms = new Map<ROMType, string[]>();

  private static append(map: Map<ROMType, string[]>, romType: ROMType, val: string) {
    const arr = (map.has(romType) ? map.get(romType) : []) as string[];
    arr.push(val);
    map.set(romType, arr);
  }

  constructor(dat: DAT, parentsToReleaseCandidates: Map<Parent, ReleaseCandidate[]>) {
    this.dat = dat;

    const crc32sToRoms = [...parentsToReleaseCandidates.values()]
      .flatMap((releaseCandidates) => releaseCandidates)
      .flatMap((releaseCandidate) => releaseCandidate.getRoms())
      .reduce((map, rom) => {
        map.set(rom.getCrc32(), rom);
        return map;
      }, new Map<string, ROM>());

    dat.getParents().forEach((parent) => {
      parent.getGames().forEach((game) => {
        DATStatus.append(this.allRoms, ROMType.GAME, game.getName());
        if (game.isBios()) {
          DATStatus.append(this.allRoms, ROMType.BIOS, game.getName());
        } else if (game.isRetail()) {
          DATStatus.append(this.allRoms, ROMType.RETAIL, game.getName());
        } else if (game.isPrototype()) {
          DATStatus.append(this.allRoms, ROMType.PROTOTYPE, game.getName());
        }

        const missingRoms = game.getRoms().filter((rom) => !crc32sToRoms.has(rom.getCrc32()));
        if (missingRoms.length > 0) {
          DATStatus.append(this.missingRoms, ROMType.GAME, game.getName());
          if (game.isBios()) {
            DATStatus.append(this.missingRoms, ROMType.BIOS, game.getName());
          } else if (game.isRetail()) {
            DATStatus.append(this.missingRoms, ROMType.RETAIL, game.getName());
          } else if (game.isPrototype()) {
            DATStatus.append(this.missingRoms, ROMType.PROTOTYPE, game.getName());
          }
        }
      });
    });
  }

  getDATName(): string {
    return this.dat.getNameLong();
  }

  toString(options: Options): string {
    return `${DATStatus.getAllowedTypes(options)
      .map((type) => {
        const missing = this.missingRoms.get(type) || [];
        const all = this.allRoms.get(type) || [];
        return `${missing.length}/${all.length} ${type}`;
      })
      .join(', ')} missing`;
  }

  toReport(options: Options): string {
    let message = `// ${this.getDATName()}: ${this.dat.getGames().length} games, ${this.dat.getParents().length} parents defined`;

    const allNames = DATStatus.getNamesForAllowedTypes(options, this.allRoms);
    const missingNames = DATStatus.getNamesForAllowedTypes(options, this.missingRoms);

    message += `\n// You are missing ${missingNames.length} of ${allNames.length} known ${this.getDATName()} items (${DATStatus.getAllowedTypes(options).join(', ')})`;
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
      // !options.getOnlyBios() && !options.getNoPrototype() ? ROMType.PROTOTYPE : undefined,
    ].filter((val) => val) as ROMType[];
  }
}
