import 'reflect-metadata';

import { plainToInstance, Type } from 'class-transformer';
import path from 'path';

import FileHeader from '../fileHeader.js';
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

  private gameNamesToParents!: Map<string, Parent>;

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

  // Property getters

  getHeader(): Header {
    return this.header;
  }

  getGames(): Game[] {
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

  getNameLong(): string {
    let long = this.getName();
    if (this.getHeader().getDate()) {
      long += ` (${this.getHeader().getDate()})`;
    } else if (this.getHeader().getVersion()) {
      long += `(v${this.getHeader().getVersion()})`;
    }
    return long;
  }

  getFileHeader(): FileHeader | undefined {
    // Look for an exact header name match from the DAT
    const clrMameProHeader = this.getHeader().getClrMamePro()?.getHeader();
    if (clrMameProHeader) {
      const fileHeader = FileHeader.getByName(clrMameProHeader);
      if (fileHeader) {
        return fileHeader;
      }
    }

    // If the DAT indicates the files are headered, infer a header by file extension
    if (this.getName().match(/headered/i)) {
      const extensionCounts = this.getGames().reduce((counts, game) => {
        game.getRoms().forEach((rom) => {
          const extension = path.extname(rom.getName());
          const count = counts.has(extension) ? counts.get(extension) as number : 0;
          counts.set(extension, count + 1);
        });
        return counts;
      }, new Map<string, number>());

      const topExtension = [...extensionCounts.entries()]
        .sort((a, b) => b[1] - a[1])[0][0];

      const fileHeader = FileHeader.getByExtension(topExtension);
      if (fileHeader) {
        return fileHeader;
      }
    }

    return undefined;
  }
}
