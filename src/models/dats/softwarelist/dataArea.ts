import { Expose, Transform, Type } from 'class-transformer';

import ROM from '../rom.js';

/**
 * Media image used by a {@link Part}.
 */
export default class DataArea {
  // @Expose()
  // readonly name?: string;

  // @Expose()
  // TODO: when uncommenting this, it will need a @Transform
  // readonly size?: number;

  @Expose()
  @Type(() => ROM)
  // A <rom> without a name (loadflag="continue", "reload", "fill", …) loads part of the ROM before
  // it again at another offset; it isn't a file of its own
  @Transform(({ value }: { value: undefined | ROM | ROM[] }) =>
    (value === undefined ? [] : [value].flat()).filter(
      (rom) => (rom as Partial<ROM>).name !== undefined,
    ),
  )
  readonly rom: ROM | ROM[];

  constructor(rom: ROM | ROM[]) {
    this.rom = rom;
  }

  getRoms(): ROM[] {
    if (Array.isArray(this.rom)) {
      return this.rom;
    }
    return [this.rom];
  }
}
