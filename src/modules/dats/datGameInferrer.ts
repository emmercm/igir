import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import { parse } from '@gplane/cue';

import ProgressBar from '../../console/progressBar.js';
import Package from '../../globals/package.js';
import ArrayPoly from '../../polyfill/arrayPoly.js';
import DAT from '../../types/dats/dat.js';
import Game from '../../types/dats/game.js';
import Header from '../../types/dats/logiqx/header.js';
import LogiqxDAT from '../../types/dats/logiqx/logiqxDat.js';
import ROM from '../../types/dats/rom.js';
import Archive from '../../types/files/archives/archive.js';
import ArchiveEntry from '../../types/files/archives/archiveEntry.js';
import File from '../../types/files/file.js';
import { ChecksumProps } from '../../types/files/fileChecksums.js';
import Options from '../../types/options.js';
import Module from '../module.js';

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
    this.progressBar.logTrace(
      `inferring DATs for ${romFiles.length.toLocaleString()} ROM${romFiles.length === 1 ? '' : 's'}`,
    );

    const normalizedInputPaths = this.options
      .getInputPaths()
      // Try to strip out glob patterns
      .map((inputPath) => inputPath.replace(/([\\/][?*]+)+$/, ''));

    const inputPathsToRomFiles = romFiles.reduce((map, file) => {
      const normalizedPath = file.getFilePath().normalize();
      const matchedInputPaths = normalizedInputPaths
        // `.filter()` rather than `.find()` because a file can be found in overlapping input paths,
        // therefore it should be counted in both
        .filter((inputPath) => normalizedPath.startsWith(inputPath));
      (matchedInputPaths.length > 0
        ? matchedInputPaths
        : [DATGameInferrer.DEFAULT_DAT_NAME]
      ).forEach((inputPath) => {
        if (map.has(inputPath)) {
          map.get(inputPath)?.push(file);
        } else {
          map.set(inputPath, [file]);
        }
      });
      return map;
    }, new Map<string, File[]>());
    this.progressBar.logTrace(
      `inferred ${inputPathsToRomFiles.size.toLocaleString()} DAT${inputPathsToRomFiles.size === 1 ? '' : 's'}`,
    );

    const dats = await Promise.all(
      [...inputPathsToRomFiles.entries()].map(async ([inputPath, datRomFiles]) =>
        this.createDAT(inputPath, datRomFiles),
      ),
    );

    this.progressBar.logTrace('done inferring DATs');
    return dats;
  }

  private async createDAT(inputPath: string, romFiles: File[]): Promise<DAT> {
    let remainingRomFiles = DATGameInferrer.enrichLikeFiles(romFiles);
    let gameNamesToRomFiles: [string, File[]][] = [];

    // For each inference strategy
    const inferFunctions = [
      this.inferArchiveEntries.bind(this),
      this.inferBinCueFiles.bind(this),
      this.inferGdiFiles.bind(this),
      this.inferRawFiles.bind(this),
    ];
    for (const inferFunction of inferFunctions) {
      // Infer the games and their files
      const result = await inferFunction.bind(this)(remainingRomFiles);

      // Update the list of results
      gameNamesToRomFiles = [...gameNamesToRomFiles, ...result];

      // Remove the consumed files from further inference
      const consumedFiles = new Set(
        result.flatMap(([, resultFiles]) => resultFiles).map((file) => file.toString()),
      );
      remainingRomFiles = remainingRomFiles.filter((file) => !consumedFiles.has(file.toString()));
    }

    const games = gameNamesToRomFiles
      .map(([gameName, gameRomFiles]) => {
        const roms = gameRomFiles
          .map(
            (romFile) =>
              new ROM({
                name: romFile.getExtractedFilePath(),
                size: romFile.getSize(),
                crc32: romFile.getCrc32(),
                md5: romFile.getMd5(),
                sha1: romFile.getSha1(),
                sha256: romFile.getSha256(),
              }),
          )
          .filter(ArrayPoly.filterUniqueMapped((rom) => rom.getName()));
        return new Game({
          name: gameName,
          description: gameName,
          roms: roms,
        });
      })
      // Filter out duplicate games
      .filter(ArrayPoly.filterUniqueMapped((game) => game.hashCode()));

    const datName = path.basename(inputPath);
    const header = new Header({
      name: datName,
      description: datName,
    });

    return new LogiqxDAT({ header, games });
  }

  /**
   * Different types of archives will return different checksums when quick scanning. This will
   * result in files that are actually the same having different hash codes.
   * Look for files that are the same, combine all known checksums, and enrich files with all
   * known checksum information.
   */
  private static enrichLikeFiles(files: File[]): File[] {
    const crc32Map = this.combineLikeChecksums(files, (file) =>
      file.getCrc32() !== undefined && file.getSize() > 0
        ? `${file.getCrc32()}|${file.getSize()}`
        : undefined,
    );
    const md5Map = this.combineLikeChecksums(files, (file) => file.getMd5());
    const sha1Map = this.combineLikeChecksums(files, (file) => file.getSha1());
    const sha256Map = this.combineLikeChecksums(files, (file) => file.getSha256());

    return files.map((file) => {
      let enrichedFile = file;

      [
        crc32Map.get(`${file.getCrc32()}|${file.getSize()}`),
        md5Map.get(file.getMd5() ?? ''),
        sha1Map.get(file.getSha1() ?? ''),
        sha256Map.get(file.getSha256() ?? ''),
      ]
        .filter((checksumProps) => checksumProps !== undefined)
        .forEach((checksumProps) => {
          enrichedFile = enrichedFile.withProps(checksumProps);
        });

      return enrichedFile;
    });
  }

  private static combineLikeChecksums(
    files: File[],
    keyFunc: (file: File) => string | undefined,
  ): Map<string, ChecksumProps> {
    const crc32Map = files.reduce((map, romFile) => {
      const key = keyFunc(romFile);
      if (key === undefined) {
        return map;
      }
      if (map.has(key)) {
        map.get(key)?.push(romFile);
      } else {
        map.set(key, [romFile]);
      }
      return map;
    }, new Map<string, File[]>());
    return new Map(
      [...crc32Map].map(([key, romFiles]) => {
        const checksums: ChecksumProps = {};
        romFiles.forEach((romFile) => {
          checksums.crc32 = romFile.getCrc32() ?? checksums.crc32;
          checksums.md5 = romFile.getMd5() ?? checksums.md5;
          checksums.sha1 = romFile.getSha1() ?? checksums.sha1;
          checksums.sha256 = romFile.getSha256() ?? checksums.sha256;
        });
        return [key, checksums];
      }),
    );
  }

  private static getGameName(file: File): string {
    // Assume the game name is the filename
    let fileName = file.getExtractedFilePath();
    if (file instanceof ArchiveEntry) {
      // If the file is from an archive, assume the game name is the archive's filename
      fileName = file.getArchive().getFilePath();

      // If the file is using its correct extension, then slice it off and
      // return the result as the game name
      const extIdx = fileName.lastIndexOf(file.getArchive().getExtension());
      if (extIdx !== -1) {
        return path.basename(fileName.slice(0, extIdx)).trim();
      }
    }

    return (
      path
        .basename(fileName)
        // Chop off the extension
        .replace(/(\.[a-z0-9]+)+$/, '')
        .trim()
    );
  }

  private inferArchiveEntries(romFiles: File[]): [string, ArchiveEntry<Archive>[]][] {
    this.progressBar.logTrace(
      `inferring games from archives from ${romFiles.length.toLocaleString()} file${romFiles.length === 1 ? '' : 's'}`,
    );

    // For archives, assume the entire archive is one game
    const archivePathsToArchiveEntries = romFiles
      .filter((file): file is ArchiveEntry<Archive> => file instanceof ArchiveEntry)
      .reduce((map, file) => {
        const archivePath = file.getFilePath();
        if (map.has(archivePath)) {
          map.get(archivePath)?.push(file);
        } else {
          map.set(archivePath, [file]);
        }
        return map;
      }, new Map<string, ArchiveEntry<Archive>[]>());

    const results = [...archivePathsToArchiveEntries.values()].map((archiveEntries) => {
      const gameName = DATGameInferrer.getGameName(archiveEntries[0]);
      return [gameName, archiveEntries] satisfies [string, ArchiveEntry<Archive>[]];
    });

    this.progressBar.logTrace(`inferred ${results.length.toLocaleString()} games from archives`);
    return results;
  }

  private async inferBinCueFiles(romFiles: File[]): Promise<[string, File[]][]> {
    const rawFiles = romFiles.filter((file) => !(file instanceof ArchiveEntry));
    this.progressBar.logTrace(
      `inferring games from cue files from ${rawFiles.length.toLocaleString()} non-archive${rawFiles.length === 1 ? '' : 's'}`,
    );

    const rawFilePathsToFiles = rawFiles.reduce((map, file) => {
      map.set(file.getFilePath(), file);
      return map;
    }, new Map<string, File>());

    const results = (
      await Promise.all(
        rawFiles
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
                .filter((file) => file !== undefined);
              if (binFiles.length === 0) {
                return undefined;
              }

              const gameName = DATGameInferrer.getGameName(cueFile);
              return [gameName, [cueFile, ...binFiles]];
            } catch {
              return undefined;
            }
          }),
      )
    ).filter((result) => result !== undefined);

    this.progressBar.logTrace(`inferred ${results.length.toLocaleString()} games from cue files`);
    return results;
  }

  private async inferGdiFiles(romFiles: File[]): Promise<[string, File[]][]> {
    const rawFiles = romFiles.filter((file) => !(file instanceof ArchiveEntry));
    this.progressBar.logTrace(
      `inferring games from gdi files from ${rawFiles.length.toLocaleString()} non-archive${rawFiles.length === 1 ? '' : 's'}`,
    );

    const rawFilePathsToFiles = rawFiles.reduce((map, file) => {
      map.set(file.getFilePath(), file);
      return map;
    }, new Map<string, File>());

    const results = (
      await Promise.all(
        rawFiles
          .filter((file) => file.getExtractedFilePath().toLowerCase().endsWith('.gdi'))
          .map(async (gdiFile): Promise<[string, File[]] | undefined> => {
            try {
              const cueData = await util.promisify(fs.readFile)(gdiFile.getFilePath());

              const { name: filePrefix } = path.parse(gdiFile.getFilePath());
              const gdiContents = `${cueData
                .toString()
                .split(/\r?\n/)
                .filter((line) => line.length > 0)
                // Replace the chdman-generated track files with TOSEC-style track filenames
                .map((line) => line.replace(filePrefix, 'track').replaceAll('"', ''))
                .join('\r\n')}\r\n`;

              const trackFilePaths = gdiContents
                .trim()
                .split(/\r?\n/)
                .slice(1)
                .map((line) => line.split(' ')[4]);
              const trackFiles = trackFilePaths
                .map((trackFilePath) =>
                  path.join(path.dirname(gdiFile.getFilePath()), trackFilePath),
                )
                .map((trackFilePath) => rawFilePathsToFiles.get(trackFilePath))
                .filter((file) => file !== undefined);
              if (trackFiles.length === 0) {
                return undefined;
              }

              const gameName = DATGameInferrer.getGameName(gdiFile);
              return [gameName, [gdiFile, ...trackFiles]];
            } catch {
              return undefined;
            }
          }),
      )
    ).filter((result) => result !== undefined);

    this.progressBar.logTrace(`inferred ${results.length.toLocaleString()} games from cue files`);
    return results;
  }

  private inferRawFiles(romFiles: File[]): [string, File[]][] {
    this.progressBar.logTrace(
      `inferring games from raw files from ${romFiles.length.toLocaleString()} file${romFiles.length === 1 ? '' : 's'}`,
    );

    const results = romFiles
      .filter((file) => !(file instanceof ArchiveEntry))
      .reduce((map, file) => {
        const gameName = DATGameInferrer.getGameName(file);
        if (map.has(gameName)) {
          map.get(gameName)?.push(file);
        } else {
          map.set(gameName, [file]);
        }
        return map;
      }, new Map<string, File[]>());

    this.progressBar.logTrace(`inferred ${results.size.toLocaleString()} games from raw files`);
    return [...results.entries()];
  }
}
