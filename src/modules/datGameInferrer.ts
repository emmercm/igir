import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import { parse } from '@gplane/cue';
import moment from 'moment';

import ProgressBar from '../console/progressBar.js';
import Package from '../globals/package.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import DAT from '../types/dats/dat.js';
import Game from '../types/dats/game.js';
import Header from '../types/dats/logiqx/header.js';
import LogiqxDAT from '../types/dats/logiqx/logiqxDat.js';
import ROM from '../types/dats/rom.js';
import Archive from '../types/files/archives/archive.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import File from '../types/files/file.js';
import Options from '../types/options.js';
import Module from './module.js';

/**
 * If no {@link DAT}s are provided, implicitly create some. A {@link DAT} will be created for every
 * subdirectory that contains files, and {@link Game}s will be named after each file's extracted
 * path (without the extension).
 */
export default class DATGameInferrer extends Module {
  private static readonly DEFAULT_DAT_NAME = Package.NAME;

  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, DATGameInferrer.name);
    this.options = options;
  }

  /**
   * Infer {@link Game}s from input files.
   */
  async infer(romFiles: File[]): Promise<DAT[]> {
    this.progressBar.logTrace(`inferring DATs for ${romFiles.length.toLocaleString()} ROM${romFiles.length !== 1 ? 's' : ''}`);

    const normalizedInputPaths = this.options.getInputPaths()
      .map((inputPath) => path.normalize(inputPath))
      // Try to strip out glob patterns
      .map((inputPath) => inputPath.replace(/([\\/][?*]+)+$/, ''));

    const inputPathsToRomFiles = romFiles.reduce((map, file) => {
      const normalizedPath = file.getFilePath().normalize();
      const matchedInputPaths = normalizedInputPaths
        // `.filter()` rather than `.find()` because a file can be found in overlapping input paths,
        // therefore it should be counted in both
        .filter((inputPath) => normalizedPath.startsWith(inputPath));
      (matchedInputPaths.length > 0 ? matchedInputPaths : [DATGameInferrer.DEFAULT_DAT_NAME])
        .forEach((inputPath) => {
          const datRomFiles = [...(map.get(inputPath) ?? []), file];
          map.set(inputPath, datRomFiles);
        });
      return map;
    }, new Map<string, File[]>());
    this.progressBar.logTrace(`inferred ${inputPathsToRomFiles.size.toLocaleString()} DAT${inputPathsToRomFiles.size !== 1 ? 's' : ''}`);

    const dats = await Promise.all([...inputPathsToRomFiles.entries()]
      .map(async ([inputPath, datRomFiles]) => this.createDAT(inputPath, datRomFiles)));

    this.progressBar.logTrace('done inferring DATs');
    return dats;
  }

  private async createDAT(inputPath: string, romFiles: File[]): Promise<DAT> {
    const datName = path.basename(inputPath);
    const date = moment().format('YYYYMMDD-HHmmss');
    const header = new Header({
      name: datName,
      description: datName,
      version: date,
      date,
      author: Package.NAME,
      url: Package.HOMEPAGE,
      comment: [
        `dir2dat generated by ${Package.NAME} v${Package.VERSION}`,
        `Input path: ${inputPath}`,
      ].join('\n'),
    });

    let remainingRomFiles = romFiles;
    let gameNamesToRomFiles: [string, File[]][] = [];

    // For each inference strategy
    const inferFunctions = [
      this.inferArchiveEntries,
      this.inferBinCueFiles,
      this.inferGdiFiles,
      this.inferRawFiles,
    ];
    for (const inferFunction of inferFunctions) {
      // Infer the games and their files)
      const result = await inferFunction.bind(this)(remainingRomFiles);

      // Update the list of results
      gameNamesToRomFiles = [...gameNamesToRomFiles, ...result];

      // Remove the consumed files from further inference
      const consumedFiles = new Set(result
        .flatMap(([, resultFiles]) => resultFiles)
        .map((file) => file.toString()));
      remainingRomFiles = remainingRomFiles.filter((file) => !consumedFiles.has(file.toString()));
    }

    const games = gameNamesToRomFiles.map(([gameName, gameRomFiles]) => {
      const roms = gameRomFiles
        .map((romFile) => new ROM({
          name: path.basename(romFile.getExtractedFilePath()),
          size: romFile.getSize(),
          crc32: romFile.getCrc32(),
          md5: romFile.getMd5(),
          sha1: romFile.getSha1(),
          sha256: romFile.getSha256(),
        }))
        .filter(ArrayPoly.filterUniqueMapped((rom) => rom.getName()));
      return new Game({
        name: gameName,
        description: gameName,
        rom: roms,
      });
    })
      // Filter out duplicate games
      .filter(ArrayPoly.filterUniqueMapped((game) => game.hashCode()));

    return new LogiqxDAT(header, games);
  }

  private static getGameName(file: File): string {
    // Assume the game name is the filename
    let fileName = file.getExtractedFilePath();
    if (file instanceof ArchiveEntry) {
      // If the file is from an archive, assume the game name is the archive's filename
      fileName = file.getArchive().getFilePath();
    }

    return path.basename(fileName)
      // Chop off the extension
      .replace(/(\.[a-z0-9]+)+$/, '')
      .trim();
  }

  private inferArchiveEntries(romFiles: File[]): [string, ArchiveEntry<Archive>[]][] {
    this.progressBar.logTrace(`inferring games from archives from ${romFiles.length.toLocaleString()} file${romFiles.length !== 1 ? 's' : ''}`);

    // For archives, assume the entire archive is one game
    const archivePathsToArchiveEntries = romFiles
      .filter((file) => file instanceof ArchiveEntry)
      .reduce((map, file) => {
        const archivePath = file.getFilePath();
        map.set(archivePath, [...(map.get(archivePath) ?? []), file]);
        return map;
      }, new Map<string, ArchiveEntry<Archive>[]>());

    const results = [...archivePathsToArchiveEntries.values()]
      .map((archiveEntries) => {
        const gameName = DATGameInferrer.getGameName(archiveEntries[0]);
        return [gameName, archiveEntries] satisfies [string, ArchiveEntry<Archive>[]];
      });

    this.progressBar.logTrace(`inferred ${results.length.toLocaleString()} games from archives`);
    return results;
  }

  private async inferBinCueFiles(romFiles: File[]): Promise<[string, File[]][]> {
    const rawFiles = romFiles.filter((file) => !(file instanceof ArchiveEntry));
    this.progressBar.logTrace(`inferring games from cue files from ${rawFiles.length.toLocaleString()} non-archive${rawFiles.length !== 1 ? 's' : ''}`);

    const rawFilePathsToFiles = rawFiles
      .reduce((map, file) => {
        map.set(file.getFilePath(), file);
        return map;
      }, new Map<string, File>());

    const results = (await Promise.all(rawFiles
      .filter((file) => file.getExtractedFilePath().toLowerCase().endsWith('.cue'))
      .map(async (cueFile): Promise<[string, File[]] | undefined> => {
        try {
          const cueData = await util.promisify(fs.readFile)(cueFile.getFilePath());

          const cueSheet = parse(cueData.toString(), {
            fatal: true,
          }).sheet;

          const binFiles = cueSheet.files
            .map((binFile) => path.join(path.dirname(cueFile.getFilePath()), binFile.name))
            .map((binFilePath) => rawFilePathsToFiles.get(binFilePath))
            .filter(ArrayPoly.filterNotNullish);

          if (binFiles.length > 0) {
            const gameName = DATGameInferrer.getGameName(cueFile);
            return [gameName, [cueFile, ...binFiles]];
          }
          return undefined;
        } catch {
          return undefined;
        }
      }))).filter(ArrayPoly.filterNotNullish);

    this.progressBar.logTrace(`inferred ${results.length.toLocaleString()} games from cue files`);
    return results;
  }

  private async inferGdiFiles(romFiles: File[]): Promise<[string, File[]][]> {
    const rawFiles = romFiles.filter((file) => !(file instanceof ArchiveEntry));
    this.progressBar.logTrace(`inferring games from gdi files from ${rawFiles.length.toLocaleString()} non-archive${rawFiles.length !== 1 ? 's' : ''}`);

    const rawFilePathsToFiles = rawFiles
      .reduce((map, file) => {
        map.set(file.getFilePath(), file);
        return map;
      }, new Map<string, File>());

    const results = (await Promise.all(rawFiles
      .filter((file) => file.getExtractedFilePath().toLowerCase().endsWith('.gdi'))
      .map(async (gdiFile): Promise<[string, File[]] | undefined> => {
        try {
          const cueData = await util.promisify(fs.readFile)(gdiFile.getFilePath());

          const { name: filePrefix } = path.parse(gdiFile.getFilePath());
          const gdiContents = `${cueData.toString()
            .split(/\r?\n/)
            .filter((line) => line)
            // Replace the chdman-generated track files with TOSEC-style track filenames
            .map((line) => line
              .replace(filePrefix, 'track')
              .replace(/"/g, ''))
            .join('\r\n')}\r\n`;

          const trackFilePaths = gdiContents.trim()
            .split(/\r?\n/)
            .slice(1)
            .map((line) => line.split(' ')[4]);
          const trackFiles = trackFilePaths
            .map((trackFilePath) => path.join(path.dirname(gdiFile.getFilePath()), trackFilePath))
            .map((trackFilePath) => rawFilePathsToFiles.get(trackFilePath))
            .filter(ArrayPoly.filterNotNullish);

          if (trackFiles.length > 0) {
            const gameName = DATGameInferrer.getGameName(gdiFile);
            return [gameName, [gdiFile, ...trackFiles]];
          }
          return undefined;
        } catch {
          return undefined;
        }
      }))).filter(ArrayPoly.filterNotNullish);

    this.progressBar.logTrace(`inferred ${results.length.toLocaleString()} games from cue files`);
    return results;
  }

  private inferRawFiles(romFiles: File[]): [string, File[]][] {
    this.progressBar.logTrace(`inferring games from raw files from ${romFiles.length.toLocaleString()} file${romFiles.length !== 1 ? 's' : ''}`);

    const results = romFiles
      .filter((file) => !(file instanceof ArchiveEntry))
      .reduce((map, file) => {
        const gameName = DATGameInferrer.getGameName(file);
        map.set(gameName, [...(map.get(gameName) ?? []), file]);
        return map;
      }, new Map<string, File[]>());

    this.progressBar.logTrace(`inferred ${results.size.toLocaleString()} games from raw files`);
    return [...results.entries()];
  }
}
