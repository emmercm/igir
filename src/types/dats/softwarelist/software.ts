import { Expose, Transform, Type } from 'class-transformer';

import Game from '../game.js';
import ROM from '../rom.js';
import Part from './part.js';

/**
 * A MAME software image.
 */
export default class Software extends Game {
  @Expose()
  @Type(() => Part)
  @Transform(({ value }: { value: undefined | Part | Part[] }) => value ?? [])
  readonly part?: Part | Part[];

  constructor(part: Part | Part[]) {
    super();
    this.part = part;
  }

  private getParts(): Part[] {
    if (Array.isArray(this.part)) {
      return this.part;
    }
    if (this.part) {
      return [this.part];
    }
    return [];
  }

  getRoms(): ROM[] {
    return this.getParts()
      .flatMap((part) => part.getDataAreas())
      .flatMap((dataArea) => dataArea.getRoms());
  }
}
