import { Expose, plainToInstance, Transform } from 'class-transformer';

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
  // The transform builds each ROM from the raw entries itself, so no @Type conversion runs first
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
   * A `<rom>` without a name isn't a file. MAME (romload.cpp, `rom_file_size()`) reads a file's size
   * as the longest of its runs: the named entry, or a `loadflag="reload"` entry that starts reading
   * it again, plus each `continue` or `ignore` entry straight after. Its checksums are of those
   * bytes; `fill` and `copy` aren't from the file and end it. So each named entry's size is set to
   * its longest run, and the unnamed entries are left out.
   */
  private static fileRoms(rom: RawRom | RawRom[] | undefined): RawRom[] {
    const entries = rom === undefined ? [] : [rom].flat();
    const roms: RawRom[] = [];
    // The file still being read, the length of its current run, and its longest run so far
    let file: RawRom | undefined;
    let run = 0;
    let longest = 0;
    const end = (): void => {
      if (file !== undefined) {
        file.size = Math.max(longest, run);
      }
      file = undefined;
    };
    for (const entry of entries) {
      if (entry.name !== undefined) {
        end();
        file = { ...entry };
        roms.push(file);
        run = this.sizeOf(entry.size);
        longest = 0;
      } else if (file !== undefined && entry.loadflag === 'reload') {
        longest = Math.max(longest, run);
        run = this.sizeOf(entry.size);
      } else if (
        file !== undefined &&
        (entry.loadflag === 'continue' || entry.loadflag === 'ignore')
      ) {
        run += this.sizeOf(entry.size);
      } else {
        end();
      }
    }
    end();
    return roms;
  }

  // As MAME's strtol(size, nullptr, 0): hex with 0x, octal with a leading 0, else decimal; 0 if
  // it doesn't parse
  private static sizeOf(size: string | number | undefined): number {
    if (typeof size === 'number') {
      return size;
    }
    const text = (size ?? '').trim();
    const hex = /^0x([\da-f]+)/i.exec(text)?.at(1);
    if (hex !== undefined) {
      return Number.parseInt(hex, 16);
    }
    const octal = /^0([0-7]+)/.exec(text)?.at(1);
    if (octal !== undefined) {
      return Number.parseInt(octal, 8);
    }
    return Number(/^\d*/.exec(text)?.at(0) ?? '') || 0;
  }

  getRoms(): ROM[] {
    if (Array.isArray(this.rom)) {
      return this.rom;
    }
    return [this.rom];
  }
}
