import { Expose, plainToClassFromExist, Transform, Type } from 'class-transformer';

import DAT, { DATProps } from '../dat.js';
import Game from '../game.js';
import Header from '../logiqx/header.js';

export interface MameDATProps extends DATProps {
  machine?: Game | Game[];
}

/**
 * MAME-schema DAT that documents {@link Game}s.
 */
export default class MameDAT extends DAT implements MameDATProps {
  @Expose()
  private readonly build?: string;

  // @Expose()
  // private readonly debug: 'yes' | 'no' = 'no';

  // @Expose()
  // private readonly mameconfig: number = 0;

  @Expose()
  @Type(() => Game)
  @Transform(({ value }: { value: undefined | Game | Game[] }) => value ?? [])
  readonly machine: Game | Game[];

  constructor(props?: MameDATProps) {
    super(props);
    this.machine = props?.machine ?? [];
    this.generateGameNamesToParents();
  }

  /**
   * Construct a {@link DAT} from a generic object, such as one from reading an XML file.
   */
  static fromObject(obj: object, props?: MameDATProps): MameDAT {
    const dat = new MameDAT(props);
    return plainToClassFromExist(dat, obj, {
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

  withGames(games: Game[]): DAT {
    return new MameDAT({ ...this, machine: games });
  }
}
