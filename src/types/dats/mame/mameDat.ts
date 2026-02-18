import { Expose, plainToClassFromExist, Transform, Type } from 'class-transformer';

import DAT, { DATProps } from '../dat.js';
import Game from '../game.js';
import Header from '../logiqx/header.js';

export interface MameDATProps extends DATProps {
  machine?: Game | Game[];
  game?: Game | Game[];
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
  // @Transform(({ value }: { value: undefined | string }) =>
  //   value === undefined ? 0 : Number.parseInt(value),
  // )
  // private readonly mameconfig: number = 0;

  @Expose()
  @Type(() => Game)
  @Transform(({ value }: { value: undefined | Game | Game[] }) => value ?? [])
  readonly machine?: Game | Game[];

  // NOTE(cemmer): this is non-standard, but some DATs such as 'mame2003-plus-libretro' use it
  @Expose()
  @Type(() => Game)
  @Transform(({ value }: { value: undefined | Game | Game[] }) => value ?? [])
  readonly game?: Game | Game[];

  constructor(props?: MameDATProps) {
    super(props);
    this.machine = props?.machine;
    this.game = props?.game;
    this.generateGameNamesToParents();
  }

  /**
   * Construct a {@link DAT} from a generic object, such as one from reading an XML file.
   */
  static fromObject(obj: object, props?: DATProps): MameDAT {
    // WARN(cemmer): plainToClassFromExist requires all class properties to be undefined, it will
    // not overwrite properties with a defined value
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
      if (this.machine.length > 0) {
        return this.machine;
      }
    } else if (this.machine) {
      return [this.machine];
    }

    if (Array.isArray(this.game)) {
      if (this.game.length > 0) {
        return this.game;
      }
    } else if (this.game) {
      return [this.game];
    }

    return [];
  }

  withGames(games: Game[]): DAT {
    return new MameDAT({ ...this, machine: games, games: [] });
  }
}
