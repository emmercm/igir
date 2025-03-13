import 'reflect-metadata';

import { Expose, Transform, Type } from 'class-transformer';

import ArrayPoly from '../../polyfill/arrayPoly.js';
import Internationalization from '../internationalization.js';
import Disk from './disk.js';
import Release from './release.js';
import ROM from './rom.js';

enum GameType {
  AFTERMARKET = 'Aftermarket',
  ALPHA = 'Alpha',
  BAD = 'Bad',
  BETA = 'Beta',
  BIOS = 'BIOS',
  CRACKED = 'Cracked',
  DEBUG = 'Debug',
  DEMO = 'Demo',
  DEVICE = 'Device',
  FIXED = 'Fixed',
  HACKED = 'Hacked',
  HOMEBREW = 'Homebrew',
  OVERDUMP = 'Overdump',
  PENDING_DUMP = 'Pending Dump',
  PIRATED = 'Pirated',
  PROGRAM = 'Program',
  PROTOTYPE = 'Prototype',
  RETAIL = 'Retail',
  SAMPLE = 'Sample',
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
  // ********** OFFICIAL LOGIQX FIELDS **********
  // @see http://www.logiqx.com/Dats/datafile.dtd

  readonly name?: string;
  // readonly sourceFile?: string;
  readonly isBios?: 'yes' | 'no';
  readonly cloneOf?: string;
  readonly romOf?: string;
  // readonly sampleOf?: string;
  // readonly board?: string;
  // readonly rebuildTo?: string;
  // readonly year?: string;
  readonly release?: Release | Release[];
  // readonly biosset?: unknown;
  readonly rom?: ROM | ROM[];
  readonly disk?: Disk | Disk[];
  // readonly sample?: unknown;
  // readonly archive?: unknown;

  // ********** NO-INTRO FIELDS **********
  // @see https://datomatic.no-intro.org/stuff/schema_nointro_datfile_v3.xsd

  // @see http://wiki.redump.org/index.php?title=Redump_Search_Parameters#Category
  readonly category?: string | string[];
  readonly description?: string;
  readonly id?: string;
  readonly cloneOfId?: string;

  // ********** MAME FIELDS **********

  readonly isDevice?: 'yes' | 'no';
  // readonly mechanical?: 'yes' | 'no';
  // readonly runnable?: 'yes' | 'no';
  readonly manufacturer?: string;
  // readonly deviceRef: DeviceRef | DeviceRef[];
  // readonly chip?: unknown;
  // readonly display?: unknown;
  // readonly sound?: unknown;
  // readonly condition?: unknown;
  // readonly input?: unknown;
  // readonly dipswitch?: unknown;
  // readonly configuration?: unknown;
  // readonly port?: unknown;
  // readonly adjuster?: unknown;
  // readonly driver?: unknown;
  // readonly feature?: unknown;
  // readonly devices?: unknown;
  // readonly slot?: unknown;
  // readonly softwarelist?: unknown;
  // readonly ramoption?: 'yes' | 'no';

  // ********** LIBRETRO FIELDS **********
  // @see https://github.com/libretro/libretro-database/tree/master/metadat/genre

  readonly genre?: string;
}

/**
 * A logical "game" that contains zero or more {@link ROM}s, and has zero or more region
 * {@link Release}s.
 */
export default class Game implements GameProps {
  @Expose()
  readonly name: string;

  @Expose({ name: 'isbios' })
  readonly isBios: 'yes' | 'no' = 'no';

  @Expose({ name: 'cloneof' })
  readonly cloneOf?: string;

  @Expose({ name: 'romof' })
  readonly romOf?: string;

  @Expose()
  @Type(() => Release)
  @Transform(({ value }: { value: undefined | Release | Release[] }) => value ?? [])
  readonly release: Release | Release[];

  @Expose()
  @Type(() => ROM)
  @Transform(({ value }: { value: undefined | ROM | ROM[] }) => value ?? [])
  readonly rom: ROM | ROM[];

  @Expose()
  @Type(() => Disk)
  @Transform(({ value }: { value: undefined | Disk | Disk[] }) => value ?? [])
  readonly disk: Disk | Disk[];

  @Expose()
  @Transform(({ value }: { value: undefined | string | string[] }) => value ?? [])
  readonly category: string | string[];

  @Expose()
  readonly description: string;

  @Expose()
  readonly id?: string;

  @Expose({ name: 'cloneofid' })
  readonly cloneOfId?: string;

  @Expose({ name: 'isdevice' })
  readonly isDevice: 'yes' | 'no' = 'no';

  @Expose({ name: 'genre' })
  readonly genre?: string;

  @Expose()
  readonly manufacturer?: string;

  constructor(props?: GameProps) {
    this.name = props?.name ?? '';
    this.isBios = props?.isBios ?? this.isBios;
    this.cloneOf = props?.cloneOf;
    this.romOf = props?.romOf;
    this.release = props?.release ?? [];
    this.rom = props?.rom ?? [];
    this.disk = props?.disk ?? [];

    this.category = props?.category ?? [];
    this.description = props?.description ?? '';
    this.id = props?.id;
    this.cloneOfId = props?.cloneOfId;

    this.isDevice = props?.isDevice ?? this.isDevice;
    this.manufacturer = props?.manufacturer;

    this.genre = props?.genre;
  }

  /**
   * Create an XML object, to be used by the owning {@link DAT}.
   */
  toXmlDatObj(parentNames: Set<string>): object {
    return {
      $: {
        name: this.name,
        isbios: this.getIsBios() ? 'yes' : undefined,
        cloneof:
          this.cloneOf !== undefined && parentNames.has(this.cloneOf) ? this.cloneOf : undefined,
        romof: this.romOf && parentNames.has(this.romOf) ? this.romOf : undefined,
        id: this.id,
        cloneofid: this.cloneOfId,
        isdevice: this.getIsDevice() ? 'yes' : undefined,
      },
      description: {
        _: this.description,
      },
      category: this.getCategories().map((category) => ({ _: category })),
      ...(this.manufacturer !== undefined
        ? {
            manufacturer: {
              _: this.manufacturer,
            },
          }
        : {}),
      release: this.getReleases().map((release) => release.toXmlDatObj()),
      rom: this.getRoms().map((rom) => rom.toXmlDatObj()),
      disk: this.getDisks().map((disk) => disk.toXmlDatObj()),
    };
  }

  // Property getters

  getName(): string {
    return this.name;
  }

  getCategories(): string[] {
    if (Array.isArray(this.category)) {
      return this.category;
    }
    return [this.category];
  }

  /**
   * Is this game a collection of BIOS file(s).
   */
  getIsBios(): boolean {
    return this.isBios === 'yes' || this.name.match(/\[BIOS\]/i) !== null;
  }

  /**
   * Is this game a MAME "device"?
   */
  getIsDevice(): boolean {
    return this.isDevice === 'yes';
  }

  getGenre(): string | undefined {
    return this.genre;
  }

  getReleases(): Release[] {
    if (Array.isArray(this.release)) {
      return this.release;
    }
    return [this.release];
  }

  getRoms(): ROM[] {
    if (Array.isArray(this.rom)) {
      return this.rom;
    }
    return [this.rom];
  }

  getDisks(): Disk[] {
    if (Array.isArray(this.disk)) {
      return this.disk;
    }
    return [this.disk];
  }

  getCloneOf(): string | undefined {
    return this.cloneOf;
  }

  getRomOf(): string | undefined {
    return this.romOf;
  }

  getId(): string | undefined {
    return this.id;
  }

  getCloneOfId(): string | undefined {
    return this.cloneOfId;
  }

  // Computed getters

  getRevision(): number {
    // Numeric revision
    const revNumberMatches = this.getName().match(/\(Rev\s*([0-9.]+)\)/i);
    if (revNumberMatches && revNumberMatches?.length >= 2 && !Number.isNaN(revNumberMatches[1])) {
      return Number(revNumberMatches[1]);
    }

    // Letter revision
    const revLetterMatches = this.getName().match(/\(Rev\s*([A-Z])\)/i);
    if (revLetterMatches && revLetterMatches?.length >= 2) {
      return (
        (revLetterMatches[1].toUpperCase().codePointAt(0) as number) -
        ('A'.codePointAt(0) as number) +
        1
      );
    }

    // TOSEC versions
    const versionMatches = this.getName().match(/\Wv([0-9]+\.[0-9]+)\W/i);
    if (versionMatches && versionMatches?.length >= 2 && !Number.isNaN(versionMatches[1])) {
      return Number(versionMatches[1]);
    }

    // Ring code revision
    const ringCodeMatches = this.getName().match(/\(RE([0-9]+)\)/i);
    if (ringCodeMatches && ringCodeMatches?.length >= 2 && !Number.isNaN(ringCodeMatches[1])) {
      return Number(ringCodeMatches[1]);
    }

    return 0;
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
    return (
      this.name.includes('[c]') || // "known bad checksum but good dump"
      this.name.includes('[x]')
    ); // "thought to have a bad checksum"
  }

  /**
   * Is this game a beta pre-release?
   */
  isBeta(): boolean {
    return this.name.match(/\(Beta[a-z0-9. ]*\)/i) !== null;
  }

  /**
   * Is this game an unlicensed bootleg?
   */
  isBootleg(): boolean {
    return this.manufacturer?.toLowerCase().includes('bootleg') ?? false;
  }

  /**
   * Is this game a "cracked" release (has copy protection removed)?
   */
  isCracked(): boolean {
    return this.name.match(/\[cr([0-9]+| [^\]]+)?\]/) !== null;
  }

  /**
   * Does this game contain debug symbols?
   */
  isDebug(): boolean {
    return this.name.match(/\(Debug[a-z0-9. ]*\)/i) !== null;
  }

  public static readonly DEMO_REGEX = new RegExp(
    [
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
    ].join('|'),
    'i',
  );

  /**
   * Is this game a demo?
   */
  isDemo(): boolean {
    return (
      this.name.match(Game.DEMO_REGEX) !== null ||
      this.getCategories().some((category) => category.toLowerCase() === 'demos')
    );
  }

  /**
   * Is this game an enhancement chip? Primarily for SNES
   */
  isEnhancementChip(): boolean {
    return this.name.match(/\(Enhancement Chip\)/i) !== null;
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
    return this.name.includes('[!p]');
  }

  /**
   * Is this game pirated (probably has copyright information removed)?
   */
  isPirated(): boolean {
    return (
      this.name.match(/\(Pirate[a-z0-9. ]*\)/i) !== null || this.name.match(/\[p[0-9]*\]/) !== null
    );
  }

  /**
   * Is this game a "program" application?
   */
  isProgram(): boolean {
    return (
      this.name.match(/\([a-z0-9. ]*Program\)|(Check|Sample) Program/i) !== null ||
      this.getCategories().some((category) => category.toLowerCase() === 'applications')
    );
  }

  /**
   * Is this game a prototype?
   */
  isPrototype(): boolean {
    return (
      this.name.match(/\([^)]*Proto[a-z0-9. ]*\)/i) !== null ||
      this.getCategories().some((category) => category.toLowerCase() === 'preproduction')
    );
  }

  /**
   * Is this game a sample?
   */
  isSample(): boolean {
    return this.name.match(/\([^)]*Sample[a-z0-9. ]*\)/i) !== null;
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
    return this.name.includes('[!]');
  }

  /**
   * Was this game altered to work on a Bung cartridge?
   * @see https://en.wikipedia.org/wiki/Bung_Enterprises
   */
  hasBungFix(): boolean {
    return this.name.match(/\(Bung\)|\[bf\]/i) !== null;
  }

  /**
   * Does this game have a hack?
   */
  hasHack(): boolean {
    return (
      this.name.match(/\(Hack\)/i) !== null ||
      this.name.match(/\[h[a-zA-Z90-9+]*\]/) !== null ||
      (this.manufacturer?.toLowerCase().includes('hack') ?? false)
    );
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
    return (
      // Has their own dedicated filters
      !this.isDebug() &&
      !this.isDemo() &&
      !this.isBeta() &&
      !this.isSample() &&
      !this.isPrototype() &&
      !this.isProgram() &&
      !this.isAftermarket() &&
      !this.isHomebrew() &&
      !this.isBad() &&
      // Doesn't have their own dedicated filter
      !this.isAlpha() &&
      !this.isBootleg() &&
      !this.isCracked() &&
      !this.isEnhancementChip() &&
      !this.isFixed() &&
      !this.isMIA() &&
      !this.isOverdump() &&
      !this.isPendingDump() &&
      !this.isPirated() &&
      !this.isTranslated() &&
      !this.hasBungFix() &&
      !this.hasHack() &&
      !this.hasTrainer()
    );
  }

  getGameType(): GameType {
    // NOTE(cemmer): priority here matters!
    if (this.getIsBios()) {
      return GameType.BIOS;
    }
    if (this.isVerified()) {
      return GameType.RETAIL;
    }

    if (this.isAftermarket()) {
      return GameType.AFTERMARKET;
    }
    if (this.isAlpha()) {
      return GameType.ALPHA;
    }
    if (this.isBad()) {
      return GameType.BAD;
    }
    if (this.isBeta()) {
      return GameType.BETA;
    }
    if (this.isCracked()) {
      return GameType.CRACKED;
    }
    if (this.isDebug()) {
      return GameType.DEBUG;
    }
    if (this.isDemo()) {
      return GameType.DEMO;
    }
    if (this.getIsDevice()) {
      return GameType.DEVICE;
    }
    if (this.isFixed()) {
      return GameType.FIXED;
    }
    if (this.hasHack()) {
      return GameType.HACKED;
    }
    if (this.isHomebrew()) {
      return GameType.HOMEBREW;
    }
    if (this.isOverdump()) {
      return GameType.OVERDUMP;
    }
    if (this.isPendingDump()) {
      return GameType.PENDING_DUMP;
    }
    if (this.isPirated()) {
      return GameType.PIRATED;
    }
    if (this.isProgram()) {
      return GameType.PROGRAM;
    }
    if (this.isPrototype()) {
      return GameType.PROTOTYPE;
    }
    if (this.isSample()) {
      return GameType.SAMPLE;
    }
    if (this.hasTrainer()) {
      return GameType.TRAINED;
    }
    if (this.isTranslated()) {
      return GameType.TRANSLATED;
    }
    if (this.isUnlicensed()) {
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
    return this.getCloneOf() !== undefined || this.getCloneOfId() !== undefined;
  }

  // Internationalization

  getRegions(): string[] {
    const releaseRegions = this.getReleases().map((release) => release.getRegion().toUpperCase());
    if (releaseRegions.length > 0) {
      return releaseRegions;
    }

    for (let i = 0; i < Internationalization.REGION_OPTIONS.length; i += 1) {
      const regionOption = Internationalization.REGION_OPTIONS[i];
      if (
        regionOption.long &&
        this.getName().match(new RegExp(`\\(${regionOption.long}(,[ a-z]+)*\\)`, 'i'))
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
      .filter((language) => language !== undefined);
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
      const threeMatchesParsed = threeMatches[1]
        .split('-')
        .map((lang) => lang.toUpperCase())
        .map(
          (lang) =>
            Internationalization.LANGUAGE_OPTIONS.find(
              (langOpt) => langOpt.long?.toUpperCase() === lang.toUpperCase(),
            )?.short,
        )
        .filter((lang) => lang !== undefined)
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
      .filter((language) => language !== undefined);
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
    hashCode += `|${this.getRoms()
      .map((rom) => rom.hashCode())
      .sort()
      .join(',')}`;
    return hashCode;
  }

  /**
   * Is this {@link Game} equal to another {@link Game}?
   */
  equals(other: Game): boolean {
    if (this === other) {
      return true;
    }
    return (
      this.getName() === other.getName() &&
      this.getReleases().length === other.getReleases().length &&
      this.getRoms().length === other.getRoms().length
    );
  }
}
