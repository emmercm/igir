import { Expose, plainToClassFromExist, Transform, Type } from 'class-transformer';

import DAT, { DATProps } from '../dat.js';
import Game from '../game.js';
import Header from '../logiqx/header.js';
import SoftwareListDAT from './softwareListDat.js';

export interface SoftwareListsDATProps extends DATProps {
  name?: string;
  description?: string;
  softwarelist?: SoftwareListDAT | SoftwareListDAT[];
}

/**
 * MAME-schema DAT that documents {@link SoftwareListDAT}s.
 */
export default class SoftwareListsDAT extends DAT implements SoftwareListsDATProps {
  // Not read from the file (the root element has neither); named after the lists it holds
  name?: string;

  description?: string;

  @Expose()
  @Type(() => SoftwareListDAT)
  @Transform(({ value }: { value: undefined | SoftwareListDAT | SoftwareListDAT[] }) => value ?? [])
  readonly softwarelist?: SoftwareListDAT | SoftwareListDAT[];

  constructor(props?: SoftwareListsDATProps) {
    super(props);
    this.name = props?.name;
    this.description = props?.description;
    this.softwarelist = props?.softwarelist;
    this.generateGameNamesToParents();
  }

  /**
   * Construct a {@link SoftwareListsDAT} from a generic object, such as one from reading an XML
   * file.
   */
  static fromObject(obj: object, props?: DATProps): SoftwareListsDAT {
    // WARN(cemmer): plainToClassFromExist requires all class properties to be undefined, it will
    // not overwrite properties with a defined value
    const dat = plainToClassFromExist(new SoftwareListsDAT(props), obj, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    });
    const softwareLists = dat.getSoftwareLists();
    return new SoftwareListsDAT({
      ...dat,
      name: softwareLists.map((softwareList) => softwareList.getName()).join(', '),
      description: softwareLists.map((softwareList) => softwareList.getDescription()).join(', '),
    });
  }

  getHeader(): Header {
    return new Header({
      name: this.name,
      description: this.description,
    });
  }

  private getSoftwareLists(): SoftwareListDAT[] {
    if (this.softwarelist === undefined) {
      return [];
    }
    if (Array.isArray(this.softwarelist)) {
      return this.softwarelist;
    }
    return [this.softwarelist];
  }

  getGames(): Game[] {
    return this.getSoftwareLists().flatMap((softwareList) => softwareList.getGames());
  }

  /**
   * @inheritdoc
   */
  isMame(): boolean {
    return true;
  }

  withGames(games: Game[]): DAT {
    // This DAT is a list of DATs, so we need to type change here
    return new SoftwareListDAT({
      ...this,
      name: this.name,
      description: this.description,
      software: games,
    });
  }
}
