import { Expose, plainToInstance, Transform, Type } from 'class-transformer';

import ROM from '../rom.js';

interface RawRom {
  name?: string;
  size?: string | number;
  loadflag?: string;
  [key: string]: unknown;
}

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
  @Transform(({ obj }: { obj: { rom?: RawRom | RawRom[] } }) =>
    plainToInstance(ROM, DataArea.fileRoms(obj.rom), {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    }),
  )
  readonly rom: ROM | ROM[];

  constructor(rom: ROM | ROM[]) {
    this.rom = rom;
  }

  /**
   * A `<rom>` without a name isn't a file. MAME (romload.cpp, `rom_file_size()`) reads a file's
   * size as its named entry's plus each `loadflag="continue"` or `"ignore"` entry right after it,
   * and its checksums are of all of those bytes; `reload` reads the same bytes again, and `fill`
   * and `copy` aren't from the file. So those sizes are added to the named entry before it, and
   * the rest are left out.
   */
  private static fileRoms(rom: RawRom | RawRom[] | undefined): RawRom[] {
    const entries = rom === undefined ? [] : [rom].flat();
    const roms: RawRom[] = [];
    for (const entry of entries) {
      if (entry.name !== undefined) {
        roms.push({ ...entry });
        continue;
      }
      const named = roms.at(-1);
      if (named !== undefined && (entry.loadflag === 'continue' || entry.loadflag === 'ignore')) {
        named.size = this.sizeOf(named.size) + this.sizeOf(entry.size);
      }
    }
    return roms;
  }

  private static sizeOf(size: string | number | undefined): number {
    if (typeof size === 'number') {
      return size;
    }
    return size === undefined ? 0 : Number.parseInt(size);
  }

  getRoms(): ROM[] {
    if (Array.isArray(this.rom)) {
      return this.rom;
    }
    return [this.rom];
  }
}
