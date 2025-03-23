import { Expose, Transform, Type } from 'class-transformer';

import DataArea from './dataArea.js';

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

  constructor(dataarea: DataArea | DataArea[]) {
    this.dataarea = dataarea;
  }

  getDataAreas(): DataArea[] {
    if (Array.isArray(this.dataarea)) {
      return this.dataarea;
    }
    return [this.dataarea];
  }
}
