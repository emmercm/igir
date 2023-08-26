import ArrayPoly from '../polyfill/arrayPoly.js';

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

export default class Internationalization {
  public static readonly REGION_OPTIONS: RegionOptions[] = [
    // Specific countries
    { region: 'ARG', long: 'Argentina', language: 'ES' },
    {
      region: 'AUS', long: 'Australia', language: 'EN', regex: /\(A\)/i,
    },
    { region: 'BEL', long: 'Belgium', language: 'FR' },
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
      region: 'UNK', long: 'Unknown', language: 'EN', regex: /\(Unk\)/i,
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
    { region: '', long: 'Scandinavia', language: '' },
    {
      region: 'WORLD', long: 'World', language: 'EN', regex: /\(W\)/i,
    },
  ];

  // In no particular order
  public static readonly LANGUAGE_OPTIONS: LanguageOptions[] = [
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

  public static readonly REGIONS = this.REGION_OPTIONS
    .map((regionOption) => regionOption.region.toUpperCase())
    .filter((region) => region)
    .reduce(ArrayPoly.reduceUnique(), [])
    .sort();

  public static readonly LANGUAGES = this.REGION_OPTIONS
    .map((regionOption) => regionOption.language.toUpperCase())
    .filter((language) => language)
    .reduce(ArrayPoly.reduceUnique(), [])
    .sort();
}
