import { Expose, plainToClassFromExist, Transform, Type } from 'class-transformer';

import DAT, { DATProps } from '../dat.js';
import Game from '../game.js';
import Header from '../logiqx/header.js';
import SoftwareListDAT from './softwareListDat.js';

export interface SoftwareListsDATProps extends DATProps {
  softwarelist?: SoftwareListDAT | SoftwareListDAT[];
}

/**
 * MAME-schema DAT that documents {@link SoftwareListDAT}s.
 */
export default class SoftwareListsDAT extends DAT implements SoftwareListsDATProps {
  @Expose()
  @Type(() => SoftwareListDAT)
  @Transform(({ value }: { value: undefined | SoftwareListDAT | SoftwareListDAT[] }) => value ?? [])
  readonly softwarelist: SoftwareListDAT | SoftwareListDAT[];

  constructor(props?: SoftwareListsDATProps) {
    super(props);
    this.softwarelist = props?.softwarelist ?? [];
    this.generateGameNamesToParents();
  }

  /**
   * Construct a {@link SoftwareListsDAT} from a generic object, such as one from reading an XML
   * file.
   */
  static fromObject(obj: object, props?: SoftwareListsDATProps): SoftwareListsDAT {
    const dat = new SoftwareListsDAT(props);
    return plainToClassFromExist(dat, obj, {
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
    return [this.softwarelist];
  }

  getGames(): Game[] {
    return this.getSoftwareLists().flatMap((softwareList) => softwareList.getGames());
  }

  withGames(games: Game[]): DAT {
    // This DAT is a list of DATs, so we need to type change here
    return new SoftwareListDAT({ ...this, software: games });
  }
}
