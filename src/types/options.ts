import 'reflect-metadata';

import os from 'node:os';
import path from 'node:path';

import async from 'async';
import { Expose, instanceToPlain, plainToInstance } from 'class-transformer';
import fg from 'fast-glob';
import { isNotJunk } from 'junk';
import micromatch from 'micromatch';
import moment from 'moment';

import LogLevel from '../console/logLevel.js';
import Defaults from '../globals/defaults.js';
import Temp from '../globals/temp.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import FsPoly, { FsWalkCallback } from '../polyfill/fsPoly.js';
import URLPoly from '../polyfill/urlPoly.js';
import Disk from './dats/disk.js';
import ROM from './dats/rom.js';
import ExpectedError from './expectedError.js';
import File from './files/file.js';
import { ChecksumBitmask } from './files/fileChecksums.js';

export enum InputChecksumArchivesMode {
  // Never calculate the checksum of archive files
  NEVER = 1,
  // Calculate the checksum of archive files if DATs reference archives
  AUTO = 2,
  // Always calculate the checksum of archive files
  ALWAYS = 3,
}

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

export enum FixExtension {
  NEVER = 1,
  AUTO = 2,
  ALWAYS = 3,
}

export enum PreferRevision {
  OLDER = 1,
  NEWER = 2,
}

export interface OptionsProps {
  readonly commands?: string[];

  readonly input?: string[];
  readonly inputExclude?: string[];
  readonly inputChecksumQuick?: boolean;
  readonly inputChecksumMin?: string;
  readonly inputChecksumMax?: string;
  readonly inputChecksumArchives?: string;

  readonly dat?: string[];
  readonly datExclude?: string[];
  readonly datNameRegex?: string;
  readonly datNameRegexExclude?: string;
  readonly datDescriptionRegex?: string;
  readonly datDescriptionRegexExclude?: string;
  readonly datCombine?: boolean;
  readonly datIgnoreParentClone?: boolean;

  readonly patch?: string[];
  readonly patchExclude?: string[];

  readonly output?: string;
  readonly dirMirror?: boolean;
  readonly dirDatName?: boolean;
  readonly dirDatDescription?: boolean;
  readonly dirLetter?: boolean;
  readonly dirLetterCount?: number;
  readonly dirLetterLimit?: number;
  readonly dirLetterGroup?: boolean;
  readonly dirGameSubdir?: string;
  readonly fixExtension?: string;
  readonly overwrite?: boolean;
  readonly overwriteInvalid?: boolean;

  readonly cleanExclude?: string[];
  readonly cleanBackup?: string;
  readonly cleanDryRun?: boolean;

  readonly zipExclude?: string;
  readonly zipDatName?: boolean;

  readonly symlink?: boolean;
  readonly symlinkRelative?: boolean;

  readonly header?: string;
  readonly removeHeaders?: string[];

  readonly mergeRoms?: string;
  readonly excludeDisks?: boolean;
  readonly allowExcessSets?: boolean;
  readonly allowIncompleteSets?: boolean;

  readonly filterRegex?: string;
  readonly filterRegexExclude?: string;
  readonly filterLanguage?: string[];
  readonly filterRegion?: string[];
  readonly noBios?: boolean;
  readonly onlyBios?: boolean;
  readonly noDevice?: boolean;
  readonly onlyDevice?: boolean;
  readonly noUnlicensed?: boolean;
  readonly onlyUnlicensed?: boolean;
  readonly onlyRetail?: boolean;
  readonly noDebug?: boolean;
  readonly onlyDebug?: boolean;
  readonly noDemo?: boolean;
  readonly onlyDemo?: boolean;
  readonly noBeta?: boolean;
  readonly onlyBeta?: boolean;
  readonly noSample?: boolean;
  readonly onlySample?: boolean;
  readonly noPrototype?: boolean;
  readonly onlyPrototype?: boolean;
  readonly noProgram?: boolean;
  readonly onlyProgram?: boolean;
  readonly noAftermarket?: boolean;
  readonly onlyAftermarket?: boolean;
  readonly noHomebrew?: boolean;
  readonly onlyHomebrew?: boolean;
  readonly noUnverified?: boolean;
  readonly onlyUnverified?: boolean;
  readonly noBad?: boolean;
  readonly onlyBad?: boolean;

  readonly single?: boolean;
  readonly preferGameRegex?: string;
  readonly preferRomRegex?: string;
  readonly preferVerified?: boolean;
  readonly preferGood?: boolean;
  readonly preferLanguage?: string[];
  readonly preferRegion?: string[];
  readonly preferRevision?: string;
  readonly preferRetail?: boolean;
  readonly preferParent?: boolean;

  readonly dir2datOutput?: string;

  readonly fixdatOutput?: string;

  readonly reportOutput?: string;

  readonly datThreads?: number;
  readonly readerThreads?: number;
  readonly writerThreads?: number;
  readonly writeRetry?: number;
  readonly tempDir?: string;
  readonly disableCache?: boolean;
  readonly cachePath?: string;
  readonly verbose?: number;
  readonly help?: boolean;
}

/**
 * A collection of all options for a single invocation of the application.
 */
export default class Options implements OptionsProps {
  @Expose({ name: '_' })
  readonly commands: string[];

  readonly input: string[];

  readonly inputExclude: string[];

  readonly inputChecksumQuick: boolean;

  readonly inputChecksumMin?: string;

  readonly inputChecksumMax?: string;

  readonly inputChecksumArchives?: string;

  readonly dat: string[];

  readonly datExclude: string[];

  readonly datNameRegex: string;

  readonly datNameRegexExclude: string;

  readonly datDescriptionRegex: string;

  readonly datDescriptionRegexExclude: string;

  readonly datCombine: boolean;

  readonly datIgnoreParentClone: boolean;

  readonly patch: string[];

  readonly patchExclude: string[];

  readonly output?: string;

  readonly dirMirror: boolean;

  readonly dirDatName: boolean;

  readonly dirDatDescription: boolean;

  readonly dirLetter: boolean;

  readonly dirLetterCount: number;

  readonly dirLetterLimit: number;

  readonly dirLetterGroup: boolean;

  readonly dirGameSubdir?: string;

  readonly fixExtension?: string;

  readonly overwrite: boolean;

  readonly overwriteInvalid: boolean;

  readonly cleanExclude: string[];

  readonly cleanBackup?: string;

  readonly cleanDryRun: boolean;

  readonly zipExclude: string;

  readonly zipDatName: boolean;

  readonly symlink: boolean;

  readonly symlinkRelative: boolean;

  readonly header: string;

  readonly removeHeaders?: string[];

  readonly mergeRoms?: string;

  readonly excludeDisks: boolean;

  readonly allowExcessSets: boolean;

  readonly allowIncompleteSets: boolean;

  readonly filterRegex: string;

  readonly filterRegexExclude: string;

  readonly filterLanguage: string[];

  readonly filterRegion: string[];

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

  readonly preferRevision?: string;

  readonly preferRetail: boolean;

  readonly preferParent: boolean;

  readonly dir2datOutput?: string;

  readonly fixdatOutput?: string;

  readonly reportOutput: string;

  readonly datThreads: number;

  readonly readerThreads: number;

  readonly writerThreads: number;

  readonly writeRetry: number;

  readonly tempDir: string;

  readonly disableCache: boolean;

  readonly cachePath?: string;

  readonly verbose: number;

  readonly help: boolean;

  constructor(options?: OptionsProps) {
    this.commands = options?.commands ?? [];

    this.input = (options?.input ?? []).map((filePath) => filePath.replace(/[\\/]/g, path.sep));
    this.inputExclude = (options?.inputExclude ?? []).map((filePath) =>
      filePath.replace(/[\\/]/g, path.sep),
    );
    this.inputChecksumQuick = options?.inputChecksumQuick ?? false;
    this.inputChecksumMin = options?.inputChecksumMin;
    this.inputChecksumMax = options?.inputChecksumMax;
    this.inputChecksumArchives = options?.inputChecksumArchives;

    this.dat = (options?.dat ?? []).map((filePath) => filePath.replace(/[\\/]/g, path.sep));
    this.datExclude = (options?.datExclude ?? []).map((filePath) =>
      filePath.replace(/[\\/]/g, path.sep),
    );
    this.datNameRegex = options?.datNameRegex ?? '';
    this.datNameRegexExclude = options?.datNameRegexExclude ?? '';
    this.datDescriptionRegex = options?.datDescriptionRegex ?? '';
    this.datDescriptionRegexExclude = options?.datDescriptionRegexExclude ?? '';
    this.datCombine = options?.datCombine ?? false;
    this.datIgnoreParentClone = options?.datIgnoreParentClone ?? false;

    this.patch = (options?.patch ?? []).map((filePath) => filePath.replace(/[\\/]/g, path.sep));
    this.patchExclude = (options?.patchExclude ?? []).map((filePath) =>
      filePath.replace(/[\\/]/g, path.sep),
    );

    this.output = options?.output?.replace(/[\\/]/g, path.sep);
    this.dirMirror = options?.dirMirror ?? false;
    this.dirDatName = options?.dirDatName ?? false;
    this.dirDatDescription = options?.dirDatDescription ?? false;
    this.dirLetter = options?.dirLetter ?? false;
    this.dirLetterCount = options?.dirLetterCount ?? 0;
    this.dirLetterLimit = options?.dirLetterLimit ?? 0;
    this.dirLetterGroup = options?.dirLetterGroup ?? false;
    this.dirGameSubdir = options?.dirGameSubdir;

    this.fixExtension = options?.fixExtension;
    this.overwrite = options?.overwrite ?? false;
    this.overwriteInvalid = options?.overwriteInvalid ?? false;

    this.cleanExclude = (options?.cleanExclude ?? []).map((filePath) =>
      filePath.replace(/[\\/]/g, path.sep),
    );
    this.cleanBackup = options?.cleanBackup?.replace(/[\\/]/g, path.sep);
    this.cleanDryRun = options?.cleanDryRun ?? false;

    this.zipExclude = options?.zipExclude ?? '';
    this.zipDatName = options?.zipDatName ?? false;

    this.symlink = options?.symlink ?? false;
    this.symlinkRelative = options?.symlinkRelative ?? false;

    this.header = options?.header ?? '';
    this.removeHeaders = options?.removeHeaders;

    this.mergeRoms = options?.mergeRoms;
    this.excludeDisks = options?.excludeDisks ?? false;
    this.allowExcessSets = options?.allowExcessSets ?? false;
    this.allowIncompleteSets = options?.allowIncompleteSets ?? false;

    this.filterRegex = options?.filterRegex ?? '';
    this.filterRegexExclude = options?.filterRegexExclude ?? '';
    this.filterLanguage = options?.filterLanguage ?? [];
    this.filterRegion = options?.filterRegion ?? [];
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
    this.preferRevision = options?.preferRevision;
    this.preferRetail = options?.preferRetail ?? false;
    this.preferParent = options?.preferParent ?? false;

    this.dir2datOutput = options?.dir2datOutput?.replace(/[\\/]/g, path.sep);

    this.fixdatOutput = options?.fixdatOutput?.replace(/[\\/]/g, path.sep);

    this.reportOutput = (options?.reportOutput ?? process.cwd()).replace(/[\\/]/g, path.sep);

    this.datThreads = Math.max(options?.datThreads ?? 0, 1);
    this.readerThreads = Math.max(options?.readerThreads ?? 0, 1);
    this.writerThreads = Math.max(options?.writerThreads ?? 0, 1);
    this.writeRetry = Math.max(options?.writeRetry ?? 0, 0);
    this.tempDir = (options?.tempDir ?? Temp.getTempDir()).replace(/[\\/]/g, path.sep);
    this.disableCache = options?.disableCache ?? false;
    this.cachePath = options?.cachePath;
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
   * Return an object of all options.
   */
  toObject(): { [key: string]: unknown } {
    return instanceToPlain(this);
  }

  /**
   * Return a JSON representation of all options.
   */
  toString(): string {
    return JSON.stringify(this.toObject());
  }

  // Helpers

  private static getRegex(pattern: string): RegExp[] | undefined {
    if (!pattern.trim()) {
      return undefined;
    }

    return pattern
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
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
    return ['copy', 'move', 'link'].find((command) => this.getCommands().has(command));
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
   * Should a given ROM be extracted?
   */
  shouldExtractRom(rom: ROM): boolean {
    if (rom instanceof Disk) {
      return false;
    }
    return this.shouldExtract();
  }

  /**
   * Was the `zip` command provided?
   */
  shouldZip(): boolean {
    return this.getCommands().has('zip');
  }

  /**
   * Should a given output file path be zipped?
   */
  shouldZipRom(rom: ROM): boolean {
    if (rom instanceof Disk) {
      return false;
    }

    return (
      this.shouldZip() &&
      (!this.getZipExclude() ||
        !micromatch.isMatch(rom.getName().replace(/^.[\\/]/, ''), this.getZipExclude()))
    );
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
    return this.getCommands().has('fixdat');
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
    return Options.scanPaths(
      this.input,
      walkCallback,
      this.shouldWrite() || !(this.shouldReport() || this.shouldFixdat()),
    );
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
    return inputFiles.filter((inputPath) => !inputExcludeFiles.has(inputPath));
  }

  private static async scanPaths(
    globPatterns: string[],
    walkCallback?: FsWalkCallback,
    requireFiles = true,
  ): Promise<string[]> {
    // Limit to scanning one glob pattern at a time to keep memory in check
    const uniqueGlobPatterns = globPatterns.reduce(ArrayPoly.reduceUnique(), []);
    let globbedPaths: string[] = [];
    for (const uniqueGlobPattern of uniqueGlobPatterns) {
      const paths = await this.globPath(uniqueGlobPattern, walkCallback ?? ((): void => {}));
      // NOTE(cemmer): if `paths` is really large, `globbedPaths.push(...paths)` can hit a stack
      // size limit
      globbedPaths = [...globbedPaths, ...paths];
    }

    // Filter to non-directories
    const isNonDirectory = await async.mapLimit(
      globbedPaths,
      Defaults.MAX_FS_THREADS,
      async (file: string): Promise<boolean> => {
        if (!(await FsPoly.exists(file)) && URLPoly.canParse(file)) {
          // Treat URLs as files (and not directories)
          return true;
        }

        try {
          return !(await FsPoly.isDirectory(file));
        } catch {
          // Assume errors mean the path doesn't exist
          return false;
        }
      },
    );
    const globbedFiles = globbedPaths
      .filter((inputPath, idx) => isNonDirectory[idx])
      .filter((inputPath) => isNotJunk(path.basename(inputPath)));

    if (requireFiles && globbedFiles.length === 0) {
      throw new ExpectedError(
        `no files found in director${globPatterns.length !== 1 ? 'ies' : 'y'}: ${globPatterns.map((p) => `'${p}'`).join(', ')}`,
      );
    }

    // Remove duplicates
    return globbedFiles.reduce(ArrayPoly.reduceUnique(), []);
  }

  private static async globPath(
    inputPath: string,
    walkCallback: FsWalkCallback,
  ): Promise<string[]> {
    // Windows will report that \\.\nul doesn't exist, catch it explicitly
    if (inputPath === os.devNull || inputPath.startsWith(os.devNull + path.sep)) {
      return [];
    }

    // Glob the contents of directories
    if (await FsPoly.isDirectory(inputPath)) {
      return FsPoly.walk(inputPath, walkCallback);
    }

    // If the file exists, don't process it as a glob pattern
    if (await FsPoly.exists(inputPath)) {
      walkCallback(1);
      return [inputPath];
    }

    // fg only uses forward-slash path separators
    const inputPathNormalized = inputPath.replace(/\\/g, '/');
    // Try to handle globs a little more intelligently (see the JSDoc below)
    const inputPathEscaped = await this.sanitizeGlobPattern(inputPathNormalized);

    if (!inputPathEscaped) {
      // fast-glob will throw with empty-ish inputs
      return [];
    }

    // Otherwise, process it as a glob pattern
    const globbedPaths = await fg(inputPathEscaped, { onlyFiles: true });
    if (globbedPaths.length === 0) {
      if (URLPoly.canParse(inputPath)) {
        // Allow URLs, let the scanner modules deal with them
        walkCallback(1);
        return [inputPath];
      }
      return [];
    }
    walkCallback(globbedPaths.length);
    if (process.platform === 'win32') {
      return globbedPaths.map((globbedPath) => globbedPath.replace(/[\\/]/g, path.sep));
    }
    return globbedPaths;
  }

  /**
   * Trying to use globs with directory names that resemble glob patterns (e.g. dirs that include
   * parentheticals) is problematic. Most of the time globs are at the tail end of the path, so try
   * to figure out what leading part of the pattern is just a path, and escape it appropriately,
   * and then tack on the glob at the end.
   * Example problematic paths:
   * ./TOSEC - DAT Pack - Complete (3983) (TOSEC-v2023-07-10)/TOSEC-ISO/Sega*
   */
  private static async sanitizeGlobPattern(globPattern: string): Promise<string> {
    const pathsSplit = globPattern.split(/[\\/]/);
    for (let i = 0; i < pathsSplit.length; i += 1) {
      const subPath = pathsSplit.slice(0, i + 1).join('/');
      if (subPath !== '' && !(await FsPoly.exists(subPath))) {
        const dirname = pathsSplit.slice(0, i).join('/');
        if (dirname === '') {
          // fg won't let you escape empty strings
          return pathsSplit.slice(i).join('/');
        }
        return `${fg.escapePath(dirname)}/${pathsSplit.slice(i).join('/')}`;
      }
    }
    return globPattern;
  }

  getInputChecksumQuick(): boolean {
    return this.inputChecksumQuick;
  }

  getInputChecksumMin(): ChecksumBitmask | undefined {
    const checksumBitmask = Object.keys(ChecksumBitmask).find(
      (bitmask) => bitmask.toUpperCase() === this.inputChecksumMin?.toUpperCase(),
    );
    if (!checksumBitmask) {
      return undefined;
    }
    return ChecksumBitmask[checksumBitmask as keyof typeof ChecksumBitmask];
  }

  getInputChecksumMax(): ChecksumBitmask | undefined {
    const checksumBitmask = Object.keys(ChecksumBitmask).find(
      (bitmask) => bitmask.toUpperCase() === this.inputChecksumMax?.toUpperCase(),
    );
    if (!checksumBitmask) {
      return undefined;
    }
    return ChecksumBitmask[checksumBitmask as keyof typeof ChecksumBitmask];
  }

  getInputChecksumArchives(): InputChecksumArchivesMode | undefined {
    const checksumMode = Object.keys(InputChecksumArchivesMode).find(
      (mode) => mode.toLowerCase() === this.inputChecksumArchives?.toLowerCase(),
    );
    if (!checksumMode) {
      return undefined;
    }
    return InputChecksumArchivesMode[checksumMode as keyof typeof InputChecksumArchivesMode];
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
    return datFiles.filter((inputPath) => !datExcludeFiles.has(inputPath));
  }

  getDatNameRegex(): RegExp[] | undefined {
    return Options.getRegex(this.datNameRegex);
  }

  getDatNameRegexExclude(): RegExp[] | undefined {
    return Options.getRegex(this.datNameRegexExclude);
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

  getPatchFileCount(): number {
    return this.patch.length;
  }

  /**
   * Scan for patch files, and patch files to exclude, and return the difference.
   */
  async scanPatchFilesWithoutExclusions(walkCallback?: FsWalkCallback): Promise<string[]> {
    const patchFiles = await this.scanPatchFiles(walkCallback);
    const patchExcludeFiles = new Set(await this.scanPatchExcludeFiles());
    return patchFiles.filter((patchPath) => !patchExcludeFiles.has(patchPath));
  }

  private async scanPatchFiles(walkCallback?: FsWalkCallback): Promise<string[]> {
    return Options.scanPaths(this.patch, walkCallback);
  }

  private async scanPatchExcludeFiles(): Promise<string[]> {
    return Options.scanPaths(this.patchExclude, undefined, false);
  }

  getOutput(): string {
    return this.output ?? (this.shouldWrite() ? '' : this.getTempDir());
  }

  /**
   * Get the "root" sub-path of the output dir, the sub-path up until the first replaceable token.
   */
  getOutputDirRoot(): string {
    const outputSplit = this.getOutput().split(/[\\/]/);
    for (let i = 0; i < outputSplit.length; i += 1) {
      if (outputSplit[i].match(/\{[a-zA-Z]+\}/) !== null) {
        return outputSplit.slice(0, i).join(path.sep);
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
    const subdirMode = Object.keys(GameSubdirMode).find(
      (mode) => mode.toLowerCase() === this.dirGameSubdir?.toLowerCase(),
    );
    if (!subdirMode) {
      return undefined;
    }
    return GameSubdirMode[subdirMode as keyof typeof GameSubdirMode];
  }

  getFixExtension(): FixExtension | undefined {
    const fixExtensionMode = Object.keys(FixExtension).find(
      (mode) => mode.toLowerCase() === this.fixExtension?.toLowerCase(),
    );
    if (!fixExtensionMode) {
      return undefined;
    }
    return FixExtension[fixExtensionMode as keyof typeof FixExtension];
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
    const writtenFilesNormalized = new Set(
      writtenFiles.map((file) => path.normalize(file.getFilePath())),
    );

    // Files excluded from cleaning
    const cleanExcludedFilesNormalized = new Set(
      (await this.scanCleanExcludeFiles()).map((filePath) => path.normalize(filePath)),
    );

    return (await Options.scanPaths(outputDirs, walkCallback, false))
      .filter((filePath) => !writtenFilesNormalized.has(filePath))
      .filter((filePath) => !cleanExcludedFilesNormalized.has(filePath))
      .sort();
  }

  getCleanBackup(): string | undefined {
    return this.cleanBackup;
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
    return (
      this.getHeader().length > 0 &&
      micromatch.isMatch(filePath.replace(/^.[\\/]/, ''), this.getHeader())
    );
  }

  /**
   * Can the {@link Header} be removed for a {@link extension} during writing?
   */
  canRemoveHeader(extension: string): boolean {
    if (this.removeHeaders === undefined) {
      // Option wasn't provided, we shouldn't remove headers
      return false;
    }
    if (this.removeHeaders.length === 1 && this.removeHeaders[0] === '') {
      // Option was provided without any extensions, we should remove headers from every file
      return true;
    }
    // Option was provided with extensions, we should remove headers on name match
    return this.removeHeaders.some(
      (removeHeader) => removeHeader.toLowerCase() === extension.toLowerCase(),
    );
  }

  getMergeRoms(): MergeMode | undefined {
    const mergeMode = Object.keys(MergeMode).find(
      (mode) => mode.toLowerCase() === this.mergeRoms?.toLowerCase(),
    );
    if (!mergeMode) {
      return undefined;
    }
    return MergeMode[mergeMode as keyof typeof MergeMode];
  }

  getExcludeDisks(): boolean {
    return this.excludeDisks;
  }

  getAllowExcessSets(): boolean {
    return this.allowExcessSets;
  }

  getAllowIncompleteSets(): boolean {
    return this.allowIncompleteSets;
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
    return new Set();
  }

  getFilterRegion(): Set<string> {
    if (this.filterRegion.length > 0) {
      return new Set(Options.filterUniqueUpper(this.filterRegion));
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

  getPreferRevision(): PreferRevision | undefined {
    const preferRevision = Object.keys(PreferRevision).find(
      (mode) => mode.toLowerCase() === this.preferRevision?.toLowerCase(),
    );
    if (!preferRevision) {
      return undefined;
    }
    return PreferRevision[preferRevision as keyof typeof PreferRevision];
  }

  getPreferRetail(): boolean {
    return this.preferRetail;
  }

  getPreferParent(): boolean {
    return this.preferParent;
  }

  getDir2DatOutput(): string {
    return FsPoly.makeLegal(
      this.dir2datOutput ?? (this.shouldWrite() ? this.getOutputDirRoot() : process.cwd()),
    );
  }

  getFixdatOutput(): string {
    return FsPoly.makeLegal(
      this.fixdatOutput ?? (this.shouldWrite() ? this.getOutputDirRoot() : process.cwd()),
    );
  }

  getReportOutput(): string {
    let { reportOutput } = this;

    // Replace date & time tokens
    const symbolMatches = reportOutput.match(/%([a-zA-Z])(\1|o)*/g);
    if (symbolMatches) {
      symbolMatches.reduce(ArrayPoly.reduceUnique(), []).forEach((match) => {
        const val = moment().format(match.replace(/^%/, ''));
        reportOutput = reportOutput.replace(match, val);
      });
    }

    return FsPoly.makeLegal(reportOutput);
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

  getWriteRetry(): number {
    return this.writeRetry;
  }

  getTempDir(): string {
    return this.tempDir;
  }

  getDisableCache(): boolean {
    return this.disableCache;
  }

  getCachePath(): string | undefined {
    return this.cachePath;
  }

  getLogLevel(): LogLevel {
    if (this.verbose === 1) {
      return LogLevel.INFO;
    }
    if (this.verbose === 2) {
      return LogLevel.DEBUG;
    }
    if (this.verbose >= 3) {
      return LogLevel.TRACE;
    }
    return LogLevel.WARN;
  }

  getHelp(): boolean {
    return this.help;
  }

  private static filterUniqueUpper(array: string[]): string[] {
    return array.map((value) => value.toUpperCase()).reduce(ArrayPoly.reduceUnique(), []);
  }
}
