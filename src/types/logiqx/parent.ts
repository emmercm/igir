import 'reflect-metadata';

import { Type } from 'class-transformer';

import Game from './game.js';
import Release from './release.js';

export default class Parent {
  name!: string;

  @Type(() => Game)
  private readonly games!: Game[];

  private releaseRegionsToGames!: Map<string, Game>;

  constructor(name: string, games: Game | Game[]) {
    this.name = name;
    this.games = Array.isArray(games) ? games : [games];
    this.refreshRegionsToRoms();
  }

  // Property getters

  getName(): string {
    return this.name;
  }

  getGames(): Game[] {
    return this.games;
  }

  addChild(child: Game) {
    this.games.push(child);
    this.refreshRegionsToRoms();
  }

  private refreshRegionsToRoms() {
    this.releaseRegionsToGames = new Map<string, Game>();
    this.games.forEach((game: Game) => {
      if (game.getReleases()) {
        game.getReleases().forEach((release: Release) => {
          this.releaseRegionsToGames.set(release.getRegion(), game);
        });
      }
    });
  }

  // Computed getters

  isBios(): boolean {
    return this.getGames().some((game) => game.isBios());
  }

  isRelease(): boolean {
    return this.getGames().some((game) => game.isRetail());
  }

  isPrototype(): boolean {
    return !this.isRelease() && this.getGames().some((game) => game.isPrototype());
  }
}
