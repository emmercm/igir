import 'reflect-metadata';

import { Expose, Transform, Type } from 'class-transformer';

import ArrayPoly from '../../polyfill/arrayPoly.js';
import Internationalization from '../internationalization.js';
import Release from './release.js';
import ROM from './rom.js';

enum GameType {
  AFTERMARKET = 'Aftermarket',
  ALPHA = 'Alpha',
  BAD = 'Bad',
  BETA = 'Beta',
  BIOS = 'BIOS',
  DEBUG = 'Debug',
  DEMO = 'Demo',
  DEVICE = 'Device',
  FIXED = 'Fixed',
  HACKED = 'Hacked',
  HOMEBREW = 'Homebrew',
  OVERDUMP = 'Overdump',
  PENDING_DUMP = 'Pending Dump',
  PIRATED = 'Pirated',
  PROTOTYPE = 'Prototype',
  RETAIL = 'Retail',
  SAMPLE = 'Sample',
  TEST = 'Test',
  TRAINED = 'Trained',
  TRANSLATED = 'Translated',
  UNLICENSED = 'Unlicensed',
}

/**
 * "There are two 'semi-optional' fields that can be included for each game;
 * 'year' and 'manufacturer'. However, CMPro displays the manufacturer in the
 * scanner window so it isn't really optional! For the sake of completeness I
 * would recommend you include year and manufacturer."
 *
 * "There are two fields that relate to the merging of ROMs; 'cloneof' and
 * 'romof'. In MAME the 'cloneof' field represents a notional link between
 * the two games and the 'romof' field represents that the ROMs themselves
 * can be shared. CMPro actually ignores the 'romof' field and uses the
 * 'cloneof' value to determine how the ROMs can be shared. However, you should
 * use the MAME meanings of 'cloneof and 'romof' both for the sake of clarity
 * and to allow faultless conversions between CMPro and RomCenter formats.
 * If you don't use these fields correctly then you cannot guarantee that your
 * data file will work as expected in CMPro and RomCenter for all three merge
 * types."
 * @see http://www.logiqx.com/DatFAQs/CMPro.php
 */
export interface GameProps {
  readonly name?: string,
  readonly category?: string,
  readonly description?: string,
  // readonly sourceFile?: string,
  readonly bios?: 'yes' | 'no',
  readonly device?: 'yes' | 'no',
  readonly cloneOf?: string,
  readonly romOf?: string,
  readonly sampleOf?: string,
  // readonly board?: string,
  // readonly rebuildTo?: string,
  // readonly year?: string,
  // readonly manufacturer?: string,
  readonly release?: Release | Release[],
  readonly rom?: ROM | ROM[],
  // readonly disk?: Disk | Disk[],
}

/**
 * A logical "game" that contains zero or more {@link ROM}s, and has zero or more region
 * {@link Release}s.
 */
export default class Game implements GameProps {
  @Expose()
  readonly name: string;

  /**
   * This is non-standard, but Redump uses it:
   * @see http://wiki.redump.org/index.php?title=Redump_Search_Parameters#Category
   */
  @Expose()
  readonly category: string;

  @Expose()
  readonly description: string;

  @Expose({ name: 'isbios' })
  readonly bios: 'yes' | 'no' = 'no';

  @Expose({ name: 'isdevice' })
  readonly device: 'yes' | 'no' = 'no';

  @Expose({ name: 'cloneof' })
  readonly cloneOf?: string;

  @Expose({ name: 'romof' })
  readonly romOf?: string;

  @Expose({ name: 'sampleof' })
  readonly sampleOf?: string;

  // readonly board?: string;
  // readonly rebuildto?: string;
  // readonly year?: string;
  // readonly manufacturer?: string;

  @Expose()
  @Type(() => Release)
  @Transform(({ value }) => value || [])
  readonly release?: Release | Release[];

  @Expose()
  @Type(() => ROM)
  @Transform(({ value }) => value || [])
  readonly rom?: ROM | ROM[];

  constructor(props?: GameProps) {
    this.name = props?.name ?? '';
    this.category = props?.category ?? '';
    this.description = props?.description ?? '';
    this.bios = props?.bios ?? this.bios;
    this.device = props?.device ?? this.device;
    this.cloneOf = props?.cloneOf;
    this.romOf = props?.romOf;
    this.sampleOf = props?.sampleOf;
    this.release = props?.release ?? [];
    this.rom = props?.rom ?? [];
  }

  /**
   * Create an XML object, to be used by the owning {@link DAT}.
   */
  toXmlDatObj(parentNames: Set<string>): object {
    return {
      $: {
        name: this.getName(),
        isbios: this.isBios() ? 'yes' : undefined,
        isdevice: this.isDevice() ? 'yes' : undefined,
        cloneof: this.getParent() && parentNames.has(this.getParent())
          ? this.getParent()
          : undefined,
        romof: this.getBios() && parentNames.has(this.getBios())
          ? this.getBios()
          : undefined,
      },
      description: {
        _: this.getDescription(),
      },
      release: this.getReleases().map((release) => release.toXmlDatObj()),
      rom: this.getRoms().map((rom) => rom.toXmlDatObj()),
    };
  }

  // Property getters

  getName(): string {
    return this.name;
  }

  getCategory(): string {
    return this.category;
  }

  getDescription(): string {
    return this.description;
  }

  /**
   * Is this game a collection of BIOS file(s).
   */
  isBios(): boolean {
    return this.bios === 'yes' || this.name.match(/\[BIOS\]/i) !== null;
  }

  /**
   * Is this game a MAME "device"?
   */
  isDevice(): boolean {
    return this.device === 'yes';
  }

  getReleases(): Release[] {
    if (Array.isArray(this.release)) {
      return this.release;
    } if (this.release) {
      return [this.release];
    }
    return [];
  }

  getRoms(): ROM[] {
    if (Array.isArray(this.rom)) {
      return this.rom;
    } if (this.rom) {
      return [this.rom];
    }
    return [];
  }

  // Computed getters

  getRevision(): number {
    // Numeric revision
    const numberMatches = this.getName().match(/\(Rev\s*([0-9.]+)\)/i);
    if (numberMatches && numberMatches?.length >= 2 && !Number.isNaN(numberMatches[1])) {
      return Number(numberMatches[1]);
    }

    // Letter revision
    const letterMatches = this.getName().match(/\(Rev\s*([A-Z])\)/i);
    if (letterMatches && letterMatches?.length >= 2) {
      return (letterMatches[1].toUpperCase().codePointAt(0) as number) - ('A'.codePointAt(0) as number) + 1;
    }

    // Ring code revision
    const ringCodeMatches = this.getName().match(/\(RE([0-9]+)\)/i);
    if (ringCodeMatches && ringCodeMatches?.length >= 2 && !Number.isNaN(ringCodeMatches[1])) {
      return Number(ringCodeMatches[1]);
    }

    return 0;
  }

  /**
   * Is this game explicitly NTSC?
   */
  isNTSC(): boolean {
    return this.name.match(/\(NTSC\)/i) !== null;
  }

  /**
   * Is this game explicitly PAL?
   */
  isPAL(): boolean {
    return this.name.match(/\(PAL[a-z0-9 ]*\)/i) !== null;
  }

  /**
   * Is this game aftermarket (released after the last known console release)?
   */
  isAftermarket(): boolean {
    return this.name.match(/\(Aftermarket[a-z0-9. ]*\)/i) !== null;
  }

  /**
   * Is this game an alpha pre-release?
   */
  isAlpha(): boolean {
    return this.name.match(/\(Alpha[a-z0-9. ]*\)/i) !== null;
  }

  /**
   * Is this game a "bad" dump?
   */
  isBad(): boolean {
    if (this.name.match(/\[b[0-9]*\]/) !== null) {
      return true;
    }
    if (this.isVerified()) {
      // Sometimes [!] can get mixed with [c], consider it not bad
      return false;
    }
    return this.name.match(/\[c\]/) !== null // "known bad checksum but good dump"
        || this.name.match(/\[x\]/) !== null; // "thought to have a bad checksum"
  }

  /**
   * Is this game a beta pre-release?
   */
  isBeta(): boolean {
    return this.name.match(/\(Beta[a-z0-9. ]*\)/i) !== null;
  }

  /**
   * Does this game contain debug symbols?
   */
  isDebug(): boolean {
    return this.name.match(/\(Debug[a-z0-9. ]*\)/i) !== null;
  }

  public static readonly DEMO_REGEX = new RegExp([
    '\\(Demo[a-z0-9. -]*\\)',
    '@barai',
    '\\(Kiosk[a-z0-9. -]*\\)',
    '\\(Preview\\)',
    'GameCube Preview',
    'Kiosk Demo Disc',
    'PS2 Kiosk',
    'PSP System Kiosk',
    'Taikenban', // "trial"
    'Trial Edition',
  ].join('|'), 'i');

  /**
   * Is this game a demo?
   */
  isDemo(): boolean {
    return this.name.match(Game.DEMO_REGEX) !== null
      || this.getCategory() === 'Demos';
  }

  /**
   * Is this game "fixed" (altered to run better in emulation)?
   */
  isFixed(): boolean {
    return this.name.match(/\[f[0-9]*\]/) !== null;
  }

  /**
   * Is this game community homebrew?
   */
  isHomebrew(): boolean {
    return this.name.match(/\(Homebrew[a-z0-9. ]*\)/i) !== null;
  }

  /**
   * Is this game MIA (has not been dumped yet)?
   *
   * NOTE(cemmer): RomVault indicates that some DATs include <rom mia="yes"/>, but I did not find
   * any evidence of this in No-Intro, Redump, TOSEC, and FinalBurn Neo.
   * https://wiki.romvault.com/doku.php?id=mia_rom_tracking#can_i_manually_flag_roms_as_mia
   */
  isMIA(): boolean {
    return this.name.match(/\[MIA\]/i) !== null;
  }

  /**
   * Is this game an overdump (contains excess data)?
   */
  isOverdump(): boolean {
    return this.name.match(/\[o[0-9]*\]/) !== null;
  }

  /**
   * Is this game a pending dump (works, but isn't a proper dump)?
   */
  isPendingDump(): boolean {
    return this.name.match(/\[!p\]/) !== null;
  }

  /**
   * Is this game pirated (probably has copyright information removed)?
   */
  isPirated(): boolean {
    return this.name.match(/\(Pirate[a-z0-9. ]*\)/i) !== null
        || this.name.match(/\[p[0-9]*\]/) !== null;
  }

  /**
   * Is this game a prototype?
   */
  isPrototype(): boolean {
    return this.name.match(/\([^)]*Proto[a-z0-9. ]*\)/i) !== null
        || this.getCategory() === 'Preproduction';
  }

  /**
   * Is this game a sample?
   */
  isSample(): boolean {
    return this.name.match(/\([^)]*Sample[a-z0-9. ]*\)/i) !== null;
  }

  /**
   * Is this game a test?
   */
  isTest(): boolean {
    return this.name.match(/\(Test[a-z0-9. ]*\)/i) !== null;
  }

  /**
   * Is this game translated by the community?
   */
  isTranslated(): boolean {
    return this.name.match(/\[T[+-][^\]]+\]/) !== null;
  }

  /**
   * Is this game unlicensed (but was still physically produced and sold)?
   */
  isUnlicensed(): boolean {
    return this.name.match(/\(Unl[a-z0-9. ]*\)/i) !== null;
  }

  /**
   * Is this game an explicitly verified dump?
   */
  isVerified(): boolean {
    return this.name.match(/\[!\]/) !== null;
  }

  /**
   * Was this game altered to work on a Bung cartridge?
   * @see https://en.wikipedia.org/wiki/Bung_Enterprises
   */
  hasBungFix(): boolean {
    return this.name.match(/\(Bung\)|\[bf\]/i) !== null;
  }

  /**
   * Does this game have a community hack?
   */
  hasHack(): boolean {
    return this.name.match(/\(Hack\)/i) !== null
        || this.name.match(/\[h[a-zA-Z90-9+]*\]/) !== null;
  }

  /**
   * Does this game have a trainer?
   */
  hasTrainer(): boolean {
    return this.name.match(/\[t[0-9]*\]/) !== null;
  }

  /**
   * Is this game "retail"?
   */
  isRetail(): boolean {
    return !this.isAftermarket()
        && !this.isAlpha()
        && !this.isBad()
        && !this.isBeta()
        && !this.isDebug()
        && !this.isDemo()
        && !this.isFixed()
        && !this.isHomebrew()
        && !this.isMIA()
        && !this.isOverdump()
        && !this.isPendingDump()
        && !this.isPirated()
        && !this.isPrototype()
        && !this.isSample()
        && !this.isTest()
        && !this.isTranslated()
        && !this.hasBungFix()
        && !this.hasHack()
        && !this.hasTrainer();
  }

  getGameType(): GameType {
    // NOTE(cemmer): priority here matters!
    if (this.isBios()) {
      return GameType.BIOS;
    } if (this.isVerified()) {
      return GameType.RETAIL;
    }

    if (this.isAftermarket()) {
      return GameType.AFTERMARKET;
    } if (this.isAlpha()) {
      return GameType.ALPHA;
    } if (this.isBad()) {
      return GameType.BAD;
    } if (this.isBeta()) {
      return GameType.BETA;
    } if (this.isDebug()) {
      return GameType.DEBUG;
    } if (this.isDemo()) {
      return GameType.DEMO;
    } if (this.isDevice()) {
      return GameType.DEVICE;
    } if (this.isFixed()) {
      return GameType.FIXED;
    } if (this.hasHack()) {
      return GameType.HACKED;
    } if (this.isHomebrew()) {
      return GameType.HOMEBREW;
    } if (this.isOverdump()) {
      return GameType.OVERDUMP;
    } if (this.isPendingDump()) {
      return GameType.PENDING_DUMP;
    } if (this.isPirated()) {
      return GameType.PIRATED;
    } if (this.isPrototype()) {
      return GameType.PROTOTYPE;
    } if (this.isSample()) {
      return GameType.SAMPLE;
    } if (this.isTest()) {
      return GameType.TEST;
    } if (this.hasTrainer()) {
      return GameType.TRAINED;
    } if (this.isTranslated()) {
      return GameType.TRANSLATED;
    } if (this.isUnlicensed()) {
      return GameType.UNLICENSED;
    }

    return GameType.RETAIL;
  }

  /**
   * Is this game a parent (is not a clone)?
   */
  isParent(): boolean {
    return !this.isClone();
  }

  /**
   * Is this game a clone?
   */
  isClone(): boolean {
    return this.getParent() !== '';
  }

  getParent(): string {
    return this.cloneOf ?? '';
  }

  getBios(): string {
    return this.romOf ?? '';
  }

  // Internationalization

  getRegions(): string[] {
    const releaseRegions = this.getReleases()
      .map((release) => release.getRegion().toUpperCase());
    if (releaseRegions.length > 0) {
      return releaseRegions;
    }

    for (let i = 0; i < Internationalization.REGION_OPTIONS.length; i += 1) {
      const regionOption = Internationalization.REGION_OPTIONS[i];
      if (regionOption.long
        && this.getName().match(new RegExp(`\\(${regionOption.long}(,[ a-z]+)*\\)`, 'i'))
      ) {
        return [regionOption.region.toUpperCase()];
      }
      if (regionOption.regex && this.getName().match(regionOption.regex)) {
        return [regionOption.region.toUpperCase()];
      }
    }
    return [];
  }

  getLanguages(): string[] {
    const shortLanguages = this.getTwoLetterLanguagesFromName();
    if (shortLanguages.length > 0) {
      return shortLanguages;
    }

    const longLanguages = this.getThreeLetterLanguagesFromName();
    if (longLanguages.length > 0) {
      return longLanguages;
    }

    const releaseLanguages = this.getReleases()
      .map((release) => release.getLanguage())
      .filter(ArrayPoly.filterNotNullish);
    if (releaseLanguages.length > 0) {
      return releaseLanguages;
    }

    const regionLanguages = this.getLanguagesFromRegions();
    if (regionLanguages.length > 0) {
      return regionLanguages;
    }

    return [];
  }

  private getTwoLetterLanguagesFromName(): string[] {
    const twoMatches = this.getName().match(/\(([a-zA-Z]{2}([,+-][a-zA-Z]{2})*)\)/);
    if (twoMatches && twoMatches.length >= 2) {
      const twoMatchesParsed = twoMatches[1]
        .replace(/-[a-zA-Z]+$/, '') // chop off country
        .split(/[,+]/)
        .map((lang) => lang.toUpperCase())
        .filter((lang) => Internationalization.LANGUAGES.includes(lang)) // is known
        .reduce(ArrayPoly.reduceUnique(), []);
      if (twoMatchesParsed.length > 0) {
        return twoMatchesParsed;
      }
    }
    return [];
  }

  private getThreeLetterLanguagesFromName(): string[] {
    // Get language from long languages in the game name
    const threeMatches = this.getName().match(/\(([a-zA-Z]{3}(-[a-zA-Z]{3})*)\)/);
    if (threeMatches && threeMatches.length >= 2) {
      const threeMatchesParsed = threeMatches[1].split('-')
        .map((lang) => lang.toUpperCase())
        .map((lang) => Internationalization.LANGUAGE_OPTIONS
          .find((langOpt) => langOpt.long?.toUpperCase() === lang.toUpperCase())?.short)
        .filter(ArrayPoly.filterNotNullish)
        .filter((lang) => Internationalization.LANGUAGES.includes(lang)) // is known
        .reduce(ArrayPoly.reduceUnique(), []);
      if (threeMatchesParsed.length > 0) {
        return threeMatchesParsed;
      }
    }
    return [];
  }

  private getLanguagesFromRegions(): string[] {
    // Get languages from regions
    return this.getRegions()
      .map((region) => {
        for (let i = 0; i < Internationalization.REGION_OPTIONS.length; i += 1) {
          const regionOption = Internationalization.REGION_OPTIONS[i];
          if (regionOption.region === region) {
            return regionOption.language.toUpperCase();
          }
        }
        return undefined;
      })
      .filter(ArrayPoly.filterNotNullish);
  }

  // Immutable setters

  /**
   * Return a new copy of this {@link Game} with some different properties.
   */
  withProps(props: GameProps): Game {
    return new Game({ ...this, ...props });
  }

  // Pseudo Built-Ins

  /**
   * A string hash code to uniquely identify this {@link Game}.
   */
  hashCode(): string {
    let hashCode = this.getName();
    hashCode += `|${this.getRoms().map((rom) => rom.hashCode()).join(',')}`;
    return hashCode;
  }

  /**
   * Is this {@link Game} equal to another {@link Game}?
   */
  equals(other: Game): boolean {
    if (this === other) {
      return true;
    }
    return this.getName() === other.getName()
      && this.getReleases().length === other.getReleases().length
      && this.getRoms().length === other.getRoms().length;
  }
}
