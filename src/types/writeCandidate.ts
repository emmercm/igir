import Game from './dats/game.js';
import ROMWithFiles from './romWithFiles.js';

/**
 * A container holding a {@link Game}, optionally a {@link Release} for that {@link Game}, and a
 * {@link ROMWithFiles} with input and output {@link File} information for every {@link ROM}.
 * In other words, a {@link WriteCandidate} will only exist if every {@link ROM} of a {@link Game}
 * has been found.
 */
export default class WriteCandidate {
  private readonly game: Game;

  private readonly romsWithFiles: ROMWithFiles[];

  constructor(game: Game, romsWithFiles: ROMWithFiles[]) {
    this.game = game;
    this.romsWithFiles = romsWithFiles;
  }

  // Property getters

  getGame(): Game {
    return this.game;
  }

  getRomsWithFiles(): ROMWithFiles[] {
    return this.romsWithFiles;
  }

  // Computed getters

  getName(): string {
    return this.game.getName();
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

  withRomsWithFiles(romsWithFiles: ROMWithFiles[]): WriteCandidate {
    if (
      romsWithFiles === this.romsWithFiles ||
      (romsWithFiles.length === this.romsWithFiles.length &&
        romsWithFiles.every((rwf, idx) => this.romsWithFiles[idx] === rwf))
    ) {
      return this;
    }
    return new WriteCandidate(this.game, romsWithFiles);
  }
}
