import path from 'node:path';

import moment from 'moment';

import ProgressBar from '../console/progressBar.js';
import Package from '../constants/package.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import DAT from '../types/dats/dat.js';
import Game from '../types/dats/game.js';
import Header from '../types/dats/logiqx/header.js';
import LogiqxDAT from '../types/dats/logiqx/logiqxDat.js';
import ROM from '../types/dats/rom.js';
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
  infer(romFiles: File[]): DAT[] {
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

    const dats = [...inputPathsToRomFiles.entries()]
      .map(([inputPath, datRomFiles]) => DATGameInferrer.createDAT(inputPath, datRomFiles));

    this.progressBar.logTrace('done inferring DATs');
    return dats;
  }

  private static createDAT(inputPath: string, romFiles: File[]): DAT {
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

    const gameNamesToRomFiles = romFiles.reduce((map, file) => {
      const gameName = DATGameInferrer.getGameName(file);
      const gameRomFiles = map.get(gameName) ?? [];
      gameRomFiles.push(file);
      map.set(gameName, gameRomFiles);
      return map;
    }, new Map<string, File[]>());

    const games = [...gameNamesToRomFiles.entries()].map(([gameName, gameRomFiles]) => {
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
    });

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
}
