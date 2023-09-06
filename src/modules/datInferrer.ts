import path from 'path';

import ProgressBar from '../console/progressBar.js';
import DAT from '../types/dats/dat.js';
import Game from '../types/dats/game.js';
import Header from '../types/dats/logiqx/header.js';
import LogiqxDAT from '../types/dats/logiqx/logiqxDat.js';
import ROM from '../types/dats/rom.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import File from '../types/files/file.js';
import Module from './module.js';

/**
 * If no {@link DAT}s are provided, implicitly create some. A {@link DAT} will be created for every
 * subdirectory that contains files, and {@link Game}s will be named after each file's extracted
 * path (without the extension).
 *
 * This class will not be run concurrently with any other class.
 */
export default class DATInferrer extends Module {
  constructor(progressBar: ProgressBar) {
    super(progressBar, DATInferrer.name);
  }

  /**
   * Infer DATs from input files.
   */
  infer(romFiles: File[]): DAT[] {
    this.progressBar.logInfo(`inferring DATs for ${romFiles.length.toLocaleString()} ROM${romFiles.length !== 1 ? 's' : ''}`);

    const datNamesToRomFiles = romFiles.reduce((map, file) => {
      const datName = DATInferrer.getDatName(file);
      const datRomFiles = map.get(datName) ?? [];
      datRomFiles.push(file);
      map.set(datName, datRomFiles);
      return map;
    }, new Map<string, File[]>());
    this.progressBar.logDebug(`inferred ${datNamesToRomFiles.size.toLocaleString()} DAT${datNamesToRomFiles.size !== 1 ? 's' : ''}`);

    const dats = [...datNamesToRomFiles.entries()]
      .map(([datName, datRomFiles]) => DATInferrer.createDAT(datName, datRomFiles));

    this.progressBar.logInfo('done inferring DATs');
    return dats;
  }

  private static getDatName(file: File): string {
    return path.dirname(file.getFilePath()).split(/[\\/]/).slice(-1)[0];
  }

  private static createDAT(datName: string, romFiles: File[]): DAT {
    const header = new Header({ name: datName });

    const gameNamesToRomFiles = romFiles.reduce((map, file) => {
      const gameName = DATInferrer.getGameName(file);
      const gameRomFiles = map.get(gameName) ?? [];
      gameRomFiles.push(file);
      map.set(gameName, gameRomFiles);
      return map;
    }, new Map<string, File[]>());

    const games = [...gameNamesToRomFiles.entries()].map(([gameName, gameRomFiles]) => {
      const roms = gameRomFiles.map((romFile) => new ROM(
        path.basename(romFile.getExtractedFilePath()),
        romFile.getSize(),
        romFile.getCrc32(),
      ));
      return new Game({
        name: gameName,
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
      .replace(/(\.[a-z0-9]+)+$/, '')
      .trim();
  }
}
