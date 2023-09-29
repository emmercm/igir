import Game from './game.js';

/**
 * A container of {@link Game}s that are all related together by parent/clone {@link DAT} info.
 */
export default class Parent {
  private readonly name: string;

  private readonly games: Game[];

  constructor(name: string, games: Game | Game[]) {
    this.name = name;
    this.games = Array.isArray(games) ? games : [games];
  }

  // Property getters

  getName(): string {
    return this.name;
  }

  getGames(): Game[] {
    return this.games;
  }

  /**
   * Add a child {@link Game} to this {@link Parent}'s list of {@link Game}s.
   */
  addChild(child: Game): void {
    this.games.push(child);
  }
}
