import 'reflect-metadata';

import { plainToInstance, Type } from 'class-transformer';

import Game from './game';
import Header from './header';
import Parent from './parent';

export default class DAT {
  @Type(() => Header)
  private header!: Header;

  @Type(() => Game)
  private game!: Game | Game[];

  // Post-processed

  private gameNamesToParents!: Map<string, Parent>;

  static fromObject(obj: unknown) {
    return plainToInstance(DAT, obj, {
      enableImplicitConversion: true,
    })
      .generateGameNamesToParents();
  }

  private generateGameNamesToParents(): DAT {
    // Find all parents
    this.gameNamesToParents = new Map<string, Parent>();
    this.getGames().forEach((game: Game) => {
      if (game.isParent()) {
        this.gameNamesToParents.set(game.getName(), new Parent(game.getName(), game));
      }
    });

    // Find all clones
    this.getGames().forEach((game: Game) => {
      if (!game.isParent()) {
        const parent = this.gameNamesToParents.get(game.getParent());
        if (parent) {
          parent.addChild(game);
        }
      }
    });

    return this;
  }

  getName(): string {
    return this.header.getName();
  }

  private getGames(): Game[] {
    if (this.game instanceof Array) {
      return this.game;
    } if (this.game) {
      return [this.game];
    }
    return [];
  }

  getParents(): Parent[] {
    return [...this.gameNamesToParents.values()];
  }

  getRomExtensions(): string[] {
    return this.getGames()
      .flatMap((game: Game) => game.getRomExtensions())
      .filter((ext: string, idx: number, exts: string[]) => exts.indexOf(ext) === idx);
  }
}
