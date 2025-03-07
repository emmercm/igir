import { Expose, Transform, Type } from 'class-transformer';

import Game, { GameProps } from '../game.js';
import DeviceRef from './deviceRef.js';

export interface MachineProps extends GameProps {
  readonly deviceRef?: DeviceRef | DeviceRef[];
}

/**
 * A machine?
 */
export default class Machine extends Game implements MachineProps {
  @Expose({ name: 'device_ref' })
  @Type(() => DeviceRef)
  @Transform(({ value }: { value: undefined | DeviceRef | DeviceRef[] }) => value ?? [])
  readonly deviceRef?: DeviceRef | DeviceRef[];

  constructor(props?: MachineProps) {
    super(props);
    this.deviceRef = props?.deviceRef ?? [];
  }

  getDeviceRefs(): DeviceRef[] {
    if (Array.isArray(this.deviceRef)) {
      return this.deviceRef;
    }
    if (this.deviceRef) {
      return [this.deviceRef];
    }
    return [];
  }

  // Immutable setters

  /**
   * Return a new copy of this {@link Machine} with some different properties.
   */
  withProps(props: MachineProps): Machine {
    return new Machine({ ...this, ...props });
  }
}
