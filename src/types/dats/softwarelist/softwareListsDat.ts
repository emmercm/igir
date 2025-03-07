import { Expose, plainToInstance, Transform, Type } from 'class-transformer';

import DAT from '../dat.js';
import Game from '../game.js';
import Header from '../logiqx/header.js';
import SoftwareListDAT from './softwareListDat.js';

/**
 * MAME-schema DAT that documents {@link SoftwareListDAT}s.
 */
export default class SoftwareListsDAT extends DAT {
  @Expose()
  @Type(() => SoftwareListDAT)
  @Transform(({ value }: { value: undefined | SoftwareListDAT | SoftwareListDAT[] }) => value ?? [])
  readonly softwarelist?: SoftwareListDAT | SoftwareListDAT[];

  /**
   * Construct a {@link SoftwareListsDAT} from a generic object, such as one from reading an XML
   * file.
   */
  static fromObject(obj: object): SoftwareListsDAT {
    return plainToInstance(SoftwareListsDAT, obj, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    }).generateGameNamesToParents();
  }

  getHeader(): Header {
    return new Header({
      name: this.getSoftwareLists()
        .map((softwareList) => softwareList.getName())
        .join(', '),
      description: this.getSoftwareLists()
        .map((softwareList) => softwareList.getDescription())
        .join(', '),
    });
  }

  private getSoftwareLists(): SoftwareListDAT[] {
    if (Array.isArray(this.softwarelist)) {
      return this.softwarelist;
    }
    if (this.softwarelist) {
      return [this.softwarelist];
    }
    return [];
  }

  getGames(): Game[] {
    return this.getSoftwareLists().flatMap((softwareList) => softwareList.getGames());
  }
}
