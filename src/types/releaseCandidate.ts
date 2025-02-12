import Game from './dats/game.js';
import Release from './dats/release.js';
import ROMWithFiles from './romWithFiles.js';

/**
 * A container holding a {@link Game}, optionally a {@link Release} for that {@link Game}, and a
 * {@link ROMWithFiles} with input and output {@link File} information for every {@link ROM}.
 * In other words, a {@link ReleaseCandidate} will only exist if every {@link ROM} of a {@link Game}
 * has been found.
 */
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

    return this.game.getRegions().at(0);
  }

  getLanguages(): string[] {
    // Get language off of the release
    const releaseLanguage = this.release?.getLanguage();
    if (releaseLanguage) {
      return [releaseLanguage.toUpperCase()];
    }

    return this.game.getLanguages();
  }

  /**
   * Returns true if any {@link ROMWithFiles} input {@link File} has a {@link Patch} attached to it.
   */
  isPatched(): boolean {
    return this.getRomsWithFiles().some(
      (romWithFiles) => romWithFiles.getInputFile().getPatch() !== undefined,
    );
  }

  // Immutable setters

  withRomsWithFiles(romsWithFiles: ROMWithFiles[]): ReleaseCandidate {
    if (
      romsWithFiles === this.romsWithFiles ||
      (romsWithFiles.length === this.romsWithFiles.length &&
        romsWithFiles.every((rwf, idx) => this.romsWithFiles[idx] === rwf))
    ) {
      return this;
    }
    return new ReleaseCandidate(this.game, this.release, romsWithFiles);
  }
}
