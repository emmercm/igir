import 'reflect-metadata';

import { Expose, plainToInstance, Type } from 'class-transformer';
import xml2js from 'xml2js';

import Game from './game.js';
import Header from './header.js';
import Machine from './machine.js';
import Parent from './parent.js';

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

  // NOTE(cemmer): this is not Logiqx DTD-compliant, but it's what MAME XML DATs use
  @Expose()
  @Type(() => Machine)
  private readonly machine: Machine | Machine[];

  private readonly gameNamesToParents: Map<string, Parent> = new Map();

  constructor(header: Header, games: Game | Game[]) {
    this.header = header;
    this.game = games;
    this.machine = [];
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

  toXmlDat(): string {
    return new xml2js.Builder({
      renderOpts: { pretty: true, indent: '\t', newline: '\n' },
      xmldec: { version: '1.0' },
      doctype: {
        pubID: '-//Logiqx//DTD ROM Management Datafile//EN',
        sysID: 'http://www.logiqx.com/Dats/datafile.dtd',
      },
      cdata: true,
    }).buildObject(this.toXmlDatObj());
  }

  private toXmlDatObj(): object {
    return {
      datafile: {
        header: this.header.toXmlDatObj(),
        game: this.getGames().map((game) => game.toXmlDatObj()),
      },
    };
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

    if (Array.isArray(this.machine)) {
      return this.machine;
    } if (this.machine) {
      return [this.machine];
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

  getDescription(): string | undefined {
    return this.getHeader().getDescription();
  }

  getRomNamesContainDirectories(): boolean {
    return this.getHeader().getRomNamesContainDirectories()
      || this.isBiosDat();
  }

  /**
   * Get a No-Intro style filename.
   */
  getFilename(): string {
    let filename = this.getName();
    if (this.getHeader().getVersion()) {
      filename += ` (${this.getHeader().getVersion()})`;
    }
    filename += '.dat';
    return filename;
  }

  isBiosDat(): boolean {
    return this.getGames().every((game) => game.isBios())
      // Redump-style DAT names
      || this.getName().match(/(\W|^)BIOS(\W|$)/i) !== null
      // libretro-style DAT comments
      || (this.getHeader().getComment() ?? '').match(/(\W|^)BIOS(\W|$)/i) !== null;
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

  toString(): string {
    return `{"header": ${this.header.toString()}, "games": ${this.getGames().length}}`;
  }
}
