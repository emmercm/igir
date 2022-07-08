import { Expose, Type } from 'class-transformer';

import Archive from './archive';
import BIOSSet from './biosSet';
import Disk from './disk';
import Release from './release';
import ROM from './rom';
import Sample from './sample';

export default class Game {
  private name!: string;

  private description!: string;

  @Expose({ name: 'sourcefile' })
  private sourceFile?: string;

  @Expose({ name: 'isbios' })
  private isBiosStr: 'yes' | 'no' = 'no';

  @Expose({ name: 'cloneof' })
  private cloneOf?: string;

  @Expose({ name: 'romof' })
  private romOf?: string;

  @Expose({ name: 'sampleof' })
  private sampleOf?: string;

  private board?: string;

  @Expose({ name: 'rebuildto' })
  private rebuildTo?: string;

  private year?: string;

  private manufacturer?: string;

  @Type(() => Release)
  private release!: Release | Release[];

  @Type(() => BIOSSet)
  private biosSet!: BIOSSet | BIOSSet[];

  @Type(() => ROM)
  private rom!: ROM | ROM[];

  @Type(() => Disk)
  private disk!: Disk | Disk[];

  @Type(() => Sample)
  private sample!: Sample | Sample[];

  @Type(() => Archive)
  private archive!: Archive | Archive[];

  getName(): string {
    return this.name;
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

  getRomExtensions(): string[] {
    return this.getRoms().map((rom: ROM) => rom.getExtension());
  }

  isAftermarket(): boolean {
    return this.name.match(/\(Aftermarket[ a-zA-Z0-9.]*\)/i) !== null;
  }

  isBad(): boolean {
    return this.name.match(/\[b\]]/i) !== null;
  }

  isBios(): boolean {
    return this.isBiosStr === 'yes' || this.name.indexOf('[BIOS]') !== -1;
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

  isTest(): boolean {
    return this.name.match(/\(Test[ a-zA-Z0-9.]*\)/i) !== null;
  }

  isUnlicensed(): boolean {
    return this.name.match(/\(Unl[ a-zA-Z0-9.]*\)/i) !== null;
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
