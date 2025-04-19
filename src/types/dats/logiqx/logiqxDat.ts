import 'reflect-metadata';

import { Expose, plainToInstance, Transform, Type } from 'class-transformer';

import DAT from '../dat.js';
import Game from '../game.js';
import Header from './header.js';

/**
 * Logiqx-schema DAT that documents {@link Game}s.
 * @see http://www.logiqx.com/DatFAQs/DatCreation.php
 */
export default class LogiqxDAT extends DAT {
  @Expose()
  @Type(() => Header)
  private readonly header: Header;

  @Expose()
  @Type(() => Game)
  @Transform(({ value }: { value: undefined | Game | Game[] }) => value ?? [])
  private readonly game?: Game | Game[];

  // NOTE(cemmer): this is not Logiqx DTD-compliant, but it's what pleasuredome Datfiles use
  @Expose()
  @Type(() => Game)
  @Transform(({ value }: { value: undefined | Game | Game[] }) => value ?? [])
  private readonly machine?: Game | Game[];

  constructor(header: Header, games: Game | Game[]) {
    super();
    this.header = header;
    this.game = games;
    this.machine = [];
    this.generateGameNamesToParents();
  }

  /**
   * Construct a {@link LogiqxDAT} from a generic object, such as one from reading an XML file.
   */
  static fromObject(obj: object): LogiqxDAT {
    return plainToInstance(LogiqxDAT, obj, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    }).generateGameNamesToParents();
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
