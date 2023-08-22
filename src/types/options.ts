import 'reflect-metadata';

import async, { AsyncResultCallback } from 'async';
import { Expose, instanceToPlain, plainToInstance } from 'class-transformer';
import fg from 'fast-glob';
import fs from 'fs';
import { isNotJunk } from 'junk';
import micromatch from 'micromatch';
import moment from 'moment';
import os from 'os';
import path from 'path';
import util from 'util';

import LogLevel from '../console/logLevel.js';
import Constants from '../constants.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import fsPoly, { FsWalkCallback } from '../polyfill/fsPoly.js';
import URLPoly from '../polyfill/urlPoly.js';
import File from './files/file.js';
import DAT from './logiqx/dat.js';

export interface OptionsProps {
  readonly commands?: string[],

  readonly input?: string[],
  readonly inputExclude?: string[],
  readonly patch?: string[],
  readonly patchExclude?: string[],

  readonly dat?: string[],
  readonly datExclude?: string[],
  readonly datRegex?: string,
  readonly datRegexExclude?: string,

  readonly fixdat?: boolean;

  readonly output?: string,
  readonly dirMirror?: boolean,
  readonly dirDatName?: boolean,
  readonly dirDatDescription?: boolean,
  readonly dirLetter?: boolean,
  readonly dirLetterLimit?: number,
  readonly overwrite?: boolean,
  readonly overwriteInvalid?: boolean,
  readonly cleanExclude?: string[],

  readonly zipExclude?: string,
  readonly zipDatName?: boolean,

  readonly symlinkRelative?: boolean,

  readonly header?: string,
  readonly removeHeaders?: string[],

  readonly filterRegex?: string,
  readonly filterRegexExclude?: string,
  readonly languageFilter?: string[],
  readonly regionFilter?: string[],
  readonly noBios?: boolean,
  readonly onlyBios?: boolean,
  readonly noDevice?: boolean,
  readonly onlyDevice?: boolean,
  readonly noUnlicensed?: boolean,
  readonly onlyUnlicensed?: boolean,
  readonly onlyRetail?: boolean,
  readonly noDebug?: boolean,
  readonly onlyDebug?: boolean,
  readonly noDemo?: boolean,
  readonly onlyDemo?: boolean,
  readonly noBeta?: boolean,
  readonly onlyBeta?: boolean,
  readonly noSample?: boolean,
  readonly onlySample?: boolean,
  readonly noPrototype?: boolean,
  readonly onlyPrototype?: boolean,
  readonly noTestRoms?: boolean,
  readonly onlyTestRoms?: boolean,
  readonly noAftermarket?: boolean,
  readonly onlyAftermarket?: boolean,
  readonly noHomebrew?: boolean,
  readonly onlyHomebrew?: boolean,
  readonly noUnverified?: boolean,
  readonly onlyUnverified?: boolean,
  readonly noBad?: boolean,
  readonly onlyBad?: boolean,

  readonly single?: boolean,
  readonly preferVerified?: boolean,
  readonly preferGood?: boolean,
  readonly preferLanguage?: string[],
  readonly preferRegion?: string[],
  readonly preferRevisionNewer?: boolean,
  readonly preferRevisionOlder?: boolean,
  readonly preferRetail?: boolean,
  readonly preferNTSC?: boolean,
  readonly preferPAL?: boolean,
  readonly preferParent?: boolean,

  readonly reportOutput?: string,

  readonly datThreads?: number,
  readonly writerThreads?: number,
  readonly verbose?: number,
  readonly help?: boolean,
}

export default class Options implements OptionsProps {
  @Expose({ name: '_' })
  readonly commands: string[];

  readonly input: string[];

  readonly inputExclude: string[];

  readonly patch: string[];

  readonly patchExclude: string[];

  readonly dat: string[];

  readonly datExclude: string[];

  readonly datRegex: string;

  readonly datRegexExclude: string;

  readonly fixdat: boolean;

  readonly output: string;

  readonly dirMirror: boolean;

  readonly dirDatName: boolean;

  readonly dirDatDescription: boolean;

  readonly dirLetter: boolean;

  readonly dirLetterLimit: number;

  readonly overwrite: boolean;

  readonly overwriteInvalid: boolean;

  readonly cleanExclude: string[];

  readonly zipExclude: string;

  readonly zipDatName: boolean;

  readonly symlinkRelative: boolean;

  readonly header: string;

  readonly removeHeaders?: string[];

  readonly filterRegex: string;

  readonly filterRegexExclude: string;

  readonly languageFilter: string[];

  readonly regionFilter: string[];

  readonly noBios: boolean;

  readonly onlyBios: boolean;

  readonly noDevice: boolean;

  readonly onlyDevice: boolean;

  readonly noUnlicensed: boolean;

  readonly onlyUnlicensed: boolean;

  readonly onlyRetail: boolean;

  readonly noDebug: boolean;

  readonly onlyDebug: boolean;

  readonly noDemo: boolean;

  readonly onlyDemo: boolean;

  readonly noBeta: boolean;

  readonly onlyBeta: boolean;

  readonly noSample: boolean;

  readonly onlySample: boolean;

  readonly noPrototype: boolean;

  readonly onlyPrototype: boolean;

  readonly noTestRoms: boolean;

  readonly onlyTestRoms: boolean;

  readonly noAftermarket: boolean;

  readonly onlyAftermarket: boolean;

  readonly noHomebrew: boolean;

  readonly onlyHomebrew: boolean;

  readonly noUnverified: boolean;

  readonly onlyUnverified: boolean;

  readonly noBad: boolean;

  readonly onlyBad: boolean;

  readonly single: boolean = false;

  readonly preferVerified: boolean;

  readonly preferGood: boolean;

  readonly preferLanguage: string[];

  readonly preferRegion: string[];

  readonly preferRevisionNewer: boolean;

  readonly preferRevisionOlder: boolean;

  readonly preferRetail: boolean;

  @Expose({ name: 'preferNtsc' })
  readonly preferNTSC: boolean;

  @Expose({ name: 'preferPal' })
  readonly preferPAL: boolean;

  readonly preferParent: boolean;

  readonly reportOutput: string;

  readonly datThreads: number;

  readonly writerThreads: number;

  readonly verbose: number;

  readonly help: boolean;

  constructor(options?: OptionsProps) {
    this.commands = options?.commands ?? [];

    this.input = options?.input ?? [];
    this.inputExclude = options?.inputExclude ?? [];
    this.patch = options?.patch ?? [];
    this.patchExclude = options?.patchExclude ?? [];

    this.dat = options?.dat ?? [];
    this.datExclude = options?.datExclude ?? [];
    this.datRegex = options?.datRegex ?? '';
    this.datRegexExclude = options?.datRegexExclude ?? '';

    this.fixdat = options?.fixdat ?? false;

    this.output = options?.output ?? '';
    this.dirMirror = options?.dirMirror ?? false;
    this.dirDatName = options?.dirDatName ?? false;
    this.dirDatDescription = options?.dirDatDescription ?? false;
    this.dirLetter = options?.dirLetter ?? false;
    this.dirLetterLimit = options?.dirLetterLimit ?? 0;
    this.overwrite = options?.overwrite ?? false;
    this.overwriteInvalid = options?.overwriteInvalid ?? false;
    this.cleanExclude = options?.cleanExclude ?? [];

    this.zipExclude = options?.zipExclude ?? '';
    this.zipDatName = options?.zipDatName ?? false;

    this.symlinkRelative = options?.symlinkRelative ?? false;

    this.header = options?.header ?? '';
    this.removeHeaders = options?.removeHeaders;

    this.filterRegex = options?.filterRegex ?? '';
    this.filterRegexExclude = options?.filterRegexExclude ?? '';
    this.languageFilter = options?.languageFilter ?? [];
    this.regionFilter = options?.regionFilter ?? [];
    this.noBios = options?.noBios ?? false;
    this.onlyBios = options?.onlyBios ?? false;
    this.noDevice = options?.noDevice ?? false;
    this.onlyDevice = options?.onlyDevice ?? false;
    this.noUnlicensed = options?.noUnlicensed ?? false;
    this.onlyUnlicensed = options?.onlyUnlicensed ?? false;
    this.onlyRetail = options?.onlyRetail ?? false;
    this.noDebug = options?.noDebug ?? false;
    this.onlyDebug = options?.onlyDebug ?? false;
    this.noDemo = options?.noDemo ?? false;
    this.onlyDemo = options?.onlyDemo ?? false;
    this.noBeta = options?.noBeta ?? false;
    this.onlyBeta = options?.onlyBeta ?? false;
    this.noSample = options?.noSample ?? false;
    this.onlySample = options?.onlySample ?? false;
    this.noPrototype = options?.noPrototype ?? false;
    this.onlyPrototype = options?.onlyPrototype ?? false;
    this.noTestRoms = options?.noTestRoms ?? false;
    this.onlyTestRoms = options?.onlyTestRoms ?? false;
    this.noAftermarket = options?.noAftermarket ?? false;
    this.onlyAftermarket = options?.onlyAftermarket ?? false;
    this.noHomebrew = options?.noHomebrew ?? false;
    this.onlyHomebrew = options?.onlyHomebrew ?? false;
    this.noUnverified = options?.noUnverified ?? false;
    this.onlyUnverified = options?.onlyUnverified ?? false;
    this.noBad = options?.noBad ?? false;
    this.onlyBad = options?.onlyBad ?? false;

    this.single = options?.single ?? false;
    this.preferVerified = options?.preferVerified ?? false;
    this.preferGood = options?.preferGood ?? false;
    this.preferLanguage = options?.preferLanguage ?? [];
    this.preferRegion = options?.preferRegion ?? [];
    this.preferRevisionNewer = options?.preferRevisionNewer ?? false;
    this.preferRevisionOlder = options?.preferRevisionOlder ?? false;
    this.preferRetail = options?.preferRetail ?? false;
    this.preferNTSC = options?.preferNTSC ?? false;
    this.preferPAL = options?.preferPAL ?? false;
    this.preferParent = options?.preferParent ?? false;

    this.reportOutput = options?.reportOutput ?? '';

    this.datThreads = Math.max(options?.datThreads ?? 0, 1);
    this.writerThreads = Math.max(options?.writerThreads ?? 0, 1);
    this.verbose = options?.verbose ?? 0;
    this.help = options?.help ?? false;
  }

  static fromObject(obj: object): Options {
    return plainToInstance(Options, obj, {
      enableImplicitConversion: true,
    });
  }

  toString(): string {
    return JSON.stringify(instanceToPlain(this));
  }

  // Helpers

  private static getRegex(pattern: string): RegExp | undefined {
    if (!pattern.trim()) {
      return undefined;
    }

    const flagsMatch = pattern.match(/^\/(.+)\/([a-z]*)$/);
    if (flagsMatch !== null) {
      return new RegExp(flagsMatch[1], flagsMatch[2]);
    }

    return new RegExp(pattern);
  }

  // Commands

  getCommands(): string[] {
    return this.commands.map((c) => c.toLowerCase());
  }

  shouldWrite(): boolean {
    return this.writeString() !== undefined;
  }

  writeString(): string | undefined {
    return ['copy', 'move', 'symlink'].find((command) => this.getCommands().indexOf(command) !== -1);
  }

  shouldCopy(): boolean {
    return this.getCommands().indexOf('copy') !== -1;
  }

  shouldMove(): boolean {
    return this.getCommands().indexOf('move') !== -1;
  }

  shouldSymlink(): boolean {
    return this.getCommands().indexOf('symlink') !== -1;
  }

  shouldExtract(): boolean {
    return this.getCommands().indexOf('extract') !== -1;
  }

  canZip(): boolean {
    return this.getCommands().indexOf('zip') !== -1;
  }

  shouldZip(filePath: string): boolean {
    return this.canZip()
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

  getInputPaths(): string[] {
    return this.input;
  }

  getInputFileCount(): number {
    return this.input.length;
  }

  private async scanInputFiles(walkCallback?: FsWalkCallback): Promise<string[]> {
    return Options.scanPaths(this.input, walkCallback);
  }

  private async scanInputExcludeFiles(): Promise<string[]> {
    return Options.scanPaths(this.inputExclude, undefined, false);
  }

  async scanInputFilesWithoutExclusions(walkCallback?: FsWalkCallback): Promise<string[]> {
    const inputFiles = await this.scanInputFiles(walkCallback);
    const inputExcludeFiles = await this.scanInputExcludeFiles();
    return inputFiles
      .filter((inputPath) => inputExcludeFiles.indexOf(inputPath) === -1);
  }

  getPatchFileCount(): number {
    return this.patch.length;
  }

  async scanPatchFilesWithoutExclusions(walkCallback?: FsWalkCallback): Promise<string[]> {
    const patchFiles = await this.scanPatchFiles(walkCallback);
    const patchExcludeFiles = await this.scanPatchExcludeFiles();
    return patchFiles
      .filter((patchPath) => patchExcludeFiles.indexOf(patchPath) === -1);
  }

  private async scanPatchFiles(walkCallback?: FsWalkCallback): Promise<string[]> {
    return Options.scanPaths(this.patch, walkCallback);
  }

  private async scanPatchExcludeFiles(): Promise<string[]> {
    return Options.scanPaths(this.patchExclude, undefined, false);
  }

  private static async scanPaths(
    globPatterns: string[],
    walkCallback?: FsWalkCallback,
    requireFiles = true,
  ): Promise<string[]> {
    // Limit to scanning one glob pattern at a time to keep memory in check
    const uniqueGlobPatterns = globPatterns
      .filter((pattern) => pattern)
      .filter(ArrayPoly.filterUnique);
    const globbedPaths = [];
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < uniqueGlobPatterns.length; i += 1) {
      globbedPaths.push(...(await this.globPath(
        uniqueGlobPatterns[i],
        requireFiles,
        walkCallback ?? ((): void => {}),
      )));
    }

    // Filter to non-directories
    const isNonDirectory = await async.mapLimit(
      globbedPaths,
      Constants.MAX_FS_THREADS,
      async (file, callback: AsyncResultCallback<boolean, Error>) => {
        if (!await fsPoly.exists(file) && URLPoly.canParse(file)) {
          callback(null, true);
          return;
        }

        try {
          callback(null, !(await util.promisify(fs.lstat)(file)).isDirectory());
        } catch (e) {
          // Assume errors mean the path doesn't exist
          callback(null, false);
        }
      },
    );
    const globbedFiles = globbedPaths
      .filter((inputPath, idx) => isNonDirectory[idx])
      .filter((inputPath) => isNotJunk(path.basename(inputPath)));

    // Remove duplicates
    return globbedFiles
      .filter(ArrayPoly.filterUnique);
  }

  private static async globPath(
    inputPath: string,
    requireFiles: boolean,
    walkCallback: FsWalkCallback,
  ): Promise<string[]> {
    // Windows will report that \\.\nul doesn't exist, catch it explicitly
    if (inputPath === os.devNull || inputPath.startsWith(os.devNull + path.sep)) {
      return [];
    }

    // fg only uses forward-slash path separators
    const inputPathNormalized = inputPath.replace(/\\/g, '/');

    // Glob the contents of directories
    if (await fsPoly.isDirectory(inputPath)) {
      const dirPaths = (await fsPoly.walk(inputPathNormalized, walkCallback))
        .map((filePath) => path.normalize(filePath));
      if (!dirPaths || !dirPaths.length) {
        if (!requireFiles) {
          return [];
        }
        throw new Error(`${inputPath}: directory doesn't contain any files`);
      }
      return dirPaths;
    }

    // If the file exists, don't process it as a glob pattern
    if (await fsPoly.exists(inputPath)) {
      walkCallback(1);
      return [inputPath];
    }

    // Otherwise, process it as a glob pattern
    const paths = (await fg(inputPathNormalized, { onlyFiles: true }))
      .map((filePath) => path.normalize(filePath));
    if (!paths || !paths.length) {
      if (URLPoly.canParse(inputPath)) {
        // Allow URLs, let the scanner modules deal with them
        walkCallback(1);
        return [inputPath];
      }

      if (!requireFiles) {
        return [];
      }
      throw new Error(`${inputPath}: no files found`);
    }
    walkCallback(paths.length);
    return paths;
  }

  usingDats(): boolean {
    return this.dat.length > 0;
  }

  private async scanDatFiles(walkCallback?: FsWalkCallback): Promise<string[]> {
    return Options.scanPaths(this.dat, walkCallback);
  }

  private async scanDatExcludeFiles(): Promise<string[]> {
    return Options.scanPaths(this.datExclude, undefined, false);
  }

  async scanDatFilesWithoutExclusions(walkCallback?: FsWalkCallback): Promise<string[]> {
    const datFiles = await this.scanDatFiles(walkCallback);
    const datExcludeFiles = await this.scanDatExcludeFiles();
    return datFiles
      .filter((inputPath) => datExcludeFiles.indexOf(inputPath) === -1);
  }

  getDatRegex(): RegExp | undefined {
    return Options.getRegex(this.datRegex);
  }

  getDatRegexExclude(): RegExp | undefined {
    return Options.getRegex(this.datRegexExclude);
  }

  getFixdat(): boolean {
    return this.fixdat;
  }

  getOutput(): string {
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

  getDirMirror(): boolean {
    return this.dirMirror;
  }

  getDirDatName(): boolean {
    return this.dirDatName;
  }

  getDirDatDescription(): boolean {
    return this.dirDatDescription;
  }

  getDirLetter(): boolean {
    return this.dirLetter;
  }

  getDirLetterLimit(): number {
    return this.dirLetterLimit;
  }

  getOverwrite(): boolean {
    return this.overwrite;
  }

  getOverwriteInvalid(): boolean {
    return this.overwriteInvalid;
  }

  private async scanCleanExcludeFiles(): Promise<string[]> {
    return Options.scanPaths(this.cleanExclude, undefined, false);
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

    return (await Options.scanPaths(outputDirs))
      .map((filePath) => path.normalize(filePath))
      .filter((filePath) => writtenFilesNormalized.indexOf(filePath) === -1)
      .filter((filePath) => cleanExcludedFilesNormalized.indexOf(filePath) === -1);
  }

  private getZipExclude(): string {
    return this.zipExclude;
  }

  getZipDatName(): boolean {
    return this.zipDatName;
  }

  getSymlinkRelative(): boolean {
    return this.symlinkRelative;
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

  getFilterRegex(): RegExp | undefined {
    return Options.getRegex(this.filterRegex);
  }

  getFilterRegexExclude(): RegExp | undefined {
    return Options.getRegex(this.filterRegexExclude);
  }

  getLanguageFilter(): string[] {
    return Options.filterUniqueUpper(this.languageFilter);
  }

  getRegionFilter(): string[] {
    return Options.filterUniqueUpper(this.regionFilter);
  }

  getNoBios(): boolean {
    return this.noBios;
  }

  getOnlyBios(): boolean {
    return this.onlyBios;
  }

  getNoDevice(): boolean {
    return this.noDevice;
  }

  getOnlyDevice(): boolean {
    return this.onlyDevice;
  }

  getNoUnlicensed(): boolean {
    return this.noUnlicensed;
  }

  getOnlyUnlicensed(): boolean {
    return this.onlyUnlicensed;
  }

  getOnlyRetail(): boolean {
    return this.onlyRetail;
  }

  getNoDebug(): boolean {
    return this.noDebug;
  }

  getOnlyDebug(): boolean {
    return this.onlyDebug;
  }

  getNoDemo(): boolean {
    return this.noDemo;
  }

  getOnlyDemo(): boolean {
    return this.onlyDemo;
  }

  getNoBeta(): boolean {
    return this.noBeta;
  }

  getOnlyBeta(): boolean {
    return this.onlyBeta;
  }

  getNoSample(): boolean {
    return this.noSample;
  }

  getOnlySample(): boolean {
    return this.onlySample;
  }

  getNoPrototype(): boolean {
    return this.noPrototype;
  }

  getOnlyPrototype(): boolean {
    return this.onlyPrototype;
  }

  getNoTestRoms(): boolean {
    return this.noTestRoms;
  }

  getOnlyTestRoms(): boolean {
    return this.onlyTestRoms;
  }

  getNoAftermarket(): boolean {
    return this.noAftermarket;
  }

  getOnlyAftermarket(): boolean {
    return this.onlyAftermarket;
  }

  getNoHomebrew(): boolean {
    return this.noHomebrew;
  }

  getOnlyHomebrew(): boolean {
    return this.onlyHomebrew;
  }

  getNoUnverified(): boolean {
    return this.noUnverified;
  }

  getOnlyUnverified(): boolean {
    return this.onlyUnverified;
  }

  getNoBad(): boolean {
    return this.noBad;
  }

  getOnlyBad(): boolean {
    return this.onlyBad;
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

  getPreferRevisionNewer(): boolean {
    return this.preferRevisionNewer;
  }

  getPreferRevisionOlder(): boolean {
    return this.preferRevisionOlder;
  }

  getPreferRetail(): boolean {
    return this.preferRetail;
  }

  getPreferNTSC(): boolean {
    return this.preferNTSC;
  }

  getPreferPAL(): boolean {
    return this.preferPAL;
  }

  getPreferParent(): boolean {
    return this.preferParent;
  }

  getReportOutput(): string {
    let { reportOutput } = this;

    // Replace date & time tokens
    const symbolMatches = reportOutput.match(/%([a-zA-Z])(\1|o)*/g);
    if (symbolMatches) {
      symbolMatches
        .filter(ArrayPoly.filterUnique)
        .forEach((match) => {
          const val = moment().format(match.replace(/^%/, ''));
          reportOutput = reportOutput.replace(match, val);
        });
    }

    return fsPoly.makeLegal(path.resolve(reportOutput));
  }

  getDatThreads(): number {
    return this.datThreads;
  }

  getWriterThreads(): number {
    return this.writerThreads;
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
      .filter(ArrayPoly.filterUnique);
  }
}
