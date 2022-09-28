import 'reflect-metadata';

import { Expose, instanceToPlain, plainToInstance } from 'class-transformer';
import fg from 'fast-glob';
import { promises as fsPromises } from 'fs';
import { isNotJunk } from 'junk';
import micromatch from 'micromatch';
import moment from 'moment';
import os from 'os';
import path from 'path';

import LogLevel from '../console/logLevel.js';
import Constants from '../constants.js';
import fsPoly from '../polyfill/fsPoly.js';
import DAT from './logiqx/dat.js';

export interface OptionsProps {
  readonly commands?: string[],
  readonly dat?: string[],
  readonly input?: string[],
  readonly inputExclude?: string[],
  readonly output?: string,
  readonly header?: string,
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
  readonly verbose?: number,
  readonly help?: boolean,
}

export default class Options implements OptionsProps {
  @Expose({ name: '_' })
  readonly commands: string[] = [];

  readonly dat: string[] = [];

  readonly input: string[] = [];

  readonly inputExclude: string[] = [];

  readonly output!: string;

  readonly header!: string;

  readonly dirMirror!: boolean;

  readonly dirDatName!: boolean;

  readonly dirLetter!: boolean;

  readonly single: boolean = false;

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

  readonly verbose!: number;

  readonly help!: boolean;

  constructor(options?: OptionsProps) {
    this.commands = options?.commands || [];
    this.dat = options?.dat || [];
    this.input = options?.input || [];
    this.inputExclude = options?.inputExclude || [];
    this.output = options?.output || '';
    this.header = options?.header || '';
    this.dirMirror = options?.dirMirror || false;
    this.dirDatName = options?.dirDatName || false;
    this.dirLetter = options?.dirLetter || false;
    this.single = options?.single || false;
    this.zipExclude = options?.zipExclude || '';
    this.overwrite = options?.overwrite || false;
    this.preferGood = options?.preferGood || false;
    this.preferLanguage = options?.preferLanguage || [];
    this.preferRegion = options?.preferRegion || [];
    this.preferRevisionNewer = options?.preferRevisionNewer || false;
    this.preferRevisionOlder = options?.preferRevisionOlder || false;
    this.preferRetail = options?.preferRetail || false;
    this.preferParent = options?.preferParent || false;
    this.languageFilter = options?.languageFilter || [];
    this.regionFilter = options?.regionFilter || [];
    this.onlyBios = options?.onlyBios || false;
    this.noBios = options?.noBios || false;
    this.noUnlicensed = options?.noUnlicensed || false;
    this.onlyRetail = options?.onlyRetail || false;
    this.noDemo = options?.noDemo || false;
    this.noBeta = options?.noBeta || false;
    this.noSample = options?.noSample || false;
    this.noPrototype = options?.noPrototype || false;
    this.noTestRoms = options?.noTestRoms || false;
    this.noAftermarket = options?.noAftermarket || false;
    this.noHomebrew = options?.noHomebrew || false;
    this.noBad = options?.noBad || false;
    this.verbose = options?.verbose || 0;
    this.help = options?.help || false;
  }

  static fromObject(obj: object): Options {
    return plainToInstance(Options, obj, {
      enableImplicitConversion: true,
    });
  }

  toString(): string {
    return JSON.stringify(instanceToPlain(this));
  }

  // Commands

  private getCommands(): string[] {
    return this.commands.map((c) => c.toLowerCase());
  }

  shouldWrite(): boolean {
    return this.shouldCopy() || this.shouldMove();
  }

  shouldCopy(): boolean {
    return this.getCommands().indexOf('copy') !== -1;
  }

  shouldMove(): boolean {
    return this.getCommands().indexOf('move') !== -1;
  }

  shouldZip(filePath: string): boolean {
    return this.getCommands().indexOf('zip') !== -1
      && (!this.getZipExclude() || !micromatch.isMatch(
        filePath.replace(/^.[\\/]/, ''),
        this.getZipExclude(),
      ));
  }

  shouldClean(): boolean {
    return this.getCommands().indexOf('clean') !== -1;
  }

  shouldTest(): boolean {
    return this.getCommands().indexOf('test') !== -1;
  }

  shouldReport(): boolean {
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
          // Windows will report that \\.\nul doesn't exist, catch it explicitly
          if (inputPath === os.devNull) {
            return [];
          }

          // If the file exists, don't process it as a glob pattern
          if (await fsPoly.exists(inputPath)) {
            return [inputPath];
          }

          // Otherwise, process it as a glob pattern
          const paths = (await fg(inputPath.replace(/\\/g, '/')))
            .map((filePath) => path.normalize(filePath));
          if (!paths || !paths.length) {
            throw new Error(`Path doesn't exist: ${inputPath}`);
          }
          return paths;
        }),
    )).flatMap((paths) => paths);

    // Filter to files
    const isFiles = await Promise.all(
      globbedPaths.map(async (inputPath) => (await fsPromises.lstat(inputPath)).isFile()),
    );
    const globbedFiles = globbedPaths
      .filter((inputPath, idx) => isFiles[idx])
      .filter((inputPath) => isNotJunk(path.basename(inputPath)));

    // Remove duplicates
    return globbedFiles
      .filter((inputPath, idx, arr) => arr.indexOf(inputPath) === idx);
  }

  getOutput(dat?: DAT, inputRomPath?: string, romName?: string): string {
    let output = this.shouldWrite() ? this.output : Constants.GLOBAL_TEMP_DIR;
    if (this.getDirMirror() && inputRomPath) {
      const mirroredDir = path.dirname(inputRomPath)
        .replace(/[\\/]/g, path.sep)
        .split(path.sep)
        .splice(1)
        .join(path.sep);
      output = path.join(output, mirroredDir);
    }

    if (dat && this.getDirDatName()) {
      output = path.join(output, dat.getNameShort());
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

    return fsPoly.makeLegal(output);
  }

  getOutputReport(): string {
    const output = this.shouldWrite() ? this.output : process.cwd();
    return path.join(
      output,
      fsPoly.makeLegal(`${Constants.COMMAND_NAME}_${moment().format()}.txt`),
    );
  }

  private getHeader(): string {
    return this.header;
  }

  shouldReadFileForHeader(filePath: string): boolean {
    return this.getHeader().length > 0 && micromatch.isMatch(
      filePath.replace(/^.[\\/]/, ''),
      this.getHeader(),
    );
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
    return Options.filterUniqueUpper(this.preferLanguage);
  }

  getPreferRegions(): string[] {
    return Options.filterUniqueUpper(this.preferRegion);
  }

  getLanguageFilter(): string[] {
    return Options.filterUniqueUpper(this.languageFilter);
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
    return Options.filterUniqueUpper(this.regionFilter);
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

  getLogLevel(): LogLevel {
    if (this.verbose === 1) {
      return LogLevel.INFO;
    } if (this.verbose >= 2) {
      return LogLevel.DEBUG;
    }
    return LogLevel.WARN;
  }

  getHelp(): boolean {
    return this.help;
  }

  static filterUniqueUpper(array: string[]): string[] {
    return array
      .map((value) => value.toUpperCase())
      .filter((val, idx, arr) => arr.indexOf(val) === idx);
  }
}
