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
  private readonly header: Header;

  @Type(() => Game)
  private readonly game: Game | Game[];

  private readonly gameNamesToParents: Map<string, Parent> = new Map();

  constructor(header: Header, games: Game[]) {
    this.header = header;
    this.game = games;
    this.generateGameNamesToParents();
  }

  static fromObject(obj: object): DAT {
    return plainToInstance(DAT, obj, {
      enableImplicitConversion: true,
    })
      .generateGameNamesToParents();
  }

  private generateGameNamesToParents(): DAT {
    // Find all parents
    this.getGames().forEach((game: Game) => {
      if (game.isParent()) {
        this.gameNamesToParents.set(game.getName(), new Parent(game.getName(), game));
      }
    });

    // Find all clones
    this.getGames().forEach((game: Game) => {
      // TODO(cemmer): a DAT fixture with parent/clone info
      if (!game.isParent()) {
        const parent = this.gameNamesToParents.get(game.getParent());
        if (parent) {
          parent.addChild(game);
        }
      }
    });

    return this;
  }

  // Property getters

  getHeader(): Header {
    return this.header;
  }

  getGames(): Game[] {
    if (Array.isArray(this.game)) {
      return this.game;
    } if (this.game) {
      return [this.game];
    }
    return [];
  }

  getParents(): Parent[] {
    return [...this.gameNamesToParents.values()];
  }

  // Computed getters

  getName(): string {
    return this.getHeader().getName();
  }

  getNameShort(): string {
    return this.getName()
      // Prefixes
      .replace('Non-Redump', '')
      .replace('Source Code', '')
      .replace('Unofficial', '')
      // Suffixes
      .replace('Datfile', '')
      .replace('(CDN)', '')
      .replace('(Deprecated)', '')
      .replace('(Digital)', '')
      .replace('(Download Play)', '')
      .replace('(Misc)', '')
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

  getNameLong(): string {
    let long = this.getName();
    if (this.getHeader().getDate()) {
      long += ` (${this.getHeader().getDate()})`;
    } else if (this.getHeader().getVersion()) {
      long += `(v${this.getHeader().getVersion()})`;
    }
    return long;
  }
}
