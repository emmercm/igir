import 'reflect-metadata';

import { plainToInstance, Type } from 'class-transformer';

import Game from './game.js';
import Header from './header.js';
import Parent from './parent.js';

/**
 * @see http://www.logiqx.com/DatFAQs/DatCreation.php
 */
export default class DAT {
  @Type(() => Header)
  private readonly header!: Header;

  @Type(() => Game)
  private readonly game!: Game | Game[];

  constructor(header: Header, games: Game[]) {
    this.header = header;
    this.game = games;
    this.generateGameNamesToParents();
  }

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
      .replace('Source Code', '')
      .replace('Unofficial', '')
    // Suffixes
      .replace('Datfile', '')
      .replace('(BigEndian)', '')
      .replace('(CDN)', '')
      .replace('(Decrypted)', '')
      .replace('(Deprecated)', '')
      .replace('(Digital)', '')
      .replace('(Download Play)', '')
      .replace('(Headered)', '')
      .replace('(Misc)', '')
      // .replace('(Multiboot)', '')
      .replace(/\(Parent-Clone\)/g, '')
      .replace('(PSN)', '')
      .replace('(Split DLC)', '')
      .replace('(WAD)', '')
      .replace('(WIP)', '')
    // Cleanup
      .replace(/^[ -]+/, '')
      .replace(/[ -]+$/, '')
      .replace(/  +/g, ' ')
      .trim();
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
}
