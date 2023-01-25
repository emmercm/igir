import 'reflect-metadata';

import { Expose, plainToInstance, Type } from 'class-transformer';

import Game from './game.js';
import Header from './header.js';
import Parent from './parent.js';
import ROM from './rom.js';

/**
 * @see http://www.logiqx.com/DatFAQs/DatCreation.php
 */
export default class DAT {
  @Expose()
  @Type(() => Header)
  private readonly header: Header;

  @Expose()
  @Type(() => Game)
  private readonly game: Game | Game[];

  private readonly gameNamesToParents: Map<string, Parent> = new Map();

  constructor(header: Header, games: Game | Game[]) {
    this.header = header;
    this.game = games;
    this.generateGameNamesToParents();
  }

  static fromObject(obj: object): DAT {
    return plainToInstance(DAT, obj, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
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

  hasParentCloneInfo(): boolean {
    return this.getGames().some((game) => game.isClone());
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

  buildParentWithAllRoms(): Parent {
    const name = this.getNameShort();

    const roms = [...this.getGames()
      .flatMap((game) => game.getRoms())
      .reduce((map, rom) => {
        if (!map.has(rom.hashCode())) {
          map.set(rom.hashCode(), rom);
        }
        return map;
      }, new Map<string, ROM>()).values()];

    const game = new Game({
      name,
      rom: roms,
    });

    return new Parent(name, [game]);
  }
}
