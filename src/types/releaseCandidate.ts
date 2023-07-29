import Game from './logiqx/game.js';
import Release from './logiqx/release.js';
import ROMWithFiles from './romWithFiles.js';

export default class ReleaseCandidate {
  private readonly game: Game;

  private readonly release?: Release;

  private readonly romsWithFiles: ROMWithFiles[];

  constructor(game: Game, release: Release | undefined, romsWithFiles: ROMWithFiles[]) {
    this.game = game;
    this.release = release;
    this.romsWithFiles = romsWithFiles;
  }

  // Property getters

  getGame(): Game {
    return this.game;
  }

  getRelease(): Release | undefined {
    return this.release;
  }

  getRomsWithFiles(): ROMWithFiles[] {
    return this.romsWithFiles;
  }

  // Computed getters

  getName(): string {
    if (this.release) {
      return this.release.getName();
    }
    return this.game.getName();
  }

  getRegion(): string | undefined {
    if (this.release?.getRegion()) {
      return this.release.getRegion();
    }

    return this.game.getRegions()[0];
  }

  getLanguages(): string[] {
    // Get language off of the release
    if (this.release?.getLanguage()) {
      return [(this.release.getLanguage() as string).toUpperCase()];
    }

    return this.game.getLanguages();
  }

  isPatched(): boolean {
    return this.getRomsWithFiles().some((romWithFiles) => romWithFiles.getInputFile().getPatch());
  }
}
