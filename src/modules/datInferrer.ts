import path from 'path';

import ArchiveEntry from '../types/files/archiveEntry.js';
import File from '../types/files/file.js';
import DAT from '../types/logiqx/dat.js';
import Game from '../types/logiqx/game.js';
import Header from '../types/logiqx/header.js';
import ROM from '../types/logiqx/rom.js';

export default class DATInferrer {
  static infer(romFiles: File[]): DAT[] {
    const datNamesToRomFiles = romFiles.reduce((map, file) => {
      const datName = DATInferrer.getDatName(file);
      const datRomFiles = map.get(datName) || [];
      datRomFiles.push(file);
      map.set(datName, datRomFiles);
      return map;
    }, new Map<string, File[]>());

    return [...datNamesToRomFiles.entries()]
      .map(([datName, datRomFiles]) => DATInferrer.createDAT(datName, datRomFiles));
  }

  private static getDatName(file: File): string {
    return path.dirname(file.getFilePath());
  }

  private static createDAT(datName: string, romFiles: File[]): DAT {
    const header = new Header({ name: datName });

    const gameNamesToRomFiles = romFiles.reduce((map, file) => {
      const gameName = DATInferrer.getGameName(file);
      const gameRomFiles = map.get(gameName) || [];
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

    return new DAT(header, games);
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
