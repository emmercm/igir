import Game from './logiqx/game.js';
import Release from './logiqx/release.js';
import ROM from './logiqx/rom.js';
import ROMFile from './romFile.js';

export default class ReleaseCandidate {
  private readonly game!: Game;

  private readonly release!: Release | null;

  private readonly roms!: ROM[];

  private readonly romFiles!: ROMFile[];

  constructor(game: Game, release: Release | null, roms: ROM[], romFiles: ROMFile[]) {
    this.game = game;
    this.release = release;
    this.roms = roms;
    this.romFiles = romFiles;
  }

  // Property getters

  getGame(): Game {
    return this.game;
  }

  getRelease(): Release | null {
    return this.release;
  }

  getRoms(): ROM[] {
    return this.roms;
  }

  getRomsByCrc32(): Map<string, ROM> {
    return this.getRoms().reduce((acc, rom) => {
      acc.set(rom.getCrc32(), rom);
      return acc;
    }, new Map<string, ROM>());
  }

  getRomFiles(): ROMFile[] {
    return this.romFiles;
  }

  // Computed getters

  getName(): string {
    if (this.release) {
      return this.release.getName();
    }
    return this.game.getName();
  }

  getRevision(): number {
    const matches = this.getName().match(/\(Rev\s*([0-9]+)\)/i);
    if (matches && matches?.length >= 2 && !Number.isNaN(matches[1])) {
      return Number(matches[1]);
    }
    return 0;
  }

  getRegion(): string | null {
    if (this.release?.getRegion()) {
      return this.release.getRegion();
    }

    const regexToRegion = [
      // Specific countries
      ['Argentina', 'ARG'],
      ['Australia', 'AUS'],
      ['Brazil', 'BRA'],
      ['Canada', 'CAN'],
      ['China', 'CHN'],
      ['Denmark', 'DAN'],
      ['Finland', 'FYN'],
      ['France', 'FRA'],
      ['Germany', 'GER'],
      ['Greece', 'GRE'],
      ['Hong Kong', 'HK'],
      ['Italy', 'ITA'],
      ['Japan', 'JPN'],
      ['Korea', 'KOR'],
      ['Mexico', 'MEX'],
      ['Netherlands', 'HOL'],
      ['New Zealand', 'NZ'],
      ['Norway', 'NOR'],
      ['Portugal', 'POR'],
      ['Russia', 'RUS'],
      ['Spain', 'SPA'],
      ['Sweden', 'SWE'],
      ['Taiwan', 'TAI'],
      ['United Kingdom', 'UK'],
      ['USA', 'USA'],
      // Regions
      ['Asia', 'ASI'],
      ['Europe', 'EUR'],
    ];
    for (let i = 0; i < regexToRegion.length; i += 1) {
      const [regex, region] = regexToRegion[i];
      if (this.getName().match(new RegExp(`(${regex}(,[ a-z])*)`, 'i'))) {
        return region;
      }
    }
    return null;
  }

  getLanguages(): string[] {
    // Get language off of the release
    if (this.release?.getLanguage()) {
      return [(this.release.getLanguage() as string).toUpperCase()];
    }

    // Get language from languages in the game name
    const matches = this.getName().match(/\(([a-zA-Z]{2}([,+][a-zA-Z]{2})*)\)/);
    if (matches && matches.length >= 2) {
      return matches[1].split(',').map((lang) => lang.toUpperCase());
    }

    // Get language from the region
    if (this.getRegion()) {
      const regionLang = {
        ARG: 'Es',
        ASI: 'Zh',
        AUS: 'En',
        BRA: 'Pt',
        CAN: 'En',
        CHN: 'Zh',
        DAN: 'Da',
        EUR: 'En',
        FRA: 'Fr',
        FYN: 'Fi',
        GER: 'De',
        GRE: 'El',
        HK: 'Zh',
        HOL: 'Nl',
        ITA: 'It',
        JPN: 'Ja',
        KOR: 'Ko',
        MEX: 'Es',
        NOR: 'No',
        NZ: 'En',
        POR: 'Pt',
        RUS: 'Ru',
        SPA: 'Es',
        SWE: 'Sv',
        TAI: 'Zh',
        UK: 'En',
        UNK: 'En',
        USA: 'En',
      }[(this.getRegion() as string).toUpperCase()];
      if (regionLang) {
        return [regionLang.toUpperCase()];
      }
    }

    return [];
  }
}
