import 'reflect-metadata';

import { Expose, plainToInstance } from 'class-transformer';
import fg from 'fast-glob';
import fs, { promises as fsPromises } from 'fs';
import { isNotJunk } from 'junk';
import micromatch from 'micromatch';
import os from 'os';
import path from 'path';

import DAT from './logiqx/dat.js';

export interface OptionsProps {
  readonly commands?: string[],
  readonly dat?: string[],
  readonly input?: string[],
  readonly inputExclude?: string[],
  readonly output?: string,
  readonly dirMirror?: boolean,
  readonly dirDatName?: boolean,
  readonly dirLetter?: boolean,
  readonly single?: boolean,
  readonly zipExclude?: string,
  readonly overwrite?: boolean,
  readonly preferGood?: boolean,
  readonly preferLanguage?: string[],
  readonly preferRegion?: string[],
  readonly preferRevisionNewer?: boolean,
  readonly preferRevisionOlder?: boolean,
  readonly preferRetail?: boolean,
  readonly preferParent?: boolean,
  readonly languageFilter?: string[],
  readonly regionFilter?: string[],
  readonly onlyBios?: boolean,
  readonly noBios?: boolean,
  readonly noUnlicensed?: boolean,
  readonly onlyRetail?: boolean,
  readonly noDemo?: boolean,
  readonly noBeta?: boolean,
  readonly noSample?: boolean,
  readonly noPrototype?: boolean,
  readonly noTestRoms?: boolean,
  readonly noAftermarket?: boolean,
  readonly noHomebrew?: boolean,
  readonly noBad?: boolean,
  readonly help?: boolean,
}

export default class Options implements OptionsProps {
  @Expose({ name: '_' })
  readonly commands: string[] = [];

  readonly dat: string[] = [];

  readonly input: string[] = [];

  readonly inputExclude: string[] = [];

  readonly output!: string;

  readonly dirMirror!: boolean;

  readonly dirDatName!: boolean;

  readonly dirLetter!: boolean;

  readonly single = false;

  readonly zipExclude!: string;

  readonly overwrite!: boolean;

  readonly preferGood!: boolean;

  readonly preferLanguage: string[] = [];

  readonly preferRegion: string[] = [];

  readonly preferRevisionNewer!: boolean;

  readonly preferRevisionOlder!: boolean;

  readonly preferRetail!: boolean;

  readonly preferParent!: boolean;

  readonly languageFilter: string[] = [];

  readonly regionFilter: string[] = [];

  readonly onlyBios!: boolean;

  readonly noBios!: boolean;

  readonly noUnlicensed!: boolean;

  readonly onlyRetail!: boolean;

  readonly noDemo!: boolean;

  readonly noBeta!: boolean;

  readonly noSample!: boolean;

  readonly noPrototype!: boolean;

  readonly noTestRoms!: boolean;

  readonly noAftermarket!: boolean;

  readonly noHomebrew!: boolean;

  readonly noBad!: boolean;

  readonly help!: boolean;

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

  // Commands

  private getCommands() {
    return this.commands.map((c) => c.toLowerCase());
  }

  shouldWrite() {
    return this.shouldCopy() || this.shouldMove();
  }

  shouldCopy() {
    return this.getCommands().indexOf('copy') !== -1;
  }

  shouldMove() {
    return this.getCommands().indexOf('move') !== -1;
  }

  shouldZip(filePath: string) {
    return this.getCommands().indexOf('zip') !== -1
      && (!this.getZipExclude() || !micromatch.isMatch(filePath, this.getZipExclude()));
  }

  shouldClean() {
    return this.getCommands().indexOf('clean') !== -1;
  }

  shouldTest() {
    return this.getCommands().indexOf('test') !== -1;
  }

  shouldReport() {
    return this.getCommands().indexOf('report') !== -1;
  }

  // Options

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
    const globbedPaths = (await Promise.all(
      globPatterns
        .filter((inputPath) => inputPath)
        .map(async (inputPath) => {
          try {
            // If the file exists, don't process it as a glob pattern
            await fsPromises.access(inputPath); // throw if file doesn't exist
            return [inputPath];
          } catch (e) {
            // Otherwise, process it as a glob pattern
            const paths = await fg(inputPath);
            if (!paths || !paths.length) {
              throw new Error(`Path doesn't exist: ${inputPath}`);
            }
            return paths;
          }
        }),
    )).flatMap((paths) => paths);

    // Filter to files
    const isFiles = await Promise.all(
      globbedPaths.map(async (inputPath) => (await fsPromises.lstat(inputPath)).isFile()),
    );
    const globbedFiles = globbedPaths
      .filter((inputPath, idx) => isFiles[idx])
      .filter((inputPath) => isNotJunk(inputPath));

    // Remove duplicates
    return globbedFiles
      .filter((inputPath, idx, arr) => arr.indexOf(inputPath) === idx);
  }

  getOutput(dat?: DAT, inputRomPath?: string, romName?: string): string {
    let output = this.shouldWrite() ? this.getTempDir() : this.output;
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
        letter = '#';
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
    return this.dirDatName;
  }

  getDirLetter(): boolean {
    return this.dirLetter;
  }

  getSingle(): boolean {
    return this.single;
  }

  private getZipExclude(): string {
    return this.zipExclude;
  }

  getOverwrite(): boolean {
    return this.overwrite;
  }

  getPreferGood(): boolean {
    return this.preferGood;
  }

  getPreferLanguages(): string[] {
    return this.preferLanguage
      .map((lang) => lang.toUpperCase())
      .filter((language, idx, languages) => languages.indexOf(language) === idx);
  }

  getPreferRegions(): string[] {
    return this.preferRegion
      .map((region) => region.toUpperCase())
      .filter((region, idx, regions) => regions.indexOf(region) === idx);
  }

  getLanguageFilter(): string[] {
    return this.languageFilter
      .map((lang) => lang.toUpperCase())
      .filter((language, idx, languages) => languages.indexOf(language) === idx);
  }

  getPreferRevisionNewer(): boolean {
    return this.preferRevisionNewer;
  }

  getPreferRevisionOlder(): boolean {
    return this.preferRevisionOlder;
  }

  getPreferRetail(): boolean {
    return this.preferRetail;
  }

  getPreferParent(): boolean {
    return this.preferParent;
  }

  getRegionFilter(): string[] {
    return this.regionFilter
      .map((region) => region.toUpperCase())
      .filter((region, idx, regions) => regions.indexOf(region) === idx);
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

  getHelp(): boolean {
    return this.help;
  }

  getTempDir(): string {
    return this.tempDir;
  }
}
