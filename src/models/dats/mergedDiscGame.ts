import type { GameProps } from './game.js';
import Game from './game.js';

export interface MergedDiscGameProps extends GameProps {
  readonly subGames: Game[];
}

/**
 * A game merged from two or more disc-based games. It keeps the original per-disc games as
 * first-class sub-games while still exposing their flattened ROMs to every other consumer.
 */
export default class MergedDiscGame extends Game {
  private readonly subGames: Game[];

  constructor(props: MergedDiscGameProps) {
    // Seed the inherited `roms` field from the same ROM instances the sub-games hold, so that an
    // object spread (`{ ...mergedDiscGame }`) and serialization both see every ROM. getRoms() below
    // keeps the sub-games authoritative.
    super({
      ...props,
      roms: props.subGames.flatMap((game) => game.getRoms()),
    });
    this.subGames = props.subGames;
  }

  /**
   * Return the original per-disc games this merged game was built from.
   */
  getSubGames(): Game[] {
    return this.subGames;
  }

  /**
   * Return a new merged game with some different properties, preserving the sub-games.
   */
  override withProps(props: GameProps): MergedDiscGame {
    // Note: any `roms` in `props` is ignored — the constructor always re-derives `roms` from
    // `subGames`. Pipeline callers only ever change props such as `cloneOf`.
    return new MergedDiscGame({
      ...this,
      ...props,
      subGames: this.subGames,
    });
  }
}
