import 'reflect-metadata';

import { Expose, instanceToPlain, plainToInstance } from 'class-transformer';
import fg from 'fast-glob';
import fs, { promises as fsPromises } from 'fs';
import { isNotJunk } from 'junk';
import micromatch from 'micromatch';
import moment from 'moment';
import os from 'os';
import path from 'path';

import LogLevel from '../console/logLevel.js';
import Constants from '../constants.js';
import fsPoly from '../polyfill/fsPoly.js';
import FileFactory from './archives/fileFactory.js';
import File from './files/file.js';
import GameConsole from './gameConsole.js';
import DAT from './logiqx/dat.js';
import Game from './logiqx/game.js';
import Release from './logiqx/release.js';

export interface OptionsProps {
  readonly commands?: string[],

  readonly dat?: string[],
  readonly input?: string[],
  readonly inputExclude?: string[],
  readonly patch?: string[],
  readonly output?: string,

  readonly header?: string,

  readonly dirMirror?: boolean,
  readonly dirDatName?: boolean,
  readonly dirLetter?: boolean,
  readonly zipExclude?: string,
  readonly removeHeaders?: string[],
  readonly overwrite?: boolean,
  readonly cleanExclude?: string[],

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
  readonly noUnverified?: boolean,
  readonly noBad?: boolean,

  readonly single?: boolean,
  readonly preferVerified?: boolean,
  readonly preferGood?: boolean,
  readonly preferLanguage?: string[],
  readonly preferRegion?: string[],
  readonly preferRevisionNewer?: boolean,
  readonly preferRevisionOlder?: boolean,
  readonly preferRetail?: boolean,
  readonly preferParent?: boolean,

  readonly verbose?: number,
  readonly help?: boolean,
}

export default class Options implements OptionsProps {
  @Expose({ name: '_' })
  readonly commands: string[];

  readonly dat: string[];

  readonly input: string[];

  readonly inputExclude: string[];

  readonly patch: string[];

  readonly output: string;

  readonly header: string;

  readonly dirMirror: boolean;

  readonly dirDatName: boolean;

  readonly dirLetter: boolean;

  readonly zipExclude: string;

  readonly removeHeaders?: string[];

  readonly overwrite: boolean;

  readonly cleanExclude: string[];

  readonly languageFilter: string[];

  readonly regionFilter: string[];

  readonly onlyBios: boolean;

  readonly noBios: boolean;

  readonly noUnlicensed: boolean;

  readonly onlyRetail: boolean;

  readonly noDemo: boolean;

  readonly noBeta: boolean;

  readonly noSample: boolean;

  readonly noPrototype: boolean;

  readonly noTestRoms: boolean;

  readonly noAftermarket: boolean;

  readonly noHomebrew: boolean;

  readonly noUnverified: boolean;

  readonly noBad: boolean;

  readonly single: boolean = false;

  readonly preferVerified: boolean;

  readonly preferGood: boolean;

  readonly preferLanguage: string[];

  readonly preferRegion: string[];

  readonly preferRevisionNewer: boolean;

  readonly preferRevisionOlder: boolean;

  readonly preferRetail: boolean;

  readonly preferParent: boolean;

  readonly verbose: number;

  readonly help: boolean;

  constructor(options?: OptionsProps) {
    this.commands = options?.commands || [];

    this.dat = options?.dat || [];
    this.input = options?.input || [];
    this.inputExclude = options?.inputExclude || [];
    this.patch = options?.patch || [];
    this.output = options?.output || '';

    this.header = options?.header || '';

    this.dirMirror = options?.dirMirror || false;
    this.dirDatName = options?.dirDatName || false;
    this.dirLetter = options?.dirLetter || false;
    this.zipExclude = options?.zipExclude || '';
    this.removeHeaders = options?.removeHeaders;
    this.overwrite = options?.overwrite || false;
    this.cleanExclude = options?.cleanExclude || [];

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
    this.noUnverified = options?.noUnverified || false;
    this.noBad = options?.noBad || false;

    this.single = options?.single || false;
    this.preferVerified = options?.preferVerified || false;
    this.preferGood = options?.preferGood || false;
    this.preferLanguage = options?.preferLanguage || [];
    this.preferRegion = options?.preferRegion || [];
    this.preferRevisionNewer = options?.preferRevisionNewer || false;
    this.preferRevisionOlder = options?.preferRevisionOlder || false;
    this.preferRetail = options?.preferRetail || false;
    this.preferParent = options?.preferParent || false;

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

  usingDats(): boolean {
    return this.dat.length > 0;
  }

  getDatFileCount(): number {
    return this.dat.length;
  }

  async scanDatFiles(): Promise<string[]> {
    return Options.scanPath(this.dat);
  }

  getInputFileCount(): number {
    return this.input.length;
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

  getPatchFileCount(): number {
    return this.patch.length;
  }

  async scanPatchFiles(): Promise<string[]> {
    return Options.scanPath(this.patch);
  }

  private static async scanPath(inputPaths: string[]): Promise<string[]> {
    const globbedPaths = (await Promise.all(inputPaths
      .filter((inputPath) => inputPath)
      .map(async (inputPath) => {
      // Windows will report that \\.\nul doesn't exist, catch it explicitly
        if (inputPath === os.devNull || inputPath.startsWith(os.devNull + path.sep)) {
          return [];
        }

        // fg only uses forward-slash path separators
        const inputPathNormalized = inputPath.replace(/\\/g, '/');

        // Glob the contents of directories
        if (await fsPoly.isDirectory(inputPath)) {
          const dirPaths = (await fg(`${fg.escapePath(inputPathNormalized)}/**`))
            .map((filePath) => path.normalize(filePath));
          if (!dirPaths || !dirPaths.length) {
            throw new Error(`${inputPath}: Path doesn't exist`);
          }
          return dirPaths;
        }

        // If the file exists, don't process it as a glob pattern
        if (await fsPoly.exists(inputPath)) {
          return [inputPath];
        }

        // Otherwise, process it as a glob pattern
        const paths = (await fg(inputPathNormalized))
          .map((filePath) => path.normalize(filePath));
        if (!paths || !paths.length) {
          throw new Error(`${inputPath}: Path doesn't exist`);
        }
        return paths;
      }))).flatMap((paths) => paths);

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

  private getOutput(): string {
    return this.shouldWrite() ? this.output : Constants.GLOBAL_TEMP_DIR;
  }

  /**
   * Get the "root" sub-path of the output dir, the sub-path up until the first replaceable token.
   */
  getOutputDirRoot(): string {
    const outputSplit = path.normalize(this.getOutput()).split(path.sep);
    for (let i = 0; i < outputSplit.length; i += 1) {
      if (outputSplit[i].match(/\{[a-zA-Z]+\}/g) !== null) {
        return path.normalize(outputSplit.slice(0, i).join(path.sep));
      }
    }
    return outputSplit.join(path.sep);
  }

  /**
   * Get the output dir, only resolving any tokens.
   */
  getOutputDirParsed(
    dat?: DAT,
    inputRomPath?: string,
    game?: Game,
    release?: Release,
    romFilename?: string,
  ): string {
    const romFilenameSanitized = romFilename?.replace(/[\\/]/g, '_');

    let output = this.getOutput();
    output = Options.replaceOutputTokens(output, dat, inputRomPath, release, romFilenameSanitized);

    return fsPoly.makeLegal(output);
  }

  /**
   * Get the full output path for a ROM file.
   */
  getOutputFileParsed(
    dat?: DAT,
    inputRomPath?: string,
    game?: Game,
    release?: Release,
    romFilename?: string,
  ): string {
    const romFilenameSanitized = romFilename?.replace(/[\\/]/g, '_');

    let output = this.getOutputDirParsed(dat, inputRomPath, game, release, romFilename);

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

    if (this.getDirLetter() && romFilenameSanitized) {
      let letter = romFilenameSanitized[0].toUpperCase();
      if (letter.match(/[^A-Z]/)) {
        letter = '#';
      }
      output = path.join(output, letter);
    }

    if (game
      && game.getRoms().length > 1
      && (!romFilenameSanitized || !FileFactory.isArchive(romFilenameSanitized))
    ) {
      output = path.join(output, game.getName());
    }

    if (romFilenameSanitized) {
      output = path.join(output, romFilenameSanitized);
    }

    return fsPoly.makeLegal(output);
  }

  private static replaceOutputTokens(
    output: string,
    dat?: DAT,
    inputRomPath?: string,
    release?: Release,
    outputRomFilename?: string,
  ): string {
    let result = output;
    if (dat) {
      result = result.replace('{datName}', dat.getName().replace(/[\\/]/g, '_'));
    }
    if (release) {
      result = result.replace('{datReleaseRegion}', release.getRegion());
      if (release.getLanguage()) {
        result = result.replace('{datReleaseLanguage}', release.getLanguage() as string);
      }
    }
    if (inputRomPath) {
      const inputRom = path.parse(inputRomPath);
      result = result
        .replace('{inputDirname}', inputRom.dir);
    }
    if (outputRomFilename) {
      const outputRom = path.parse(outputRomFilename);
      result = result
        .replace('{outputBasename}', outputRom.base)
        .replace('{outputName}', outputRom.name)
        .replace('{outputExt}', outputRom.ext.replace(/^\./, ''));
    }
    result = this.replaceOutputGameConsoleTokens(result, dat, outputRomFilename);

    const leftoverTokens = result.match(/\{[a-zA-Z]+\}/g);
    if (leftoverTokens !== null && leftoverTokens.length) {
      throw new Error(`failed to replace output token${leftoverTokens.length !== 1 ? 's' : ''}: ${leftoverTokens.join(', ')}`);
    }

    return result;
  }

  private static replaceOutputGameConsoleTokens(
    output: string,
    dat?: DAT,
    outputRomFilename?: string,
  ): string {
    if (!outputRomFilename) {
      return output;
    }

    const gameConsole = GameConsole.getForFilename(outputRomFilename)
      || GameConsole.getForConsoleName(dat?.getName() || '');
    if (!gameConsole) {
      return output;
    }

    let result = output;
    if (gameConsole.getPocket()) {
      result = result.replace('{pocket}', gameConsole.getPocket() as string);
    }
    if (gameConsole.getMister()) {
      result = result.replace('{mister}', gameConsole.getMister() as string);
    }
    return result;
  }

  getOutputReportPath(): string {
    let output = process.cwd();
    if (this.shouldWrite()) {
      // Write to the output dir if writing
      output = this.getOutput();
    } else if (this.input.length === 1) {
      // Write to the input dir if there is only one
      let [input] = this.input;
      while (!fs.existsSync(input)) {
        input = path.dirname(input);
      }
      output = input;
    }

    return path.join(
      output,
      fsPoly.makeLegal(`${Constants.COMMAND_NAME}_${moment().format()}.csv`),
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

  private getZipExclude(): string {
    return this.zipExclude;
  }

  canRemoveHeader(dat: DAT, extension: string): boolean {
    // ROMs in "headered" DATs shouldn't have their header removed
    if (dat.isHeadered()) {
      return false;
    }

    // ROMs in "headerless" DATs should have their header removed
    if (dat.isHeaderless()) {
      return true;
    }

    if (this.removeHeaders === undefined) {
      // Option wasn't provided, we shouldn't remove headers
      return false;
    }
    if (this.removeHeaders.length === 1 && this.removeHeaders[0] === '') {
      // Option was provided without any extensions, we should remove headers from every file
      return true;
    }
    // Option was provided with extensions, we should remove headers on name match
    return this.removeHeaders
      .some((removeHeader) => removeHeader.toLowerCase() === extension.toLowerCase());
  }

  getOverwrite(): boolean {
    return this.overwrite;
  }

  private async scanCleanExcludeFiles(): Promise<string[]> {
    return Options.scanPath(this.cleanExclude);
  }

  async scanOutputFilesWithoutCleanExclusions(
    outputDirs: string[],
    writtenFiles: File[],
  ): Promise<string[]> {
    // Written files that shouldn't be cleaned
    const writtenFilesNormalized = writtenFiles
      .map((file) => path.normalize(file.getFilePath()));

    // Files excluded from cleaning
    const cleanExcludedFilesNormalized = (await this.scanCleanExcludeFiles())
      .map((filePath) => path.normalize(filePath));

    return (await Options.scanPath(outputDirs))
      .map((filePath) => path.normalize(filePath))
      .filter((filePath) => writtenFilesNormalized.indexOf(filePath) === -1)
      .filter((filePath) => cleanExcludedFilesNormalized.indexOf(filePath) === -1);
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

  getNoUnverified(): boolean {
    return this.noUnverified;
  }

  getNoBad(): boolean {
    return this.noBad;
  }

  getSingle(): boolean {
    return this.single;
  }

  getPreferVerified(): boolean {
    return this.preferVerified;
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

  getLogLevel(): LogLevel {
    if (this.verbose === 1) {
      return LogLevel.INFO;
    } if (this.verbose === 2) {
      return LogLevel.DEBUG;
    } if (this.verbose >= 3) {
      return LogLevel.TRACE;
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
