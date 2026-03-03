import 'reflect-metadata';

import os from 'node:os';
import path from 'node:path';

import { Expose, instanceToPlain, plainToInstance } from 'class-transformer';
import fg from 'fast-glob';
import micromatch from 'micromatch';
import moment from 'moment';

import { LogLevel, LogLevelValue } from '../console/logLevel.js';
import Temp from '../globals/temp.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import FsPoly, { FsWalkCallback, WalkMode, WalkModeValue } from '../polyfill/fsPoly.js';
import URLPoly from '../polyfill/urlPoly.js';
import Disk from './dats/disk.js';
import ROM from './dats/rom.js';
import IgirException from './exceptions/igirException.js';
import File from './files/file.js';
import {
  ChecksumBitmask,
  ChecksumBitmaskKey,
  ChecksumBitmaskValue,
} from './files/fileChecksums.js';

export const InputChecksumArchivesMode = {
  // Never calculate the checksum of archive files
  NEVER: 1,
  // Calculate the checksum of archive files if DATs reference archives
  AUTO: 2,
  // Always calculate the checksum of archive files
  ALWAYS: 3,
} as const;
export type InputChecksumArchivesModeKey = keyof typeof InputChecksumArchivesMode;
export type InputChecksumArchivesModeValue =
  (typeof InputChecksumArchivesMode)[InputChecksumArchivesModeKey];
export const InputChecksumArchivesModeInverted = Object.fromEntries(
  Object.entries(InputChecksumArchivesMode).map(([key, value]) => [value, key]),
) as Record<InputChecksumArchivesModeValue, InputChecksumArchivesModeKey>;

export const LinkMode = {
  // Create hard links to the original files
  HARDLINK: 1,
  // Create symbolic links to the original files
  SYMLINK: 2,
  // Create copy-on-write links to the original files
  REFLINK: 3,
} as const;
export type LinkModeKey = keyof typeof LinkMode;
export type LinkModeValue = (typeof LinkMode)[keyof typeof LinkMode];
export const LinkModeInverted = Object.fromEntries(
  Object.entries(LinkMode).map(([key, value]) => [value, key]),
) as Record<LinkModeValue, LinkModeKey>;

export const MergeMode = {
  // Clones contain all parent ROMs, all games contain BIOS & device ROMs
  FULLNONMERGED: 1,
  // Clones contain all parent ROMs, BIOS & device ROMsets are separate
  NONMERGED: 2,
  // Clones exclude all parent ROMs, BIOS & device ROMsets are separate
  SPLIT: 3,
  // Clones are merged into parent, BIOS & device ROMsets are separate
  MERGED: 4,
} as const;
export type MergeModeKey = keyof typeof MergeMode;
export type MergeModeValue = (typeof MergeMode)[MergeModeKey];
export const MergeModeInverted = Object.fromEntries(
  Object.entries(MergeMode).map(([key, value]) => [value, key]),
) as Record<MergeModeValue, MergeModeKey>;

export const GameSubdirMode = {
  // Never add the Game name as a subdirectory
  NEVER: 1,
  // Add the Game name as a subdirectory if it has multiple output files
  MULTIPLE: 2,
  // Always add the Game name as a subdirectory
  ALWAYS: 3,
} as const;
export type GameSubdirModeKey = keyof typeof GameSubdirMode;
export type GameSubdirModeValue = (typeof GameSubdirMode)[GameSubdirModeKey];
export const GameSubdirModeInverted = Object.fromEntries(
  Object.entries(GameSubdirMode).map(([key, value]) => [value, key]),
) as Record<GameSubdirModeValue, GameSubdirModeKey>;

export const FixExtension = {
  NEVER: 1,
  AUTO: 2,
  ALWAYS: 3,
} as const;
export type FixExtensionKey = keyof typeof FixExtension;
export type FixExtensionValue = (typeof FixExtension)[FixExtensionKey];
export const FixExtensionInverted = Object.fromEntries(
  Object.entries(FixExtension).map(([key, value]) => [value, key]),
) as Record<FixExtensionValue, FixExtensionKey>;

export const MoveDeleteDirs = {
  NEVER: 1,
  AUTO: 2,
  ALWAYS: 3,
} as const;
export type MoveDeleteDirsKey = keyof typeof MoveDeleteDirs;
export type MoveDeleteDirsValue = (typeof MoveDeleteDirs)[MoveDeleteDirsKey];
export const MoveDeleteDirsInverted = Object.fromEntries(
  Object.entries(MoveDeleteDirs).map(([key, value]) => [value, key]),
) as Record<MoveDeleteDirsValue, MoveDeleteDirsKey>;

export const TrimScanFiles = {
  // Never scan any files for trimming detection
  NEVER: 1,
  // Scan files with a known trimmable signature (default)
  AUTO: 2,
  // Scan all non-archive files regardless of signature
  ALWAYS: 3,
} as const;
export type TrimScanFilesKey = keyof typeof TrimScanFiles;
export type TrimScanFilesValue = (typeof TrimScanFiles)[TrimScanFilesKey];
export const TrimScanFilesInverted = Object.fromEntries(
  Object.entries(TrimScanFiles).map(([key, value]) => [value, key]),
) as Record<TrimScanFilesValue, TrimScanFilesKey>;

export const PreferRevision = {
  OLDER: 1,
  NEWER: 2,
} as const;
export type PreferRevisionKey = keyof typeof PreferRevision;
export type PreferRevisionValue = (typeof PreferRevision)[PreferRevisionKey];
export const PreferRevisionInverted = Object.fromEntries(
  Object.entries(PreferRevision).map(([key, value]) => [value, key]),
) as Record<PreferRevisionValue, PreferRevisionKey>;

export const ZipFormat = {
  TORRENTZIP: 'TORRENTZIP',
  RVZSTD: 'RVZSTD',
} as const;
export type ZipFormatKey = keyof typeof ZipFormat;
export type ZipFormatValue = (typeof ZipFormat)[ZipFormatKey];
export const ZipFormatInverted = Object.fromEntries(
  Object.entries(ZipFormat).map(([key, value]) => [value, key]),
) as Record<ZipFormatValue, ZipFormatKey>;

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
  readonly patchOnly?: boolean;

  readonly output?: string;
  readonly dirMirror?: boolean;
  readonly dirDatMirror?: boolean;
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

  readonly moveDeleteDirs?: string;

  readonly cleanExclude?: string[];
  readonly cleanBackup?: string;
  readonly cleanDryRun?: boolean;

  readonly zipFormat?: string;
  readonly zipExclude?: string;
  readonly zipDatName?: boolean;

  readonly linkMode?: string;
  readonly symlinkRelative?: boolean;

  readonly header?: string;
  readonly removeHeaders?: string[];

  readonly trimmedGlob?: string;
  readonly trimScanFiles?: string;
  readonly trimScanArchives?: boolean;

  readonly mergeRoms?: string;
  readonly mergeDiscs?: boolean;
  readonly excludeDisks?: boolean;
  readonly allowExcessSets?: boolean;
  readonly allowIncompleteSets?: boolean;

  readonly filterRegex?: string;
  readonly filterRegexExclude?: string;
  readonly filterLanguage?: string[];
  readonly filterRegion?: string[];
  readonly filterCategoryRegex?: string;
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

  readonly playlistExtensions?: string[];

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

  readonly datNameRegex?: string;

  readonly datNameRegexExclude?: string;

  readonly datDescriptionRegex?: string;

  readonly datDescriptionRegexExclude?: string;

  readonly datCombine: boolean;

  readonly datIgnoreParentClone: boolean;

  readonly patch: string[];

  readonly patchExclude: string[];

  readonly patchOnly: boolean;

  readonly output?: string;

  readonly dirMirror: boolean;

  readonly dirDatMirror: boolean;

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

  readonly moveDeleteDirs?: string;

  readonly cleanExclude: string[];

  readonly cleanBackup?: string;

  readonly cleanDryRun: boolean;

  readonly zipFormat?: string;

  readonly zipExclude: string;

  readonly zipDatName: boolean;

  readonly linkMode?: string;

  readonly symlinkRelative: boolean;

  readonly header?: string;

  readonly removeHeaders?: string[];

  readonly trimmedGlob?: string;

  readonly trimScanFiles?: string;

  readonly trimScanArchives: boolean;

  readonly mergeRoms?: string;

  readonly mergeDiscs: boolean;

  readonly excludeDisks: boolean;

  readonly allowExcessSets: boolean;

  readonly allowIncompleteSets: boolean;

  readonly filterRegex?: string;

  readonly filterRegexExclude?: string;

  readonly filterLanguage: string[];

  readonly filterRegion: string[];

  readonly filterCategoryRegex?: string;

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

  readonly preferGameRegex?: string;

  readonly preferRomRegex?: string;

  readonly preferVerified: boolean;

  readonly preferGood: boolean;

  readonly preferLanguage: string[];

  readonly preferRegion: string[];

  readonly preferRevision?: string;

  readonly preferRetail: boolean;

  readonly preferParent: boolean;

  readonly playlistExtensions: string[];

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

    this.input = (options?.input ?? []).map((filePath) => filePath.replaceAll(/[\\/]/g, path.sep));
    this.inputExclude = (options?.inputExclude ?? []).map((filePath) =>
      filePath.replaceAll(/[\\/]/g, path.sep),
    );
    this.inputChecksumQuick = options?.inputChecksumQuick ?? false;
    this.inputChecksumMin = options?.inputChecksumMin;
    this.inputChecksumMax = options?.inputChecksumMax;
    this.inputChecksumArchives = options?.inputChecksumArchives;

    this.dat = (options?.dat ?? []).map((filePath) => filePath.replaceAll(/[\\/]/g, path.sep));
    this.datExclude = (options?.datExclude ?? []).map((filePath) =>
      filePath.replaceAll(/[\\/]/g, path.sep),
    );
    this.datNameRegex = options?.datNameRegex;
    this.datNameRegexExclude = options?.datNameRegexExclude;
    this.datDescriptionRegex = options?.datDescriptionRegex;
    this.datDescriptionRegexExclude = options?.datDescriptionRegexExclude;
    this.datCombine = options?.datCombine ?? false;
    this.datIgnoreParentClone = options?.datIgnoreParentClone ?? false;

    this.patch = (options?.patch ?? []).map((filePath) => filePath.replaceAll(/[\\/]/g, path.sep));
    this.patchExclude = (options?.patchExclude ?? []).map((filePath) =>
      filePath.replaceAll(/[\\/]/g, path.sep),
    );
    this.patchOnly = options?.patchOnly ?? false;

    this.output = options?.output?.replaceAll(/[\\/]/g, path.sep);
    this.dirMirror = options?.dirMirror ?? false;
    this.dirDatMirror = options?.dirDatMirror ?? false;
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

    this.moveDeleteDirs = options?.moveDeleteDirs;

    this.cleanExclude = (options?.cleanExclude ?? []).map((filePath) =>
      filePath.replaceAll(/[\\/]/g, path.sep),
    );
    this.cleanBackup = options?.cleanBackup?.replaceAll(/[\\/]/g, path.sep);
    this.cleanDryRun = options?.cleanDryRun ?? false;

    this.zipFormat = options?.zipFormat;
    this.zipExclude = options?.zipExclude ?? '';
    this.zipDatName = options?.zipDatName ?? false;

    this.linkMode = options?.linkMode;
    this.symlinkRelative = options?.symlinkRelative ?? false;

    this.header = options?.header;
    this.removeHeaders = options?.removeHeaders;

    this.trimmedGlob = options?.trimmedGlob;
    this.trimScanFiles = options?.trimScanFiles;
    this.trimScanArchives = options?.trimScanArchives ?? false;

    this.mergeRoms = options?.mergeRoms;
    this.mergeDiscs = options?.mergeDiscs ?? false;
    this.excludeDisks = options?.excludeDisks ?? false;
    this.allowExcessSets = options?.allowExcessSets ?? false;
    this.allowIncompleteSets = options?.allowIncompleteSets ?? false;

    this.filterRegex = options?.filterRegex;
    this.filterRegexExclude = options?.filterRegexExclude;
    this.filterLanguage = options?.filterLanguage ?? [];
    this.filterRegion = options?.filterRegion ?? [];
    this.filterCategoryRegex = options?.filterCategoryRegex;
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
    this.preferGameRegex = options?.preferGameRegex;
    this.preferRomRegex = options?.preferRomRegex;
    this.preferVerified = options?.preferVerified ?? false;
    this.preferGood = options?.preferGood ?? false;
    this.preferLanguage = options?.preferLanguage ?? [];
    this.preferRegion = options?.preferRegion ?? [];
    this.preferRevision = options?.preferRevision;
    this.preferRetail = options?.preferRetail ?? false;
    this.preferParent = options?.preferParent ?? false;

    this.playlistExtensions = options?.playlistExtensions ?? [];

    this.dir2datOutput = options?.dir2datOutput?.replaceAll(/[\\/]/g, path.sep);

    this.fixdatOutput = options?.fixdatOutput?.replaceAll(/[\\/]/g, path.sep);

    this.reportOutput = (options?.reportOutput ?? process.cwd()).replaceAll(/[\\/]/g, path.sep);

    this.datThreads = Math.max(options?.datThreads ?? 0, 1);
    this.readerThreads = Math.max(options?.readerThreads ?? 0, 1);
    this.writerThreads = Math.max(options?.writerThreads ?? 0, 1);
    this.writeRetry = Math.max(options?.writeRetry ?? 0, 0);
    this.tempDir = (options?.tempDir ?? Temp.getTempDir()).replaceAll(/[\\/]/g, path.sep);
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
  toObject(): Record<string, unknown> {
    return instanceToPlain(this);
  }

  /**
   * Return a JSON representation of all options.
   */
  toString(): string {
    return JSON.stringify(this.toObject());
  }

  // Helpers

  private static getRegex(pattern: string | undefined): RegExp[] | undefined {
    if (!pattern?.trim()) {
      return undefined;
    }

    return pattern
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map((line) => {
        const flagsMatch = /^\/(.+)\/([a-z]*)$/.exec(line);
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
   * Was the 'playlist' command provided?
   */
  shouldPlaylist(): boolean {
    return this.getCommands().has('playlist');
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

  /**
   * Scan for input files, and input files to exclude, and return the difference.
   */
  async scanInputFilesWithoutExclusions(walkCallback?: FsWalkCallback): Promise<string[]> {
    return await Options.scanPathsWithoutExclusions(
      this.input,
      this.inputExclude,
      WalkMode.FILES,
      walkCallback,
      this.shouldWrite() || !(this.shouldReport() || this.shouldFixdat()),
    );
  }

  /**
   * Scan for subdirectories in the input paths.
   */
  async scanInputSubdirectories(walkCallback?: FsWalkCallback): Promise<string[]> {
    return await Options.scanPaths(this.input, WalkMode.DIRECTORIES, walkCallback, false);
  }

  /**
   * Scan for files or directories given some glob patterns.
   */
  static async scanPaths(
    globPatterns: string[],
    walkMode: WalkModeValue,
    walkCallback?: FsWalkCallback,
    requireFiles = true,
  ): Promise<string[]> {
    // Limit to scanning one glob pattern at a time to keep memory in check
    const uniqueGlobPatterns = globPatterns.reduce(ArrayPoly.reduceUnique(), []);
    let globbedPaths: string[] = [];
    for (const uniqueGlobPattern of uniqueGlobPatterns) {
      const paths = await this.globPath(uniqueGlobPattern, walkMode, walkCallback);
      // NOTE(cemmer): if `paths` is really large, `globbedPaths.push(...paths)` can hit a stack
      // size limit
      globbedPaths = [...globbedPaths, ...paths];
    }

    if (requireFiles && globbedPaths.length === 0) {
      throw new IgirException(
        `no files found in director${globPatterns.length === 1 ? 'y' : 'ies'}: ${globPatterns.map((p) => `'${p}'`).join(', ')}`,
      );
    }

    // Remove duplicates
    return globbedPaths.reduce(ArrayPoly.reduceUnique(), []);
  }

  private static async scanPathsWithoutExclusions(
    includeGlobPatterns: string[],
    excludeGlobPatterns: string[],
    walkMode: WalkModeValue,
    walkCallback?: FsWalkCallback,
    requireIncludeFiles = true,
  ): Promise<string[]> {
    const includePaths = await this.scanPaths(
      includeGlobPatterns,
      walkMode,
      walkCallback,
      requireIncludeFiles,
    );
    const excludePaths = await this.scanPaths(excludeGlobPatterns, walkMode, undefined, false);
    const excludePathsSet = new Set(excludePaths.map((filePath) => path.resolve(filePath)));
    return includePaths.filter(
      (filePath) => excludePathsSet.size === 0 || !excludePathsSet.has(path.resolve(filePath)),
    );
  }

  private static async globPath(
    inputPath: string,
    walkMode: WalkModeValue,
    walkCallback?: FsWalkCallback,
  ): Promise<string[]> {
    // Windows will report that \\.\nul doesn't exist, catch it explicitly
    if (inputPath === os.devNull || inputPath.startsWith(os.devNull + path.sep)) {
      return [];
    }

    // Glob the contents of directories
    if (await FsPoly.isDirectory(inputPath)) {
      return await FsPoly.walk(inputPath, walkMode, walkCallback);
    }

    // If the file exists, don't process it as a glob pattern
    if (await FsPoly.exists(inputPath)) {
      if (walkCallback !== undefined) {
        walkCallback(1);
      }
      return [inputPath];
    }

    // fg only uses forward-slash path separators
    const inputPathNormalized = inputPath.replaceAll('\\', '/');
    // Try to handle globs a little more intelligently (see the JSDoc below)
    const inputPathEscaped = this.sanitizeGlobPattern(inputPathNormalized);

    if (!inputPathEscaped) {
      // fast-glob will throw with empty-ish inputs
      return [];
    }

    // Otherwise, process it as a glob pattern
    const globbedPaths = await fg(inputPathEscaped, {
      onlyFiles: walkMode === WalkMode.FILES,
      onlyDirectories: walkMode === WalkMode.DIRECTORIES,
    });
    if (globbedPaths.length === 0) {
      if (URLPoly.canParse(inputPath)) {
        // Allow URLs, let the scanner modules deal with them
        if (walkCallback !== undefined) {
          walkCallback(1);
        }
        return [inputPath];
      }
      return [];
    }
    if (walkCallback !== undefined) {
      walkCallback(globbedPaths.length);
    }
    if (path.sep !== '/') {
      return globbedPaths.map((globbedPath) => globbedPath.replaceAll(/[\\/]/g, path.sep));
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
   * ./No-Intro/Nintendo - Nintendo 64 (BigEndian)*\/**
   */
  private static sanitizeGlobPattern(globPattern: string): string {
    return (
      globPattern
        // Escape parentheticals that aren't an extglob and probably aren't a "logical OR"
        .replaceAll(/(^|[^?*+@!])\(([^|)]+)\)/g, '$1{\\(,}$2{\\),}')
        // Escape curly braces that probably aren't a brace expression
        .replaceAll(/\{([^.,}]+)\}/g, '{\\{,}$1{\\},}')
        // Escape square brackets that might not be a regular expression character class
        .replaceAll(/\[([^\]]+)\]/g, '{[$1],\\[$1\\]}')
    );
  }

  getInputChecksumQuick(): boolean {
    return this.inputChecksumQuick;
  }

  getInputChecksumMin(): ChecksumBitmaskValue | undefined {
    const checksumBitmask = Object.keys(ChecksumBitmask).find(
      (bitmask) => bitmask.toUpperCase() === this.inputChecksumMin?.toUpperCase(),
    );
    if (!checksumBitmask) {
      return undefined;
    }
    return ChecksumBitmask[checksumBitmask as ChecksumBitmaskKey];
  }

  getInputChecksumMax(): ChecksumBitmaskValue | undefined {
    const checksumBitmask = Object.keys(ChecksumBitmask).find(
      (bitmask) => bitmask.toUpperCase() === this.inputChecksumMax?.toUpperCase(),
    );
    if (!checksumBitmask) {
      return undefined;
    }
    return ChecksumBitmask[checksumBitmask as ChecksumBitmaskKey];
  }

  getInputChecksumArchives(): InputChecksumArchivesModeValue | undefined {
    const checksumMode = Object.keys(InputChecksumArchivesMode).find(
      (mode) => mode.toLowerCase() === this.inputChecksumArchives?.toLowerCase(),
    );
    if (!checksumMode) {
      return undefined;
    }
    return InputChecksumArchivesMode[checksumMode as InputChecksumArchivesModeKey];
  }

  /**
   * Were any DAT paths provided?
   */
  usingDats(): boolean {
    return this.dat.length > 0;
  }

  getDatPaths(): string[] {
    return this.dat;
  }

  /**
   * Scan for DAT files, and DAT files to exclude, and return the difference.
   */
  async scanDatFilesWithoutExclusions(walkCallback?: FsWalkCallback): Promise<string[]> {
    return await Options.scanPathsWithoutExclusions(
      this.dat,
      this.datExclude,
      WalkMode.FILES,
      walkCallback,
    );
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
    return await Options.scanPathsWithoutExclusions(
      this.patch,
      this.patchExclude,
      WalkMode.FILES,
      walkCallback,
    );
  }

  getPatchOnly(): boolean {
    return this.patchOnly;
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
      if (/\{[a-zA-Z]+\}/.test(outputSplit[i])) {
        return outputSplit.slice(0, i).join(path.sep);
      }
    }
    return outputSplit.join(path.sep);
  }

  getDirMirror(): boolean {
    return this.dirMirror;
  }

  getDirDatMirror(): boolean {
    return this.dirDatMirror;
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

  getDirGameSubdir(): GameSubdirModeValue | undefined {
    const subdirMode = Object.keys(GameSubdirMode).find(
      (mode) => mode.toLowerCase() === this.dirGameSubdir?.toLowerCase(),
    );
    if (!subdirMode) {
      return undefined;
    }
    return GameSubdirMode[subdirMode as GameSubdirModeKey];
  }

  getFixExtension(): FixExtensionValue | undefined {
    const fixExtensionMode = Object.keys(FixExtension).find(
      (mode) => mode.toLowerCase() === this.fixExtension?.toLowerCase(),
    );
    if (!fixExtensionMode) {
      return undefined;
    }
    return FixExtension[fixExtensionMode as FixExtensionKey];
  }

  getOverwrite(): boolean {
    return this.overwrite;
  }

  getOverwriteInvalid(): boolean {
    return this.overwriteInvalid;
  }

  getMoveDeleteDirs(): MoveDeleteDirsValue | undefined {
    const moveDeleteDirsMode = Object.keys(MoveDeleteDirs).find(
      (mode) => mode.toLowerCase() === this.moveDeleteDirs?.toLowerCase(),
    );
    if (!moveDeleteDirsMode) {
      return undefined;
    }
    return MoveDeleteDirs[moveDeleteDirsMode as MoveDeleteDirsKey];
  }

  private async scanCleanExcludeFiles(): Promise<string[]> {
    return await Options.scanPaths(this.cleanExclude, WalkMode.FILES, undefined, false);
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

    return (await Options.scanPaths(outputDirs, WalkMode.FILES, walkCallback, false))
      .filter(
        (filePath) =>
          !writtenFilesNormalized.has(filePath) && !cleanExcludedFilesNormalized.has(filePath),
      )
      .toSorted();
  }

  getCleanBackup(): string | undefined {
    return this.cleanBackup;
  }

  getCleanDryRun(): boolean {
    return this.cleanDryRun;
  }

  getZipFormat(): ZipFormatValue | undefined {
    const zipFormat = Object.keys(ZipFormat).find(
      (mode) => mode.toLowerCase() === this.zipFormat?.toLowerCase(),
    );
    if (!zipFormat) {
      return undefined;
    }
    return ZipFormat[zipFormat as ZipFormatKey];
  }

  private getZipExclude(): string {
    return this.zipExclude;
  }

  getZipDatName(): boolean {
    return this.zipDatName;
  }

  getLinkMode(): LinkModeValue | undefined {
    const linkMode = Object.keys(LinkMode).find(
      (mode) => mode.toLowerCase() === this.linkMode?.toLowerCase(),
    );
    if (!linkMode) {
      return undefined;
    }
    return LinkMode[linkMode as LinkModeKey];
  }

  getSymlinkRelative(): boolean {
    return this.symlinkRelative;
  }

  /**
   * Should a file have its contents read to detect any {@link Header}?
   */
  shouldReadFileForHeader(filePath: string): boolean {
    return (
      this.header !== undefined &&
      this.header.length > 0 &&
      micromatch.isMatch(filePath.replace(/^.[\\/]/, ''), this.header)
    );
  }

  /**
   * Should a file have its contents read to detect any {@link ROMPadding}?
   */
  shouldReadFileForTrimming(filePath: string): boolean {
    return (
      this.trimmedGlob !== undefined &&
      this.trimmedGlob.length > 0 &&
      micromatch.isMatch(filePath.replace(/^.[\\/]/, ''), this.trimmedGlob)
    );
  }

  getTrimScanFiles(): TrimScanFilesValue | undefined {
    const trimScanFilesMode = Object.keys(TrimScanFiles).find(
      (mode) => mode.toLowerCase() === this.trimScanFiles?.toLowerCase(),
    );
    if (!trimScanFilesMode) {
      return undefined;
    }
    return TrimScanFiles[trimScanFilesMode as TrimScanFilesKey];
  }

  getTrimScanArchives(): boolean {
    return this.trimScanArchives;
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

  getMergeRoms(): MergeModeValue | undefined {
    const mergeMode = Object.keys(MergeMode).find(
      (mode) => mode.toLowerCase() === this.mergeRoms?.toLowerCase(),
    );
    if (!mergeMode) {
      return undefined;
    }
    return MergeMode[mergeMode as MergeModeKey];
  }

  getMergeDiscs(): boolean {
    return this.mergeDiscs;
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

  getFilterCategoryRegex(): RegExp[] | undefined {
    return Options.getRegex(this.filterCategoryRegex);
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

  getPreferRevision(): PreferRevisionValue | undefined {
    const preferRevision = Object.keys(PreferRevision).find(
      (mode) => mode.toLowerCase() === this.preferRevision?.toLowerCase(),
    );
    if (!preferRevision) {
      return undefined;
    }
    return PreferRevision[preferRevision as PreferRevisionKey];
  }

  getPreferRetail(): boolean {
    return this.preferRetail;
  }

  getPreferParent(): boolean {
    return this.preferParent;
  }

  getPlaylistExtensions(): string[] {
    return this.playlistExtensions;
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

  getLogLevel(): LogLevelValue {
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
