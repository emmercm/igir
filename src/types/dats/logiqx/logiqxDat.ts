import 'reflect-metadata';

import {
  Expose, plainToInstance, Transform, Type,
} from 'class-transformer';
import xml2js from 'xml2js';

import DAT from '../dat.js';
import Game from '../game.js';
import Machine from '../mame/machine.js';
import Header from './header.js';

/**
 * Logiqx-schema DAT that documents {@link Game}s.
 * @see http://www.logiqx.com/DatFAQs/DatCreation.php
 */
export default class LogiqxDAT extends DAT {
  @Expose()
  @Transform(({ value }) => value || undefined)
  private readonly header: Header;

  @Expose()
  @Type(() => Game)
  @Transform(({ value }) => value || [])
  private readonly game?: Game | Game[];

  // NOTE(cemmer): this is not Logiqx DTD-compliant, but it's what pleasuredome Datfiles use
  @Expose()
  @Type(() => Machine)
  @Transform(({ value }) => value || [])
  private readonly machine?: Machine | Machine[];

  constructor(header: Header, games: Game | Game[]) {
    super();
    this.header = header;
    this.game = games;
    this.machine = [];
    this.generateGameNamesToParents();
  }

  /**
   * Construct a {@link DAT} from a generic object, such as one from reading an XML file.
   */
  static fromObject(obj: object): DAT {
    return plainToInstance(LogiqxDAT, obj, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    })
      .generateGameNamesToParents();
  }

  /**
   * Serialize this {@link LogiqxDAT} to the file contents of an XML file.
   */
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
      if (this.game.length > 0) {
        return this.game;
      }
    } else if (this.game) {
      return [this.game];
    }

    if (Array.isArray(this.machine)) {
      if (this.machine.length > 0) {
        return this.machine;
      }
    } else if (this.machine) {
      return [this.machine];
    }

    return [];
  }
}
