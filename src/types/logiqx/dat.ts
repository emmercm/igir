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
      .replace('FinalBurn Neo', '')
      .replace('Non-Redump', '')
      .replace('Source Code', '')
      .replace('Unofficial', '')
      // Suffixes
      .replace('Datfile', '')
      .replace('Games', '')
      .replace('(Deprecated)', '')
      .replace(/\(Parent-Clone\)/g, '')
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

  /**
   * Does a DAT explicitly contain headered ROMs. It is possible for a DAT to be both non-headered
   *  and non-headerless.
   */
  isHeadered(): boolean {
    // No-Intro "headerless" DATs have this field set
    if (this.getHeader().getClrMamePro()?.getHeader()) {
      return false;
    }

    return this.getName().match(/\(headered\)/i) !== null;
  }

  /**
   * Does a DAT explicitly contain headerless ROMs. It is possible for a DAT to be both non-headered
   *  and non-headerless.
   */
  isHeaderless(): boolean {
    // No-Intro "headerless" DATs have this field set
    if (this.getHeader().getClrMamePro()?.getHeader()) {
      return true;
    }

    return this.getName().match(/\(headerless\)/i) !== null;
  }
}
