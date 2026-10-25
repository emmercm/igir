import { Expose, Transform, Type } from 'class-transformer';

import Disk from '../disk.js';

/**
 * Disk image (CHD) used by a {@link Part}.
 */
export default class DiskArea {
  // @Expose()
  // readonly name?: string;

  @Expose()
  @Type(() => Disk)
  @Transform(({ value }: { value: undefined | Disk | Disk[] }) => value ?? [])
  readonly disk: Disk | Disk[];

  constructor(disk: Disk | Disk[]) {
    this.disk = disk;
  }

  getDisks(): Disk[] {
    if (Array.isArray(this.disk)) {
      return this.disk;
    }
    return [this.disk];
  }
}
