import Game from './game.js';

export default class Parent {
  name!: string;

  private readonly games!: Game[];

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

  addChild(child: Game): void {
    this.games.push(child);
  }

  // Computed getters

  isBios(): boolean {
    return this.getGames().some((game) => game.isBios());
  }

  isRetail(): boolean {
    return this.getGames().some((game) => game.isRetail());
  }

  isPrototype(): boolean {
    return !this.isRetail() && this.getGames().some((game) => game.isPrototype());
  }
}
