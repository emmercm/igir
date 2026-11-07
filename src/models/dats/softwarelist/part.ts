import { Expose, Transform, Type } from 'class-transformer';

import DataArea from './dataArea.js';
import DiskArea from './diskArea.js';

/**
 * Media used by a {@link Software}.
 */
export default class Part {
  // @Expose()
  // readonly name?: string;

  // @Expose()
  // readonly interface?: string;

  @Expose()
  @Type(() => DataArea)
  @Transform(({ value }: { value: undefined | DataArea | DataArea[] }) => value ?? [])
  readonly dataarea: DataArea | DataArea[];

  @Expose()
  @Type(() => DiskArea)
  @Transform(({ value }: { value: undefined | DiskArea | DiskArea[] }) => value ?? [])
  readonly diskarea: DiskArea | DiskArea[];

  constructor(dataarea: DataArea | DataArea[], diskarea: DiskArea | DiskArea[] = []) {
    this.dataarea = dataarea;
    this.diskarea = diskarea;
  }

  getDataAreas(): DataArea[] {
    if (Array.isArray(this.dataarea)) {
      return this.dataarea;
    }
    return [this.dataarea];
  }

  getDiskAreas(): DiskArea[] {
    if (Array.isArray(this.diskarea)) {
      return this.diskarea;
    }
    return [this.diskarea];
  }
}
