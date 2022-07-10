import 'reflect-metadata';

import { Expose, Type } from 'class-transformer';

import Archive from './archive.js';
import BIOSSet from './biosSet.js';
import Disk from './disk.js';
import Release from './release.js';
import ROM from './rom.js';
import Sample from './sample.js';

export default class Game {
  private readonly name!: string;

  private readonly description!: string;

  @Expose({ name: 'sourcefile' })
  private readonly sourceFile?: string;

  @Expose({ name: 'isbios' })
  private readonly isBiosStr: 'yes' | 'no' = 'no';

  @Expose({ name: 'cloneof' })
  private readonly cloneOf?: string;

  @Expose({ name: 'romof' })
  private readonly romOf?: string;

  @Expose({ name: 'sampleof' })
  private readonly sampleOf?: string;

  private readonly board?: string;

  @Expose({ name: 'rebuildto' })
  private readonly rebuildTo?: string;

  private readonly year?: string;

  private readonly manufacturer?: string;

  @Type(() => Release)
  private readonly release!: Release | Release[];

  @Type(() => BIOSSet)
  private readonly biosSet!: BIOSSet | BIOSSet[];

  @Type(() => ROM)
  private readonly rom!: ROM | ROM[];

  @Type(() => Disk)
  private readonly disk!: Disk | Disk[];

  @Type(() => Sample)
  private readonly sample!: Sample | Sample[];

  @Type(() => Archive)
  private readonly archive!: Archive | Archive[];

  // Property getters

  getName(): string {
    return this.name;
  }

  isBios(): boolean {
    return this.isBiosStr === 'yes' || this.name.indexOf('[BIOS]') !== -1;
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

  getRomExtensions(): string[] {
    return this.getRoms().map((rom: ROM) => rom.getExtension());
  }

  isAftermarket(): boolean {
    return this.name.match(/\(Aftermarket[ a-zA-Z0-9.]*\)/i) !== null;
  }

  isBad(): boolean {
    return this.name.match(/\[b\]]/i) !== null;
  }

  isBeta(): boolean {
    return this.name.match(/\(Beta[ a-zA-Z0-9.]*\)/i) !== null;
  }

  isDemo(): boolean {
    return this.name.match(/\(Demo[ a-zA-Z0-9.]*\)/i) !== null;
  }

  isHomebrew(): boolean {
    return this.name.match(/\(Homebrew[ a-zA-Z0-9.]*\)/i) !== null;
  }

  isPrototype(): boolean {
    return this.name.match(/\(Proto[ a-zA-Z0-9.]*\)/i) !== null;
  }

  isSample(): boolean {
    return this.name.match(/\(Sample[ a-zA-Z0-9.]*\)/i) !== null;
  }

  isTest(): boolean {
    return this.name.match(/\(Test[ a-zA-Z0-9.]*\)/i) !== null;
  }

  isUnlicensed(): boolean {
    return this.name.match(/\(Unl[ a-zA-Z0-9.]*\)/i) !== null;
  }

  isRelease(): boolean {
    if (this.getReleases().length) {
      return true;
    }
    return !this.isBeta()
        && !this.isDemo()
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
