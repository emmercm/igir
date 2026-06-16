import 'reflect-metadata';

import { Expose, plainToClassFromExist, Transform, Type } from 'class-transformer';

import DAT, { DATProps } from '../dat.js';
import Game from '../game.js';
import Header from './header.js';

export interface LogiqxDATProps extends DATProps {
  header?: Header;
  games?: Game | Game[];
  machine?: Game | Game[];
}

/**
 * Logiqx-schema DAT that documents {@link Game}s.
 * @see http://www.logiqx.com/DatFAQs/DatCreation.php
 */
export default class LogiqxDAT extends DAT implements LogiqxDATProps {
  @Expose()
  @Type(() => Header)
  readonly header?: Header;

  @Expose()
  @Type(() => Game)
  @Transform(({ value }: { value: undefined | Game | Game[] }) => value ?? [])
  readonly game?: Game | Game[];

  // NOTE(cemmer): this is not Logiqx DTD-compliant, but it's what pleasuredome Datfiles use
  @Expose()
  @Type(() => Game)
  @Transform(({ value }: { value: undefined | Game | Game[] }) => value ?? [])
  readonly machine?: Game | Game[];

  constructor(props?: LogiqxDATProps) {
    super(props);
    this.header = props?.header;
    this.game = props?.games;
    this.machine = props?.machine;
    this.generateGameNamesToParents();
  }

  /**
   * Construct a {@link LogiqxDAT} from a generic object, such as one from reading an XML file.
   */
  static fromObject(obj: object, props?: DATProps): LogiqxDAT {
    // WARN(cemmer): plainToClassFromExist requires all class properties to be undefined, it will
    // not overwrite properties with a defined value
    const dat = new LogiqxDAT(props);
    return plainToClassFromExist(dat, obj, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    }).generateGameNamesToParents();
  }

  // Property getters

  getHeader(): Header {
    return this.header ?? new Header();
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

  /**
   * @inheritdoc
   */
  isMame(): boolean {
    // The MAME-derived `<machine>` element is used rather than the standard Logiqx `<game>`
    if (Array.isArray(this.machine)) {
      return this.machine.length > 0;
    }
    return this.machine !== undefined;
  }

  withGames(games: Game[]): DAT {
    // Preserve which element the games came from so {@link isMame} stays accurate
    return this.isMame()
      ? new LogiqxDAT({ ...this, games: undefined, machine: games })
      : new LogiqxDAT({ ...this, games, machine: undefined });
  }
}
