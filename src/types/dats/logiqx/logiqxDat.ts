import 'reflect-metadata';

import { Expose, plainToInstance, Transform, Type } from 'class-transformer';

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
  @Type(() => Header)
  private readonly header: Header;

  @Expose()
  @Type(() => Game)
  @Transform(({ value }: { value: undefined | Game | Game[] }) => value ?? [])
  private readonly game: Game | Game[];

  // NOTE(cemmer): this is not Logiqx DTD-compliant, but it's what pleasuredome Datfiles use
  @Expose()
  @Type(() => Machine)
  @Transform(({ value }: { value: undefined | Machine | Machine[] }) => value ?? [])
  private readonly machine: Machine | Machine[];

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
    // First, prefer non-empty arrays
    if (Array.isArray(this.game) && this.game.length > 0) {
      return this.game;
    }
    if (Array.isArray(this.machine) && this.machine.length > 0) {
      return this.machine;
    }

    // Then, prefer empty arrays
    if (Array.isArray(this.game)) {
      return this.game;
    }
    if (Array.isArray(this.machine)) {
      return this.machine;
    }

    return [this.game];
  }
}
