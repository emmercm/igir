import 'reflect-metadata';

import { Expose, Type } from 'class-transformer';

import Archive from './archive.js';
import BIOSSet from './biosSet.js';
import Disk from './disk.js';
import Release from './release.js';
import ROM from './rom.js';
import Sample from './sample.js';

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
  readonly name!: string;

  @Expose({ name: 'description' })
  readonly description!: string;

  @Expose({ name: 'sourcefile' })
  readonly sourceFile?: string;

  @Expose({ name: 'isbios' })
  readonly bios: 'yes' | 'no' = 'no';

  @Expose({ name: 'cloneof' })
  readonly cloneOf?: string;

  @Expose({ name: 'romof' })
  readonly romOf?: string;

  @Expose({ name: 'sampleof' })
  readonly sampleOf?: string;

  @Expose({ name: 'board' })
  readonly board?: string;

  @Expose({ name: 'rebuildto' })
  readonly rebuildTo?: string;

  @Expose({ name: 'year' })
  readonly year?: string;

  @Expose({ name: 'manufacturer' })
  readonly manufacturer?: string;

  @Type(() => Release)
  readonly release!: Release | Release[];

  @Type(() => BIOSSet)
  readonly biosSet!: BIOSSet | BIOSSet[];

  @Type(() => ROM)
  readonly rom!: ROM | ROM[];

  @Type(() => Disk)
  readonly disk!: Disk | Disk[];

  @Type(() => Sample)
  readonly sample!: Sample | Sample[];

  @Type(() => Archive)
  readonly archive!: Archive | Archive[];

  constructor(options?: GameProps) {
    if (options) {
      this.name = options.name || '';
      this.description = options.description || '';
      this.sourceFile = options.sourceFile;
      this.bios = options.bios || this.bios;
      this.cloneOf = options.cloneOf;
      this.romOf = options.romOf;
      this.sampleOf = options.sampleOf;
      this.board = options.board;
      this.rebuildTo = options.rebuildTo;
      this.year = options.year;
      this.manufacturer = options.manufacturer;
      this.release = options.release || [];
      this.biosSet = options.biosSet || [];
      this.rom = options.rom || [];
      this.disk = options.disk || [];
      this.sample = options.sample || [];
      this.archive = options.archive || [];
    }
  }

  // Property getters

  getName(): string {
    return this.name;
  }

  isBios(): boolean {
    return this.bios === 'yes' || this.name.indexOf('[BIOS]') !== -1;
  }

  getReleases(): Release[] {
    if (this.release instanceof Array) {
      return this.release;
    } if (this.release) {
      return [this.release];
    }
    return [];
  }

  getRoms(): ROM[] {
    if (this.rom instanceof Array) {
      return this.rom;
    } if (this.rom) {
      return [this.rom];
    }
    return [];
  }

  // Computed getters

  isAftermarket(): boolean {
    return this.name.match(/\(Aftermarket[a-zA-Z0-9. ]*\)/i) !== null;
  }

  isBad(): boolean {
    return this.name.match(/\[b\]/i) !== null;
  }

  isBeta(): boolean {
    return this.name.match(/\(Beta[a-zA-Z0-9. ]*\)/i) !== null;
  }

  isDemo(): boolean {
    return this.name.match(/\(Demo[a-zA-Z0-9. ]*\)/i) !== null;
  }

  isHomebrew(): boolean {
    return this.name.match(/\(Homebrew[a-zA-Z0-9. ]*\)/i) !== null;
  }

  isPrototype(): boolean {
    return this.name.match(/\(Proto[a-zA-Z0-9. ]*\)/i) !== null;
  }

  isSample(): boolean {
    return this.name.match(/\(Sample[a-zA-Z0-9. ]*\)/i) !== null;
  }

  isTest(): boolean {
    return this.name.match(/\(Test[a-zA-Z0-9. ]*\)/i) !== null;
  }

  isUnlicensed(): boolean {
    return this.name.match(/\(Unl[a-zA-Z0-9. ]*\)/i) !== null;
  }

  isRetail(): boolean {
    return !this.isAftermarket()
        && !this.isBad()
        && !this.isBeta()
        && !this.isDemo()
        && !this.isHomebrew()
        && !this.isPrototype()
        && !this.isSample()
        && !this.isTest();
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
}
