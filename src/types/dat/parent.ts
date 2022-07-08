import { Type } from 'class-transformer';

import Game from './game';
import Release from './release';

export default class Parent {
  name!: string;

  @Type(() => Game)
  private games!: Game[];

  private releaseRegionsToGames!: Map<string, Game>;

  constructor(name: string, parent: Game) {
    this.name = name;
    this.games = [parent];
    this.refreshRegionsToRoms();
  }

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
}
