import type Game from './game.js';

/**
 * A container of {@link Game}s that are all related together by parent/clone {@link DAT} info.
 */
export default class Parent {
  private readonly parentGame: Game;

  private readonly allGames: Game[];

  constructor(parentGame: Game, allGames?: Game | Game[]) {
    this.parentGame = parentGame;
    if (allGames === undefined) {
      this.allGames = [parentGame];
    } else {
      this.allGames = Array.isArray(allGames) ? allGames : [allGames];
    }
  }

  // Property getters

  getName(): string {
    return this.parentGame.getName();
  }

  getGames(): Game[] {
    return this.allGames;
  }

  /**
   * Add a child {@link Game} to this {@link Parent}'s list of {@link Game}s.
   */
  addChild(child: Game): void {
    this.allGames.push(child);
  }
}
