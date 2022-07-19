import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import fg from 'fast-glob';
import fs from 'fs';
import { isNotJunk } from 'junk';
import micromatch from 'micromatch';
import fsPromises from 'node:fs/promises';
import os from 'os';
import path from 'path';

import DAT from './logiqx/dat.js';

export default class Options {
  private readonly dat: string[] = [];

  private readonly input: string[] = [];

  private readonly inputExclude: string[] = [];

  private readonly output!: string;

  private readonly dirMirror!: boolean;

  private readonly dirDatname!: boolean;

  private readonly dirLetter!: boolean;

  private readonly single = false;

  private readonly zip!: boolean;

  private readonly zipExclude!: string;

  private readonly move!: boolean;

  private readonly overwrite!: boolean;

  private readonly test!: boolean;

  private readonly clean!: boolean;

  private readonly dryRun!: boolean;

  private readonly preferGood!: boolean;

  private readonly preferLanguage: string[] = [];

  private readonly preferRegion: string[] = [];

  private readonly preferRevisionsNewer!: boolean;

  private readonly preferRevisionsOlder!: boolean;

  private readonly preferRetail!: boolean;

  private readonly preferParent!: boolean;

  private readonly languageFilter: string[] = [];

  private readonly regionFilter: string[] = [];

  private readonly onlyBios!: boolean;

  private readonly noBios!: boolean;

  private readonly noUnlicensed!: boolean;

  private readonly onlyRetail!: boolean;

  private readonly noDemo!: boolean;

  private readonly noBeta!: boolean;

  private readonly noSample!: boolean;

  private readonly noPrototype!: boolean;

  private readonly noTestRoms!: boolean;

  private readonly noAftermarket!: boolean;

  private readonly noHomebrew!: boolean;

  private readonly noBad!: boolean;

  private tempDir!: string;

  static fromObject(obj: object) {
    return plainToInstance(Options, obj, {
      enableImplicitConversion: true,
    })
      .createTempDir()
      .validate();
  }

  private createTempDir(): Options {
    this.tempDir = fs.mkdtempSync(os.tmpdir());
    process.on('SIGINT', () => {
      fs.rmSync(this.tempDir, { force: true, recursive: true });
    });
    return this;
  }

  private validate(): Options {
    // TODO(cemmer): validate fields on the class
    return this;
  }

  async scanDatFiles(): Promise<string[]> {
    return Options.scanPath(this.dat);
  }

  private async scanInputFiles(): Promise<string[]> {
    return Options.scanPath(this.input);
  }

  private async scanInputExcludeFiles(): Promise<string[]> {
    return Options.scanPath(this.inputExclude);
  }

  async scanInputFilesWithoutExclusions(): Promise<string[]> {
    const inputFiles = await this.scanInputFiles();
    const inputExcludeFiles = await this.scanInputExcludeFiles();
    return inputFiles
      .filter((inputPath) => inputExcludeFiles.indexOf(inputPath) === -1);
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

    // TODO(cemmer): if the ROM has multiple files (e.g. cue/bin) then put it in a folder

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

  getSingle(): boolean {
    return this.single;
  }

  private getZip(): boolean {
    return this.zip;
  }

  private getZipExclude(): string {
    return this.zipExclude;
  }

  shouldZip(filePath: string) {
    return this.getZip()
        && (!this.getZipExclude() || !micromatch.isMatch(filePath, this.getZipExclude()));
  }

  getMove(): boolean {
    return this.move;
  }

  getOverwrite(): boolean {
    return this.overwrite;
  }

  getTest(): boolean {
    return this.test;
  }

  getClean(): boolean {
    return this.clean;
  }

  getDryRun(): boolean {
    return this.dryRun;
  }

  getPreferGood(): boolean {
    return this.preferGood;
  }

  getPreferLanguages(): string[] {
    return this.preferLanguage.map((lang) => lang.toUpperCase());
  }

  getPreferRegions(): string[] {
    return this.preferRegion.map((region) => region.toUpperCase());
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

  getPreferRetail(): boolean {
    return this.preferRetail;
  }

  getPreferParent(): boolean {
    return this.preferParent;
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

  getOnlyRetail(): boolean {
    return this.onlyRetail;
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

  getNoTestRoms(): boolean {
    return this.noTestRoms;
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

  getTempDir(): string {
    return this.tempDir;
  }
}
