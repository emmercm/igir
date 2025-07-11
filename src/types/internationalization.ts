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

/**
 * A static class of regions and languages that can be parsed and understood.
 */
export default class Internationalization {
  static readonly REGION_OPTIONS: RegionOptions[] = [
    // Specific countries
    { region: 'ARG', long: 'Argentina', language: 'ES', regex: /\(AR\)/i },
    {
      region: 'AUS',
      long: 'Australia',
      language: 'EN',
      regex: /\((A|AU)\)/i,
    },
    {
      region: 'BEL',
      long: 'Belgium',
      language: 'FR',
      regex: /\(BE\)/i,
    },
    {
      region: 'BRA',
      long: 'Brazil',
      language: 'PT',
      regex: /\((B|BR)\)/i,
    },
    {
      region: 'CAN',
      long: 'Canada',
      language: 'EN',
      regex: /\((C|CA)\)/i,
    },
    {
      region: 'CHN',
      long: 'China',
      language: 'ZH',
      regex: /\((C|CH|CHI|CN)\)/i,
    },
    {
      region: 'DAN',
      long: 'Denmark',
      language: 'DA',
      regex: /\(DK\)/i,
    },
    {
      region: 'FRA',
      long: 'France',
      language: 'FR',
      regex: /\((F|FR)\)/i,
    },
    {
      region: 'FYN',
      long: 'Finland',
      language: 'FI',
      regex: /\((FI|FN)\)/i,
    },
    {
      region: 'GER',
      long: 'Germany',
      language: 'DE',
      regex: /\((DE|G|GE)\)/i,
    },
    {
      region: 'GRE',
      long: 'Greece',
      language: 'EL',
      regex: /\(GR\)/i,
    },
    {
      region: 'HK',
      long: 'Hong Kong',
      language: 'ZH',
      regex: /\(HK\)/i,
    },
    {
      region: 'HOL',
      long: 'Netherlands',
      language: 'NL',
      regex: /\((D|H|NL)\)/i,
    },
    {
      region: 'ITA',
      long: 'Italy',
      language: 'IT',
      regex: /\((I|IT)\)/i,
    },
    {
      region: 'JPN',
      long: 'Japan',
      language: 'JA',
      regex: /\((1|J|JP)\)/i,
    },
    {
      region: 'KOR',
      long: 'Korea',
      language: 'KO',
      regex: /\((K|KR)\)/i,
    },
    {
      region: 'MEX',
      long: 'Mexico',
      language: 'ES',
      regex: /\(MX\)/i,
    },
    {
      region: 'NOR',
      long: 'Norway',
      language: 'NO',
      regex: /\(No\)/i,
    },
    { region: 'NZ', long: 'New Zealand', language: 'EN' },
    { region: 'POR', long: 'Portugal', language: 'PT', regex: /\((P|PT)\)/i },
    {
      region: 'RUS',
      long: 'Russia',
      language: 'RU',
      regex: /\((R|RU)\)/i,
    },
    {
      region: 'SPA',
      long: 'Spain',
      language: 'ES',
      regex: /\((ES|S)\)/i,
    },
    {
      region: 'SWE',
      long: 'Sweden',
      language: 'SV',
      regex: /\((SE|SW)\)/i,
    },
    {
      region: 'TAI',
      long: 'Taiwan',
      language: 'ZH',
      regex: /\(TW\)/i,
    },
    {
      region: 'UK',
      long: 'United Kingdom',
      language: 'EN',
      regex: /\((GB|UK)\)/i,
    },
    {
      region: 'UNK',
      long: 'Unknown',
      language: 'EN',
      regex: /\(Unk\)/i,
    },
    {
      region: 'USA',
      long: 'USA',
      language: 'EN',
      regex: /\((4|5|U|US)\)/i,
    },
    // Regions
    {
      region: 'ASI',
      long: 'Asia',
      language: 'ZH',
      regex: /\(As\)/i,
    },
    {
      region: 'EUR',
      long: 'Europe',
      language: 'EN',
      regex: /\((8|E|EU|PAL)\)/i,
    },
    { region: '', long: 'Scandinavia', language: '' },
    {
      region: 'WORLD',
      long: 'World',
      language: 'EN',
      regex: /\((F|W|WO)\)/i,
    },
  ];

  // In no particular order
  static readonly LANGUAGE_OPTIONS: LanguageOptions[] = [
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

  static readonly REGION_CODES = this.REGION_OPTIONS.map((regionOption) =>
    regionOption.region.toUpperCase(),
  )
    .filter((region) => region.length > 0)
    .reduce(ArrayPoly.reduceUnique(), [])
    .sort();

  static readonly REGION_NAMES = this.REGION_OPTIONS.map((regionOption) => regionOption.long)
    .filter((region) => region.length > 0)
    .reduce(ArrayPoly.reduceUnique(), [])
    .sort();

  static readonly REGION_REGEX = this.REGION_OPTIONS.map(
    (regionOptions) => regionOptions.regex,
  ).filter((regex) => regex !== undefined);

  static readonly LANGUAGES = this.REGION_OPTIONS.map((regionOption) =>
    regionOption.language.toUpperCase(),
  )
    .filter((language) => language.length > 0)
    .reduce(ArrayPoly.reduceUnique(), [])
    .sort();
}
