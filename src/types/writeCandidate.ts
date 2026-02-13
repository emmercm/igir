import { Memoize } from 'typescript-memoize';

import SingleValueGame from './dats/singleValueGame.js';
import ROMWithFiles from './romWithFiles.js';

/**
 * A container holding a {@link Game}, optionally a {@link Release} for that {@link Game}, and a
 * {@link ROMWithFiles} with input and output {@link File} information for every {@link ROM}.
 * In other words, a {@link WriteCandidate} will only exist if every {@link ROM} of a {@link Game}
 * has been found.
 */
export default class WriteCandidate {
  private readonly game: SingleValueGame;

  private readonly romsWithFiles: ROMWithFiles[];

  constructor(game: SingleValueGame, romsWithFiles: ROMWithFiles[]) {
    this.game = game;
    this.romsWithFiles = romsWithFiles;
  }

  // Property getters

  getGame(): SingleValueGame {
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

  // Pseudo Built-Ins

  /**
   * A string hash code to uniquely identify this {@link WriteCandidate}.
   */
  @Memoize()
  hashCode(): string {
    let hashCode = this.game.hashCode();
    hashCode += `|${this.romsWithFiles
      .map((romWithFiles) => romWithFiles.hashCode())
      .toSorted()
      .join(',')}`;
    return hashCode;
  }
}
