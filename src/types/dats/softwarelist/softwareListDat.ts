import { Expose, plainToClassFromExist, Transform, Type } from 'class-transformer';

import DAT, { DATProps } from '../dat.js';
import Game from '../game.js';
import Header from '../logiqx/header.js';
import Software from './software.js';

export interface SoftwareListDATProps extends DATProps {
  software?: Software | Software[];
}

/**
 * MAME-schema DAT that documents {@link Software}s.
 */
export default class SoftwareListDAT extends DAT implements SoftwareListDATProps {
  @Expose()
  readonly name?: string;

  @Expose()
  readonly description?: string;

  @Expose()
  @Type(() => Software)
  @Transform(({ value }: { value: undefined | Software | Software[] }) => value ?? [])
  readonly software: Software | Software[];

  constructor(props?: SoftwareListDATProps) {
    super(props);
    this.software = props?.software ?? [];
    this.generateGameNamesToParents();
  }

  /**
   * Construct a {@link SoftwareListDAT} from a generic object, such as one from reading an XML
   * file.
   */
  static fromObject(obj: object, props?: SoftwareListDATProps): SoftwareListDAT {
    const dat = new SoftwareListDAT(props);
    return plainToClassFromExist(dat, obj, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    }).generateGameNamesToParents();
  }

  getHeader(): Header {
    return new Header({
      name: this.name,
      description: this.description,
    });
  }

  getGames(): Game[] {
    if (Array.isArray(this.software)) {
      return this.software;
    }
    return [this.software];
  }

  withGames(games: Game[]): DAT {
    return new SoftwareListDAT({ ...this, software: games });
  }
}
