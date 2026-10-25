import util from 'node:util';

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
      ...MergedDiscGame.getSharedProps(props.subGames),
      ...props,
      roms: props.subGames.flatMap((game) => game.getRoms()),
    });
    this.subGames = props.subGames;
  }

  /**
   * Return every property whose value is identical across all sub-games (e.g. categories, genre),
   * so the merged game keeps the game-level metadata its discs share. Properties that differ
   * between discs (e.g. name, description, ROMs) are left out. Properties are discovered from the
   * sub-games themselves, so metadata added to {@link Game} in the future is carried over too.
   */
  private static getSharedProps(subGames: Game[]): GameProps {
    const [firstGame, ...otherGames] = subGames;
    const sharedProps: GameProps = { ...firstGame };
    for (const key of Object.keys(sharedProps)) {
      const firstValue: unknown = Reflect.get(firstGame, key);
      if (otherGames.some((game) => !util.isDeepStrictEqual(Reflect.get(game, key), firstValue))) {
        Reflect.deleteProperty(sharedProps, key);
      }
    }
    return sharedProps;
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
