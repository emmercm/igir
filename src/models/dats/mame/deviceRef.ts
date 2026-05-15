import { Expose } from 'class-transformer';

/**
 * A reference to a device {@link Game}.
 */
export default class DeviceRef {
  @Expose()
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  getName(): string {
    return this.name;
  }
}
