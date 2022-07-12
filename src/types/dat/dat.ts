import 'reflect-metadata';

import { plainToInstance, Type } from 'class-transformer';

import Game from './game.js';
import Header from './header.js';
import Parent from './parent.js';

export default class DAT {
  @Type(() => Header)
  private readonly header!: Header;

  @Type(() => Game)
  private readonly game!: Game | Game[];

  // Post-processed

  private gameNamesToParents!: Map<string, Parent>;

  static fromObject(obj: object) {
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
    return this.header.getName()
    // Prefixes
      .replace('Non-Redump', '')
    // Suffixes
      .replace('Datfile', '')
      .replace('(Parent-Clone)', '')
    // Cleanup
      .replace(/^[ -]+/, '')
      .replace(/[ -]+$/, '')
      .trim();
  }

  getShortName(): string {
    const split = this.getName().split(' - ');
    let shortName = split[0];
    if (split.length > 1) {
      shortName += ` - ${split.slice(1)
        .map((str) => str
          .replace(/[^A-Z0-9 ()]/g, '')
          .replace(/([A-Z0-9]) +([A-Z0-9])/g, '$1$2')
          .replace(/([A-Z0-9]) +([A-Z0-9])/g, '$1$2')
          .trim())
        .join(' - ')}`;
    }
    return shortName;
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
