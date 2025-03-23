import { Expose, Transform, Type } from 'class-transformer';

import ROM from '../rom.js';

/**
 * Media image used by a {@link Part}.
 */
export default class DataArea {
  // @Expose()
  // readonly name?: string;

  // @Expose()
  // readonly size?: number;

  @Expose()
  @Type(() => ROM)
  @Transform(({ value }: { value: undefined | ROM | ROM[] }) => value ?? [])
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
