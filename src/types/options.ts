import 'reflect-metadata';

import { Expose, plainToInstance } from 'class-transformer';
import fg from 'fast-glob';
import { isNotJunk } from 'junk';
import fsPromises from 'node:fs/promises';
import path from 'path';

import DAT from './logiqx/dat.js';

export default class Options {
  @Expose({ name: 'dat' })
  private datFiles: string[] = [];

  @Expose({ name: 'input' })
  private inputFiles: string[] = [];

  private readonly output!: string;

  private readonly dirMirror!: boolean;

  private readonly dirDatname!: boolean;

  private readonly dirLetter!: boolean;

  @Expose({ name: '1g1r' })
  private readonly oneGameOneRom = false;

  private readonly zip!: boolean;

  private readonly move!: boolean;

  private readonly overwrite!: boolean;

  private readonly clean!: boolean;

  private readonly preferGood!: boolean;

  private readonly languagePriority: string[] = [];

  private readonly regionPriority: string[] = [];

  private readonly preferRevisionsNewer!: boolean;

  private readonly preferRevisionsOlder!: boolean;

  private readonly preferReleases!: boolean;

  private readonly preferParents!: boolean;

  private readonly languageFilter: string[] = [];

  private readonly regionFilter: string[] = [];

  private readonly onlyBios!: boolean;

  private readonly noBios!: boolean;

  private readonly noUnlicensed!: boolean;

  private readonly noDemo!: boolean;

  private readonly noBeta!: boolean;

  private readonly noSample!: boolean;

  private readonly noPrototype!: boolean;

  private readonly noTest!: boolean;

  private readonly noAftermarket!: boolean;

  private readonly noHomebrew!: boolean;

  private readonly noBad!: boolean;

  static async fromObject(obj: object) {
    const options = plainToInstance(Options, obj, {
      enableImplicitConversion: true,
    });
    await options.scanFileInputs();
    options.validate();
    return options;
  }

  private async scanFileInputs() {
    this.datFiles = await Options.scanPath(this.datFiles);
    this.inputFiles = await Options.scanPath(this.inputFiles);
  }

  private static async scanPath(inputPaths: string[]): Promise<string[]> {
    // Convert directory paths to glob patterns
    const globPatterns = await Promise.all(inputPaths.map(async (inputPath) => {
      try {
        // If the file exists and is a directory, convert it to a glob pattern
        await fsPromises.access(inputPath); // throw if file doesn't exist
        if ((await fsPromises.lstat(inputPath)).isDirectory()) {
          return `${inputPath}/**`;
        }
      } catch (e) {
        // eslint-disable-line no-empty
      }
      // Otherwise, return the original path
      return inputPath;
    }));

    // Process any glob patterns
    const globbedPaths = (await Promise.all(globPatterns.map(async (inputPath) => {
      try {
        // If the file exists, don't process it as a glob pattern
        await fsPromises.access(inputPath); // throw if file doesn't exist
        return [inputPath];
      } catch (e) {
        // Otherwise, process it as a glob pattern
        return await fg(inputPath);
      }
    }))).flatMap((paths) => paths);

    // Filter to non-directories
    return Promise.all(
      globbedPaths
        .filter(async (inputPath) => !(await fsPromises.lstat(inputPath)).isDirectory())
        .filter((inputPath) => isNotJunk(inputPath)),
    );
  }

  /* eslint-disable class-methods-use-this */
  private validate() {
    // TODO(cemmer): validate fields on the class
  }

  getDatFiles(): string[] {
    return this.datFiles;
  }

  getInputFiles(): string[] {
    return this.inputFiles;
  }

  getOutput(dat?: DAT, inputRomPath?: string, romName?: string): string {
    let { output } = this;
    if (this.getDirMirror() && inputRomPath) {
      const mirroredDir = path.dirname(inputRomPath)
        .replace(/[\\/]/g, path.sep)
        .split(path.sep)
        .splice(1)
        .join(path.sep);
      output = path.join(output, mirroredDir);
    }
    if (dat && this.getDirDatName()) {
      output = path.join(output, dat.getName());
    }
    if (this.getDirLetter() && romName) {
      let letter = romName[0].toUpperCase();
      if (letter.match(/[^A-Z]/)) {
        letter = '0-9';
      }
      output = path.join(output, letter);
    }
    if (romName) {
      output = path.join(output, romName);
    }
    return output;
  }

  getDirMirror(): boolean {
    return this.dirMirror;
  }

  getDirDatName(): boolean {
    return this.dirDatname;
  }

  getDirLetter(): boolean {
    return this.dirLetter;
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

  getOverwrite(): boolean {
    return this.overwrite;
  }

  getClean(): boolean {
    return this.clean;
  }

  getPreferGood(): boolean {
    return this.preferGood;
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

  getPreferRevisionsNewer(): boolean {
    return this.preferRevisionsNewer;
  }

  getPreferRevisionsOlder(): boolean {
    return this.preferRevisionsOlder;
  }

  getPreferReleases(): boolean {
    return this.preferReleases;
  }

  getPreferParents(): boolean {
    return this.preferParents;
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

  getNoBad(): boolean {
    return this.noBad;
  }
}
