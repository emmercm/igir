import Game from './dat/game';
import Release from './dat/release';
import ROM from './dat/rom';
import ROMFile from './romFile';

export default class ReleaseCandidate {
  private game!: Game;

  private release!: Release | null;

  private roms!: ROM[];

  private romFiles!: ROMFile[];

  constructor(game: Game, release: Release | null, roms: ROM[], romFiles: ROMFile[]) {
    this.game = game;
    this.release = release;
    this.roms = roms;
    this.romFiles = romFiles;
  }
}
