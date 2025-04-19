import { Expose, plainToInstance, Transform, Type } from 'class-transformer';

import DAT from '../dat.js';
import Game from '../game.js';
import Header from '../logiqx/header.js';

/**
 * MAME-schema DAT that documents {@link Game}s.
 */
export default class MameDAT extends DAT {
  @Expose()
  private readonly build?: string;

  // @Expose()
  // private readonly debug: 'yes' | 'no' = 'no';

  // @Expose()
  // private readonly mameconfig: number = 0;

  @Expose()
  @Type(() => Game)
  @Transform(({ value }: { value: undefined | Game | Game[] }) => value ?? [])
  private readonly machine: Game | Game[];

  constructor(machine?: Game | Game[]) {
    super();
    this.machine = machine ?? [];
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
      return this.machine;
    }
    return [this.machine];
  }
}
