import { Expose, plainToInstance, Transform, Type } from 'class-transformer';

import DAT from '../dat.js';
import Game from '../game.js';
import Header from '../logiqx/header.js';
import Machine from './machine.js';

/**
 * MAME-schema DAT that documents {@link Machine}s.
 */
export default class MameDAT extends DAT {
  @Expose()
  private readonly build?: string;

  // @Expose()
  // private readonly debug: 'yes' | 'no' = 'no';

  // @Expose()
  // private readonly mameconfig: number = 0;

  @Expose()
  @Type(() => Machine)
  @Transform(({ value }: { value: undefined | Machine | Machine[] }) => value ?? [])
  private readonly machine?: Machine | Machine[];

  constructor(machine: Machine | Machine[]) {
    super();
    this.machine = machine;
    this.generateGameNamesToParents();
  }

  /**
   * Construct a {@link DAT} from a generic object, such as one from reading an XML file.
   */
  static fromObject(obj: object): MameDAT {
    return plainToInstance(MameDAT, obj, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    }).generateGameNamesToParents();
  }

  getHeader(): Header {
    return new Header({
      name: this.build ?? 'MAME',
    });
  }

  getGames(): Game[] {
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
