import 'reflect-metadata';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';

import async, { AsyncResultCallback } from 'async';
import {
  Expose, instanceToPlain, plainToInstance, Transform,
} from 'class-transformer';
import fg from 'fast-glob';
import { isNotJunk } from 'junk';
import micromatch from 'micromatch';
import moment from 'moment';

import LogLevel from '../console/logLevel.js';
import Constants from '../constants.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import fsPoly, { FsWalkCallback } from '../polyfill/fsPoly.js';
import URLPoly from '../polyfill/urlPoly.js';
import DAT from './dats/dat.js';
import File from './files/file.js';

export enum MergeMode {
  // Clones contain all parent ROMs, all games contain BIOS & device ROMs
  FULLNONMERGED = 1,
  // Clones contain all parent ROMs, BIOS & device ROMsets are separate
  NONMERGED,
  // Clones exclude all parent ROMs, BIOS & device ROMsets are separate
  SPLIT,
  // Clones are merged into parent, BIOS & device ROMsets are separate
  MERGED,
}

export enum GameSubdirMode {
  // Never add the Game name as a subdirectory
  NEVER = 1,
  // Add the Game name as a subdirectory if it has multiple output files
  MULTIPLE,
  // Always add the Game name as a subdirectory
  ALWAYS,
}

export interface OptionsProps {
  readonly commands?: string[],

  readonly input?: string[],
  readonly inputExclude?: string[],
  readonly patch?: string[],
  readonly patchExclude?: string[],

  readonly dat?: string[],
  readonly datExclude?: string[],
  readonly datRegex?: string,
  readonly datNameRegex?: string,
  readonly datRegexExclude?: string,
  readonly datNameRegexExclude?: string,
  readonly datDescriptionRegex?: string,
  readonly datDescriptionRegexExclude?: string,
  readonly datCombine?: boolean,
  readonly datIgnoreParentClone?: boolean,

  readonly fixdat?: boolean;

  readonly output?: string,
  readonly dirMirror?: boolean,
  readonly dirDatName?: boolean,
  readonly dirDatDescription?: boolean,
  readonly dirLetter?: boolean,
  readonly dirLetterCount?: number,
  readonly dirLetterLimit?: number,
  readonly dirLetterGroup?: boolean,
  readonly dirGameSubdir?: string,
  readonly overwrite?: boolean,
  readonly overwriteInvalid?: boolean,
  readonly cleanExclude?: string[],
  readonly cleanDryRun?: boolean,

  readonly zipExclude?: string,
  readonly zipDatName?: boolean,

  readonly symlink?: boolean,
  readonly symlinkRelative?: boolean,

  readonly header?: string,
  readonly removeHeaders?: string[],

  readonly mergeRoms?: string,
  readonly allowIncompleteSets?: boolean,

  readonly filterRegex?: string,
  readonly filterRegexExclude?: string,
  readonly filterLanguage?: string[],
  readonly languageFilter?: string[],
  readonly filterRegion?: string[],
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
  readonly noProgram?: boolean,
  readonly onlyProgram?: boolean,
  readonly noAftermarket?: boolean,
  readonly onlyAftermarket?: boolean,
  readonly noHomebrew?: boolean,
  readonly onlyHomebrew?: boolean,
  readonly noUnverified?: boolean,
  readonly onlyUnverified?: boolean,
  readonly noBad?: boolean,
  readonly onlyBad?: boolean,

  readonly single?: boolean,
  readonly preferGameRegex?: string,
  readonly preferRomRegex?: string,
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
  readonly readerThreads?: number,
  readonly writerThreads?: number,
  readonly verbose?: number,
  readonly help?: boolean,
}

/**
 * A collection of all options for a single invocation of the application.
 */
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

  readonly datNameRegex: string;

  readonly datRegexExclude: string;

  readonly datNameRegexExclude: string;

  readonly datDescriptionRegex: string;

  readonly datDescriptionRegexExclude: string;

  readonly datCombine: boolean;

  readonly datIgnoreParentClone: boolean;

  readonly fixdat: boolean;

  readonly output: string;

  readonly dirMirror: boolean;

  readonly dirDatName: boolean;

  readonly dirDatDescription: boolean;

  readonly dirLetter: boolean;

  readonly dirLetterCount: number;

  readonly dirLetterLimit: number;

  readonly dirLetterGroup: boolean;

  readonly dirGameSubdir?: string;

  readonly overwrite: boolean;

  readonly overwriteInvalid: boolean;

  readonly cleanExclude: string[];

  readonly cleanDryRun: boolean;

  readonly zipExclude: string;

  readonly zipDatName: boolean;

  readonly symlink: boolean;

  readonly symlinkRelative: boolean;

  readonly header: string;

  readonly removeHeaders?: string[];

  readonly mergeRoms?: string;

  readonly allowIncompleteSets: boolean;

  readonly filterRegex: string;

  readonly filterRegexExclude: string;

  readonly filterLanguage: string[];

  readonly languageFilter: string[];

  readonly filterRegion: string[];

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

  readonly noProgram: boolean;

  readonly onlyProgram: boolean;

  readonly noAftermarket: boolean;

  readonly onlyAftermarket: boolean;

  readonly noHomebrew: boolean;

  readonly onlyHomebrew: boolean;

  readonly noUnverified: boolean;

  readonly onlyUnverified: boolean;

  readonly noBad: boolean;

  readonly onlyBad: boolean;

  readonly single: boolean;

  readonly preferGameRegex: string;

  readonly preferRomRegex: string;

  readonly preferVerified: boolean;

  readonly preferGood: boolean;

  readonly preferLanguage: string[];

  readonly preferRegion: string[];

  readonly preferRevisionNewer: boolean;

  readonly preferRevisionOlder: boolean;

  readonly preferRetail: boolean;

  @Expose({ name: 'preferNtsc' })
  @Transform(({ value }) => !!value)
  readonly preferNTSC: boolean;

  @Expose({ name: 'preferPal' })
  @Transform(({ value }) => !!value)
  readonly preferPAL: boolean;

  readonly preferParent: boolean;

  readonly reportOutput: string;

  readonly datThreads: number;

  readonly readerThreads: number;

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
    this.datNameRegex = options?.datNameRegex ?? '';
    this.datRegexExclude = options?.datRegexExclude ?? '';
    this.datNameRegexExclude = options?.datNameRegexExclude ?? '';
    this.datDescriptionRegex = options?.datDescriptionRegex ?? '';
    this.datDescriptionRegexExclude = options?.datDescriptionRegexExclude ?? '';
    this.datCombine = options?.datCombine ?? false;
    this.datIgnoreParentClone = options?.datIgnoreParentClone ?? false;

    this.fixdat = options?.fixdat ?? false;

    this.output = options?.output ?? '';
    this.dirMirror = options?.dirMirror ?? false;
    this.dirDatName = options?.dirDatName ?? false;
    this.dirDatDescription = options?.dirDatDescription ?? false;
    this.dirLetter = options?.dirLetter ?? false;
    this.dirLetterCount = options?.dirLetterCount ?? 0;
    this.dirLetterLimit = options?.dirLetterLimit ?? 0;
    this.dirLetterGroup = options?.dirLetterGroup ?? false;
    this.dirGameSubdir = options?.dirGameSubdir;
    this.overwrite = options?.overwrite ?? false;
    this.overwriteInvalid = options?.overwriteInvalid ?? false;
    this.cleanExclude = options?.cleanExclude ?? [];
    this.cleanDryRun = options?.cleanDryRun ?? false;

    this.zipExclude = options?.zipExclude ?? '';
    this.zipDatName = options?.zipDatName ?? false;

    this.symlink = options?.symlink ?? false;
    this.symlinkRelative = options?.symlinkRelative ?? false;

    this.header = options?.header ?? '';
    this.removeHeaders = options?.removeHeaders;

    this.mergeRoms = options?.mergeRoms;
    this.allowIncompleteSets = options?.allowIncompleteSets ?? false;

    this.filterRegex = options?.filterRegex ?? '';
    this.filterRegexExclude = options?.filterRegexExclude ?? '';
    this.filterLanguage = options?.filterLanguage ?? [];
    this.languageFilter = options?.languageFilter ?? [];
    this.filterRegion = options?.filterRegion ?? [];
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
    this.noProgram = options?.noProgram ?? false;
    this.onlyProgram = options?.onlyProgram ?? false;
    this.noAftermarket = options?.noAftermarket ?? false;
    this.onlyAftermarket = options?.onlyAftermarket ?? false;
    this.noHomebrew = options?.noHomebrew ?? false;
    this.onlyHomebrew = options?.onlyHomebrew ?? false;
    this.noUnverified = options?.noUnverified ?? false;
    this.onlyUnverified = options?.onlyUnverified ?? false;
    this.noBad = options?.noBad ?? false;
    this.onlyBad = options?.onlyBad ?? false;

    this.single = options?.single ?? false;
    this.preferGameRegex = options?.preferGameRegex ?? '';
    this.preferRomRegex = options?.preferRomRegex ?? '';
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
    this.readerThreads = Math.max(options?.readerThreads ?? 0, 1);
    this.writerThreads = Math.max(options?.writerThreads ?? 0, 1);
    this.verbose = options?.verbose ?? 0;
    this.help = options?.help ?? false;
  }

  /**
   * Construct a {@link Options} from a generic object, such as one from `yargs`.
   */
  static fromObject(obj: object): Options {
    return plainToInstance(Options, obj, {
      enableImplicitConversion: true,
    });
  }

  /**
   * Return a JSON representation of all options.
   */
  toString(): string {
    return JSON.stringify(instanceToPlain(this));
  }

  // Helpers

  private static getRegex(pattern: string): RegExp[] | undefined {
    if (!pattern.trim()) {
      return undefined;
    }

    return pattern
      .split(/\r?\n/)
      .filter((line) => line.length)
      .map((line) => {
        const flagsMatch = line.match(/^\/(.+)\/([a-z]*)$/);
        if (flagsMatch !== null) {
          return new RegExp(flagsMatch[1], flagsMatch[2]);
        }
        return new RegExp(line);
      });
  }

  // Commands

  getCommands(): Set<string> {
    return new Set(this.commands.map((c) => c.toLowerCase()));
  }

  /**
   * Was any writing command provided?
   */
  shouldWrite(): boolean {
    return this.writeString() !== undefined;
  }

  /**
   * The writing command that was specified.
   */
  writeString(): string | undefined {
    return ['copy', 'move', 'link', 'symlink'].find((command) => this.getCommands().has(command));
  }

  /**
   * Was the `copy` command provided?
   */
  shouldCopy(): boolean {
    return this.getCommands().has('copy');
  }

  /**
   * Was the `move` command provided?
   */
  shouldMove(): boolean {
    return this.getCommands().has('move');
  }

  /**
   * Was the `link` command provided?
   */
  shouldLink(): boolean {
    return this.getCommands().has('link');
  }

  /**
   * Was the `extract` command provided?
   */
  shouldExtract(): boolean {
    return this.getCommands().has('extract');
  }

  /**
   * Was the `zip` command provided?
   */
  canZip(): boolean {
    return this.getCommands().has('zip');
  }

  /**
   * Should a given output file path be zipped?
   */
  shouldZip(filePath: string): boolean {
    return this.canZip()
      && (!this.getZipExclude() || !micromatch.isMatch(
        filePath.replace(/^.[\\/]/, ''),
        this.getZipExclude(),
      ));
  }

  /**
   * Was the 'dir2dat' command provided?
   */
  shouldDir2Dat(): boolean {
    return this.getCommands().has('dir2dat');
  }

  /**
   * Was the 'fixdat' command provided?
   */
  shouldFixdat(): boolean {
    return this.getCommands().has('fixdat') || this.fixdat;
  }

  /**
   * Was the `test` command provided?
   */
  shouldTest(): boolean {
    return this.getCommands().has('test');
  }

  /**
   * Was the `clean` command provided?
   */
  shouldClean(): boolean {
    return this.getCommands().has('clean');
  }

  /**
   * Was the `report` command provided?
   */
  shouldReport(): boolean {
    return this.getCommands().has('report');
  }

  // Options

  getInputPaths(): string[] {
    return this.input;
  }

  private async scanInputFiles(walkCallback?: FsWalkCallback): Promise<string[]> {
    return Options.scanPaths(this.input, walkCallback);
  }

  private async scanInputExcludeFiles(): Promise<string[]> {
    return Options.scanPaths(this.inputExclude, undefined, false);
  }

  /**
   * Scan for input files, and input files to exclude, and return the difference.
   */
  async scanInputFilesWithoutExclusions(walkCallback?: FsWalkCallback): Promise<string[]> {
    const inputFiles = await this.scanInputFiles(walkCallback);
    const inputExcludeFiles = new Set(await this.scanInputExcludeFiles());
    return inputFiles
      .filter((inputPath) => !inputExcludeFiles.has(inputPath));
  }

  getPatchFileCount(): number {
    return this.patch.length;
  }

  /**
   * Scan for patch files, and patch files to exclude, and return the difference.
   */
  async scanPatchFilesWithoutExclusions(walkCallback?: FsWalkCallback): Promise<string[]> {
    const patchFiles = await this.scanPatchFiles(walkCallback);
    const patchExcludeFiles = new Set(await this.scanPatchExcludeFiles());
    return patchFiles
      .filter((patchPath) => !patchExcludeFiles.has(patchPath));
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
      .reduce(ArrayPoly.reduceUnique(), []);
    let globbedPaths: string[] = [];
    for (const uniqueGlobPattern of uniqueGlobPatterns) {
      const paths = await this.globPath(
        uniqueGlobPattern,
        requireFiles,
        walkCallback ?? ((): void => {}),
      );
      // NOTE(cemmer): if `paths` is really large, `globbedPaths.push(...paths)` can hit a stack
      // size limit
      globbedPaths = [...globbedPaths, ...paths];
    }

    // Filter to non-directories
    const isNonDirectory = await async.mapLimit(
      globbedPaths,
      Constants.MAX_FS_THREADS,
      async (file, callback: AsyncResultCallback<boolean, Error>) => {
        if (!await fsPoly.exists(file) && URLPoly.canParse(file)) {
          callback(undefined, true);
          return;
        }

        try {
          callback(undefined, !(await util.promisify(fs.lstat)(file)).isDirectory());
        } catch {
          // Assume errors mean the path doesn't exist
          callback(undefined, false);
        }
      },
    );
    const globbedFiles = globbedPaths
      .filter((inputPath, idx) => isNonDirectory[idx])
      .filter((inputPath) => isNotJunk(path.basename(inputPath)));

    // Remove duplicates
    return globbedFiles
      .reduce(ArrayPoly.reduceUnique(), []);
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
      if (dirPaths.length === 0) {
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
    if (paths.length === 0) {
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

  /**
   * Were any DAT paths provided?
   */
  usingDats(): boolean {
    return this.dat.length > 0;
  }

  private async scanDatFiles(walkCallback?: FsWalkCallback): Promise<string[]> {
    return Options.scanPaths(this.dat, walkCallback);
  }

  private async scanDatExcludeFiles(): Promise<string[]> {
    return Options.scanPaths(this.datExclude, undefined, false);
  }

  /**
   * Scan for DAT files, and DAT files to exclude, and return the difference.
   */
  async scanDatFilesWithoutExclusions(walkCallback?: FsWalkCallback): Promise<string[]> {
    const datFiles = await this.scanDatFiles(walkCallback);
    const datExcludeFiles = new Set(await this.scanDatExcludeFiles());
    return datFiles
      .filter((inputPath) => !datExcludeFiles.has(inputPath));
  }

  getDatNameRegex(): RegExp[] | undefined {
    return Options.getRegex(this.datNameRegex || this.datRegex);
  }

  getDatNameRegexExclude(): RegExp[] | undefined {
    return Options.getRegex(this.datNameRegexExclude || this.datRegexExclude);
  }

  getDatDescriptionRegex(): RegExp[] | undefined {
    return Options.getRegex(this.datDescriptionRegex);
  }

  getDatDescriptionRegexExclude(): RegExp[] | undefined {
    return Options.getRegex(this.datDescriptionRegexExclude);
  }

  getDatCombine(): boolean {
    return this.datCombine;
  }

  getDatIgnoreParentClone(): boolean {
    return this.datIgnoreParentClone;
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

  getDirLetterCount(): number {
    return this.dirLetterCount;
  }

  getDirLetterLimit(): number {
    return this.dirLetterLimit;
  }

  getDirLetterGroup(): boolean {
    return this.dirLetterGroup;
  }

  getDirGameSubdir(): GameSubdirMode | undefined {
    const subdirMode = Object.keys(GameSubdirMode)
      .find((mode) => mode.toLowerCase() === this.dirGameSubdir?.toLowerCase());
    if (!subdirMode) {
      return undefined;
    }
    return GameSubdirMode[subdirMode as keyof typeof GameSubdirMode];
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

  /**
   * Scan for output files, and output files to exclude from cleaning, and return the difference.
   */
  async scanOutputFilesWithoutCleanExclusions(
    outputDirs: string[],
    writtenFiles: File[],
    walkCallback?: FsWalkCallback,
  ): Promise<string[]> {
    // Written files that shouldn't be cleaned
    const writtenFilesNormalized = new Set(writtenFiles
      .map((file) => path.normalize(file.getFilePath())));

    // Files excluded from cleaning
    const cleanExcludedFilesNormalized = new Set((await this.scanCleanExcludeFiles())
      .map((filePath) => path.normalize(filePath)));

    return (await Options.scanPaths(outputDirs, walkCallback, false))
      .map((filePath) => path.normalize(filePath))
      .filter((filePath) => !writtenFilesNormalized.has(filePath))
      .filter((filePath) => !cleanExcludedFilesNormalized.has(filePath));
  }

  getCleanDryRun(): boolean {
    return this.cleanDryRun;
  }

  private getZipExclude(): string {
    return this.zipExclude;
  }

  getZipDatName(): boolean {
    return this.zipDatName;
  }

  getSymlink(): boolean {
    return this.symlink;
  }

  getSymlinkRelative(): boolean {
    return this.symlinkRelative;
  }

  private getHeader(): string {
    return this.header;
  }

  /**
   * Should a file have its contents read to detect any {@link Header}?
   */
  shouldReadFileForHeader(filePath: string): boolean {
    return this.getHeader().length > 0 && micromatch.isMatch(
      filePath.replace(/^.[\\/]/, ''),
      this.getHeader(),
    );
  }

  /**
   * Can the {@link Header} be removed for a {@link extension} during writing?
   */
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

  getMergeRoms(): MergeMode | undefined {
    const mergeMode = Object.keys(MergeMode)
      .find((mode) => mode.toLowerCase() === this.mergeRoms?.toLowerCase());
    if (!mergeMode) {
      return undefined;
    }
    return MergeMode[mergeMode as keyof typeof MergeMode];
  }

  getAllowIncompleteSets(): boolean {
    // If we're only reading, then go ahead and report on incomplete sets
    return this.allowIncompleteSets || !this.shouldWrite();
  }

  getFilterRegex(): RegExp[] | undefined {
    return Options.getRegex(this.filterRegex);
  }

  getFilterRegexExclude(): RegExp[] | undefined {
    return Options.getRegex(this.filterRegexExclude);
  }

  getFilterLanguage(): Set<string> {
    if (this.filterLanguage.length > 0) {
      return new Set(Options.filterUniqueUpper(this.filterLanguage));
    }
    if (this.languageFilter.length > 0) {
      return new Set(Options.filterUniqueUpper(this.languageFilter));
    }
    return new Set();
  }

  getFilterRegion(): Set<string> {
    if (this.filterRegion.length > 0) {
      return new Set(Options.filterUniqueUpper(this.filterRegion));
    }
    if (this.regionFilter.length > 0) {
      return new Set(Options.filterUniqueUpper(this.regionFilter));
    }
    return new Set();
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

  getNoProgram(): boolean {
    return this.noProgram;
  }

  getOnlyProgram(): boolean {
    return this.onlyProgram;
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

  getPreferGameRegex(): RegExp[] | undefined {
    return Options.getRegex(this.preferGameRegex);
  }

  getPreferRomRegex(): RegExp[] | undefined {
    return Options.getRegex(this.preferRomRegex);
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
        .reduce(ArrayPoly.reduceUnique(), [])
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

  getReaderThreads(): number {
    return this.readerThreads;
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

  private static filterUniqueUpper(array: string[]): string[] {
    return array
      .map((value) => value.toUpperCase())
      .reduce(ArrayPoly.reduceUnique(), []);
  }
}
