import 'reflect-metadata';

import { Expose, plainToInstance } from 'class-transformer';
import fg from 'fast-glob';
import fs from 'fs';
import path from 'path';

import DAT from './dat/dat.js';

export default class Options {
  @Expose({ name: 'dat' })
  private datFiles!: string[];

  @Expose({ name: 'input' })
  private inputFiles!: string[];

  private readonly output!: string;

  @Expose({ name: '1g1r' })
  private readonly oneGameOneRom = false;

  private readonly zip = false;

  private readonly move = false;

  private readonly clean = false;

  private readonly languagePriority: string[] = [];

  private readonly regionPriority: string[] = [];

  private readonly languageFilter: string[] = [];

  private readonly regionFilter: string[] = [];

  private readonly onlyBios = false;

  private readonly noBios = false;

  private readonly noUnlicensed = false;

  private readonly noDemo = false;

  private readonly noBeta = false;

  private readonly noSample = false;

  private readonly noPrototype = false;

  private readonly noTest = false;

  private readonly noAftermarket = false;

  private readonly noHomebrew = false;

  static fromObject(obj: object) {
    return plainToInstance(Options, obj, {
      enableImplicitConversion: true,
    })
      .scanFileInputs()
      .validate();
  }

  private scanFileInputs(): Options {
    this.datFiles = Options.scanPath(this.datFiles);
    this.inputFiles = Options.scanPath(this.inputFiles);
    return this;
  }

  private static scanPath(inputPaths: string[]): string[] {
    return inputPaths
      .flatMap((inputPath) => {
        // Change directory to glob pattern
        if (!fs.existsSync(inputPath) || !fs.lstatSync(inputPath).isDirectory()) {
          return inputPath;
        }
        return `${inputPath}/**`;
      })
      .flatMap((inputPath) => {
        // Apply glob pattern
        if (fs.existsSync(inputPath)) {
          return inputPath;
        }
        return fg.sync(inputPath);
      })
      .filter((inputPath) => !fs.lstatSync(inputPath).isDirectory());
  }

  private validate(): Options {
    // TODO(cemmer): validate fields on the class
    return this;
  }

  getDatFiles(): string[] {
    return this.datFiles;
  }

  getInputFiles(): string[] {
    return this.inputFiles;
  }

  getOutput(dat: DAT, basename?: string): string {
    let output = path.join(this.output, dat.getName());
    // TODO(cemmer): sort by first letter
    if (basename) {
      output = path.join(output, basename);
    }
    return output;
  }

  get1G1R(): boolean {
    return this.oneGameOneRom;
  }

  getZip(): boolean {
    return this.zip;
  }

  getMove(): boolean {
    return this.move;
  }

  getClean(): boolean {
    return this.clean;
  }

  getLanguagePriority(): string[] {
    return this.languagePriority.map((lang) => lang.toUpperCase());
  }

  getRegionPriority(): string[] {
    return this.regionPriority.map((region) => region.toUpperCase());
  }

  getLanguageFilter(): string[] {
    return this.languageFilter.map((lang) => lang.toUpperCase());
  }

  getRegionFilter(): string[] {
    return this.regionFilter.map((region) => region.toUpperCase());
  }

  getOnlyBios(): boolean {
    return this.onlyBios;
  }

  getNoBios(): boolean {
    return this.noBios;
  }

  getNoUnlicensed(): boolean {
    return this.noUnlicensed;
  }

  getNoDemo(): boolean {
    return this.noDemo;
  }

  getNoBeta(): boolean {
    return this.noBeta;
  }

  getNoSample(): boolean {
    return this.noSample;
  }

  getNoPrototype(): boolean {
    return this.noPrototype;
  }

  getNoTest(): boolean {
    return this.noTest;
  }

  getNoAftermarket(): boolean {
    return this.noAftermarket;
  }

  getNoHomebrew(): boolean {
    return this.noHomebrew;
  }
}
