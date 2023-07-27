import 'reflect-metadata';

import { Expose, Type } from 'class-transformer';

import Archive from './archive.js';
import BIOSSet from './biosSet.js';
import Disk from './disk.js';
import Release from './release.js';
import ROM from './rom.js';
import Sample from './sample.js';

enum GameType {
  AFTERMARKET = 'Aftermarket',
  ALPHA = 'Alpha',
  BAD = 'Bad',
  BETA = 'Beta',
  BIOS = 'BIOS',
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
 *
 * @see http://www.logiqx.com/DatFAQs/CMPro.php
 */
export interface GameProps {
  readonly name?: string,
  readonly description?: string,
  readonly sourceFile?: string,
  readonly bios?: 'yes' | 'no',
  readonly device?: 'yes' | 'no',
  readonly cloneOf?: string,
  readonly romOf?: string,
  readonly sampleOf?: string,
  readonly board?: string,
  readonly rebuildTo?: string,
  readonly year?: string,
  readonly manufacturer?: string,
  readonly release?: Release | Release[],
  readonly biosSet?: BIOSSet | BIOSSet[],
  readonly rom?: ROM | ROM[],
  readonly disk?: Disk | Disk[],
  readonly sample?: Sample | Sample[],
  readonly archive?: Archive | Archive[],
}

export default class Game implements GameProps {
  @Expose({ name: 'name' })
  readonly name: string;

  @Expose({ name: 'description' })
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

  @Expose()
  @Type(() => Release)
  readonly release: Release | Release[];

  @Expose()
  @Type(() => ROM)
  readonly rom: ROM | ROM[];

  constructor(options?: GameProps) {
    this.name = options?.name || '';
    this.description = options?.description || '';
    this.bios = options?.bios || this.bios;
    this.device = options?.device || this.device;
    this.cloneOf = options?.cloneOf;
    this.romOf = options?.romOf;
    this.sampleOf = options?.sampleOf;
    this.release = options?.release || [];
    this.rom = options?.rom || [];
  }

  toXmlDatObj(): object {
    return {
      $: {
        name: this.name,
        // NOTE(cemmer): explicitly not including `cloneof`
      },
      description: {
        _: this.description,
      },
      release: this.getReleases().map((release) => release.toXmlDatObj()),
      rom: this.getRoms().map((rom) => rom.toXmlDatObj()),
    };
  }

  // Property getters

  getName(): string {
    return this.name;
  }

  isBios(): boolean {
    return this.bios === 'yes' || this.name.match(/\[BIOS\]/i) !== null;
  }

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

  isAftermarket(): boolean {
    return this.name.match(/\(Aftermarket[a-z0-9. ]*\)/i) !== null;
  }

  isAlpha(): boolean {
    return this.name.match(/\(Alpha[a-z0-9. ]*\)/i) !== null;
  }

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

  isBeta(): boolean {
    return this.name.match(/\(Beta[a-z0-9. ]*\)/i) !== null;
  }

  isDemo(): boolean {
    return this.name.match(/\(Demo[a-z0-9. ]*\)/i) !== null;
  }

  isFixed(): boolean {
    return this.name.match(/\[f[0-9]*\]/) !== null;
  }

  isHomebrew(): boolean {
    return this.name.match(/\(Homebrew[a-z0-9. ]*\)/i) !== null;
  }

  isMIA(): boolean {
    return this.name.match(/\[MIA\]/i) !== null;
  }

  isOverdump(): boolean {
    return this.name.match(/\[o[0-9]*\]/) !== null;
  }

  isPendingDump(): boolean {
    return this.name.match(/\[!p\]/) !== null;
  }

  isPirated(): boolean {
    return this.name.match(/\(Pirate[a-z0-9. ]*\)/i) !== null
        || this.name.match(/\[p[0-9]*\]/) !== null;
  }

  isPrototype(): boolean {
    return this.name.match(/\(Proto[a-z0-9. ]*\)/i) !== null;
  }

  isSample(): boolean {
    return this.name.match(/\(Sample[a-z0-9. ]*\)/i) !== null;
  }

  isTest(): boolean {
    return this.name.match(/\(Test[a-z0-9. ]*\)/i) !== null;
  }

  isTranslated(): boolean {
    return this.name.match(/\[T[+-][^\]]+\]/) !== null;
  }

  isUnlicensed(): boolean {
    return this.name.match(/\(Unl[a-z0-9. ]*\)/i) !== null;
  }

  isVerified(): boolean {
    if (this.name.match(/\[!\]/) !== null) {
      return true;
    }
    // Assume verification if there are releases
    return this.getReleases().length > 0;
  }

  hasBungFix(): boolean {
    return this.name.match(/\(Bung\)|\[bf\]/i) !== null;
  }

  hasHack(): boolean {
    return this.name.match(/\(Hack\)/i) !== null
        || this.name.match(/\[h[a-zA-Z90-9+]*\]/) !== null;
  }

  hasTrainer(): boolean {
    return this.name.match(/\[t[0-9]*\]/) !== null;
  }

  isRetail(): boolean {
    return !this.isAftermarket()
        && !this.isAlpha()
        && !this.isBad()
        && !this.isBeta()
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

  isParent(): boolean {
    return !this.isClone();
  }

  isClone(): boolean {
    return this.getParent() !== '';
  }

  getParent(): string {
    return this.cloneOf || this.romOf || this.sampleOf || '';
  }

  equals(other: Game): boolean {
    if (this === other) {
      return true;
    }
    return this.getName() === other.getName()
      && this.getReleases().length === other.getReleases().length
      && this.getRoms().length === other.getRoms().length;
  }
}
