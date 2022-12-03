import Game from './logiqx/game.js';
import Release from './logiqx/release.js';
import ROMWithFiles from './romWithFiles.js';

interface RegionOptions {
  region: string;
  long: string;
  language: string;
  regex?: RegExp;
}

interface LanguageOptions {
  short: string;
  long?: string;
}

export default class ReleaseCandidate {
  /**
   * This is in priority order! Multi-country regions should be at the bottom!
   *
   * @link https://emulation.gametechwiki.com/index.php/GoodTools#Good_codes
   */
  private static readonly REGION_OPTIONS: RegionOptions[] = [
    // Specific countries
    { region: 'ARG', long: 'Argentina', language: 'ES' },
    {
      region: 'AUS', long: 'Australia', language: 'EN', regex: /\(A\)/i,
    },
    {
      region: 'BRA', long: 'Brazil', language: 'PT', regex: /\(B\)/i,
    },
    { region: 'CAN', long: 'Canada', language: 'EN' },
    {
      region: 'CHN', long: 'China', language: 'ZH', regex: /\((C|CH)\)/i,
    },
    { region: 'DAN', long: 'Denmark', language: 'DA' },
    {
      region: 'FRA', long: 'France', language: 'FR', regex: /\(F\)/i,
    },
    {
      region: 'FYN', long: 'Finland', language: 'FI', regex: /\(FN\)/i,
    },
    {
      region: 'GER', long: 'Germany', language: 'DE', regex: /\(G\)/i,
    },
    {
      region: 'GRE', long: 'Greece', language: 'EL', regex: /\(Gr\)/i,
    },
    {
      region: 'HK', long: 'Hong Kong', language: 'ZH', regex: /\(HK\)/i,
    },
    {
      region: 'HOL', long: 'Netherlands', language: 'NL', regex: /\((D|H|NL)\)/i,
    },
    {
      region: 'ITA', long: 'Italy', language: 'IT', regex: /\(I\)/i,
    },
    {
      region: 'JPN', long: 'Japan', language: 'JA', regex: /\((1|J)\)/i,
    },
    {
      region: 'KOR', long: 'Korea', language: 'KO', regex: /\(K\)/i,
    },
    { region: 'MEX', long: 'Mexico', language: 'ES' },
    {
      region: 'NOR', long: 'Norway', language: 'NO', regex: /\(No\)/i,
    },
    { region: 'NZ', long: 'New Zealand', language: 'EN' },
    { region: 'POR', long: 'Portugal', language: 'PT' },
    {
      region: 'RUS', long: 'Russia', language: 'RU', regex: /\(R\)/i,
    },
    {
      region: 'SPA', long: 'Spain', language: 'ES', regex: /\(S\)/i,
    },
    {
      region: 'SWE', long: 'Sweden', language: 'SV', regex: /\(Sw\)/i,
    },
    { region: 'TAI', long: 'Taiwan', language: 'ZH' },
    {
      region: 'UK', long: 'United Kingdom', language: 'EN', regex: /\(UK\)/i,
    },
    {
      region: 'UNK', long: '', language: 'EN', regex: /\(Unk\)/i,
    },
    {
      region: 'USA', long: 'USA', language: 'EN', regex: /\((4|U)\)/i,
    },
    // Regions
    {
      region: 'ASI', long: 'Asia', language: 'ZH', regex: /\(As\)/i,
    },
    {
      region: 'EUR', long: 'Europe', language: 'EN', regex: /\(E\)/i,
    },
    {
      region: 'WORLD', long: 'World', language: 'EN', regex: /\(W\)/i,
    },
  ];

  // In no particular order
  private static readonly LANGUAGE_OPTIONS: LanguageOptions[] = [
    { short: 'DA', long: 'DAN' },
    { short: 'DE', long: 'GER' },
    { short: 'EL' },
    { short: 'EN', long: 'ENG' },
    { short: 'ES', long: 'SPA' },
    { short: 'FI' },
    { short: 'FR', long: 'FRE' },
    { short: 'IT', long: 'ITA' },
    { short: 'JA' },
    { short: 'KO' },
    { short: 'NL', long: 'DUT' },
    { short: 'NO', long: 'NOR' },
    { short: 'PT' },
    { short: 'RU' },
    { short: 'SV', long: 'SWE' },
    { short: 'ZH', long: 'CHI' },
  ];

  private static readonly REGIONS = this.REGION_OPTIONS
    .map((regionOption) => regionOption.region.toUpperCase())
    .filter((region, idx, regions) => regions.indexOf(region) === idx)
    .sort();

  private static readonly LANGUAGES = this.REGION_OPTIONS
    .map((regionOption) => regionOption.language.toUpperCase())
    .filter((language, idx, languages) => languages.indexOf(language) === idx)
    .sort();

  private readonly game: Game;

  private readonly release?: Release;

  private readonly romsWithFiles: ROMWithFiles[];

  constructor(game: Game, release: Release | undefined, romsWithFiles: ROMWithFiles[]) {
    this.game = game;
    this.release = release;
    this.romsWithFiles = romsWithFiles;
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

  getRelease(): Release | undefined {
    return this.release;
  }

  getRomsWithFiles(): ROMWithFiles[] {
    return this.romsWithFiles;
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
      if (regionOption.long
        && this.getName().match(new RegExp(`\\(${regionOption.long}(,[ a-z]+)*\\)`, 'i'))
      ) {
        return regionOption.region.toUpperCase();
      }
      if (regionOption.regex && this.getName().match(regionOption.regex)) {
        return regionOption.region.toUpperCase();
      }
    }
    return null;
  }

  getLanguages(): string[] {
    // Get language off of the release
    if (this.release?.getLanguage()) {
      return [(this.release.getLanguage() as string).toUpperCase()];
    }

    const shortLanguages = this.getShortLanguagesFromName();
    if (shortLanguages.length) {
      return shortLanguages;
    }

    const longLanguages = this.getLongLanguagesFromName();
    if (longLanguages.length) {
      return longLanguages;
    }

    const regionLanguage = this.getLanguageFromRegion();
    if (regionLanguage) {
      return [regionLanguage];
    }

    return [];
  }

  private getShortLanguagesFromName(): string[] {
    const twoMatches = this.getName().match(/\(([a-zA-Z]{2}([,+][a-zA-Z]{2})*)\)/);
    if (twoMatches && twoMatches.length >= 2) {
      const twoMatchesParsed = twoMatches[1].split(/[,+]/)
        .map((lang) => lang.toUpperCase())
        .filter((lang) => ReleaseCandidate.LANGUAGES.indexOf(lang) !== -1) // is known
        .filter((lang, idx, langs) => langs.indexOf(lang) === idx);
      if (twoMatchesParsed.length) {
        return twoMatchesParsed;
      }
    }
    return [];
  }

  private getLongLanguagesFromName(): string[] {
    // Get language from long languages in the game name
    const threeMatches = this.getName().match(/\(([a-zA-Z]{3}(-[a-zA-Z]{3})*)\)/);
    if (threeMatches && threeMatches.length >= 2) {
      const threeMatchesParsed = threeMatches[1].split('-')
        .map((lang) => lang.toUpperCase())
        .map((lang) => ReleaseCandidate.LANGUAGE_OPTIONS
          .filter((langOpt) => langOpt.long?.toUpperCase() === lang.toUpperCase())[0]?.short)
        .filter((lang) => ReleaseCandidate.LANGUAGES.indexOf(lang) !== -1) // is known
        .filter((lang, idx, langs) => langs.indexOf(lang) === idx);
      if (threeMatchesParsed.length) {
        return threeMatchesParsed;
      }
    }
    return [];
  }

  private getLanguageFromRegion(): string | undefined {
    // Get language from the region
    if (this.getRegion()) {
      const region = (this.getRegion() as string).toUpperCase();
      for (let i = 0; i < ReleaseCandidate.REGION_OPTIONS.length; i += 1) {
        const regionOption = ReleaseCandidate.REGION_OPTIONS[i];
        if (regionOption.region === region) {
          return regionOption.language.toUpperCase();
        }
      }
    }
    return undefined;
  }
}
