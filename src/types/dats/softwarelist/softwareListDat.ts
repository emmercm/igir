import { Expose, plainToInstance, Transform, Type } from 'class-transformer';

import DAT from '../dat.js';
import Game from '../game.js';
import Header from '../logiqx/header.js';
import Software from './software.js';

/**
 * MAME-schema DAT that documents {@link Software}s.
 */
export default class SoftwareListDAT extends DAT {
  @Expose()
  readonly name?: string;

  @Expose()
  readonly description?: string;

  @Expose()
  @Type(() => Software)
  @Transform(({ value }: { value: undefined | Software | Software[] }) => value ?? [])
  readonly software?: Software | Software[];

  constructor(software: Software | Software[]) {
    super();
    this.software = software;
  }

  /**
   * Construct a {@link SoftwareListDAT} from a generic object, such as one from reading an XML
   * file.
   */
  static fromObject(obj: object): SoftwareListDAT {
    return plainToInstance(SoftwareListDAT, obj, {
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
    if (this.software) {
      return [this.software];
    }
    return [];
  }
}
