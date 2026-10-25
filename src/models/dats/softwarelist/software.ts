import { Expose, Transform, Type } from 'class-transformer';

import Disk from '../disk.js';
import Game, { GameProps } from '../game.js';
import ROM from '../rom.js';
import Part from './part.js';

/**
 * A MAME software image.
 */
export default class Software extends Game {
  @Expose()
  @Type(() => Part)
  @Transform(({ value }: { value: undefined | Part | Part[] }) => value ?? [])
  readonly part: Part | Part[];

  constructor(part: Part | Part[]) {
    super();
    this.part = part;
  }

  private getParts(): Part[] {
    if (Array.isArray(this.part)) {
      return this.part;
    }
    return [this.part];
  }

  override getRoms(): ROM[] {
    return this.getParts()
      .flatMap((part) => part.getDataAreas())
      .flatMap((dataArea) => dataArea.getRoms());
  }

  override getDisks(): Disk[] {
    return this.getParts()
      .flatMap((part) => part.getDiskAreas())
      .flatMap((diskArea) => diskArea.getDisks());
  }

  /**
   * Return a new {@link Game} with some different properties. Special care is needed to preserve
   * this game's ROMs and disks, as it does not populate {@link Game#roms} or {@link Game#disks}.
   */
  override withProps(props: GameProps): Game {
    return new Game({ ...this, roms: this.getRoms(), disks: this.getDisks(), ...props });
  }
}
