import Game from './logiqx/game.js';
import Release from './logiqx/release.js';
import ROM from './logiqx/rom.js';
import ROMFile from './romFile.js';

interface RegionOptions {
  region: string;
  countryRegex: string;
  language: string;
}

export default class ReleaseCandidate {
  private static readonly REGION_OPTIONS: RegionOptions[] = [
    // Specific countries
    { region: 'ARG', countryRegex: 'Argentina', language: 'ES' },
    { region: 'AUS', countryRegex: 'Australia', language: 'EN' },
    { region: 'BRA', countryRegex: 'Brazil', language: 'PT' },
    { region: 'CAN', countryRegex: 'Canada', language: 'EN' },
    { region: 'CHN', countryRegex: 'China', language: 'ZH' },
    { region: 'DAN', countryRegex: 'Denmark', language: 'DA' },
    { region: 'FRA', countryRegex: 'France', language: 'FR' },
    { region: 'FYN', countryRegex: 'Finland', language: 'FI' },
    { region: 'GER', countryRegex: 'Germany', language: 'DE' },
    { region: 'GRE', countryRegex: 'Greece', language: 'EL' },
    { region: 'HK', countryRegex: 'Hong Kong', language: 'ZH' },
    { region: 'HOL', countryRegex: 'Netherlands', language: 'NL' },
    { region: 'ITA', countryRegex: 'Italy', language: 'IT' },
    { region: 'JPN', countryRegex: 'Japan', language: 'JA' },
    { region: 'KOR', countryRegex: 'Korea', language: 'KO' },
    { region: 'MEX', countryRegex: 'Mexico', language: 'ES' },
    { region: 'NOR', countryRegex: 'Norway', language: 'NO' },
    { region: 'NZ', countryRegex: 'New Zealand', language: 'EN' },
    { region: 'POR', countryRegex: 'Portugal', language: 'PT' },
    { region: 'RUS', countryRegex: 'Russia', language: 'RU' },
    { region: 'SPA', countryRegex: 'Spain', language: 'ES' },
    { region: 'SWE', countryRegex: 'Sweden', language: 'SV' },
    { region: 'TAI', countryRegex: 'Taiwan', language: 'ZH' },
    { region: 'UK', countryRegex: 'United Kingdom', language: 'EN' },
    { region: 'UNK', countryRegex: '', language: 'EN' },
    { region: 'USA', countryRegex: 'United States', language: 'EN' },
    // Regions
    { region: 'ASI', countryRegex: 'Asia', language: 'ZH' },
    { region: 'EUR', countryRegex: 'Europe', language: 'EN' },
  ];

  private static readonly REGIONS = this.REGION_OPTIONS
    .map((regionOption) => regionOption.region)
    .filter((region, idx, regions) => regions.indexOf(region) === idx)
    .sort();

  private static readonly LANGUAGES = this.REGION_OPTIONS
    .map((regionOption) => regionOption.language)
    .filter((language, idx, languages) => languages.indexOf(language) === idx)
    .sort();

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

  static getRegions(): string[] {
    return this.REGIONS;
  }

  static getLanguages(): string[] {
    return this.LANGUAGES;
  }

  // Property getters

  getGame(): Game {
    return this.game;
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
    const matches = this.getName().match(/\(Rev\s*([0-9.]+)\)/i);
    if (matches && matches?.length >= 2 && !Number.isNaN(matches[1])) {
      return Number(matches[1]);
    }
    return 0;
  }

  getRegion(): string | null {
    if (this.release?.getRegion()) {
      return this.release.getRegion();
    }

    for (let i = 0; i < ReleaseCandidate.REGION_OPTIONS.length; i += 1) {
      const regionOption = ReleaseCandidate.REGION_OPTIONS[i];
      if (regionOption.countryRegex) {
        if (this.getName().match(new RegExp(`(${regionOption.countryRegex}(,[ a-z])*)`, 'i'))) {
          return regionOption.region.toUpperCase();
        }
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
      const region = (this.getRegion() as string).toUpperCase();

      for (let i = 0; i < ReleaseCandidate.REGION_OPTIONS.length; i += 1) {
        const regionOption = ReleaseCandidate.REGION_OPTIONS[i];
        if (regionOption.region === region) {
          return [regionOption.language.toUpperCase()];
        }
      }
    }

    return [];
  }
}
