import { Expose, Transform, Type } from 'class-transformer';

import Game, { GameProps } from '../game.js';
import DeviceRef from './deviceRef.js';

export interface MachineProps extends GameProps {
  readonly deviceRef?: DeviceRef | DeviceRef[],
}

/**
 * A machine?
 */
export default class Machine extends Game implements MachineProps {
  @Expose({ name: 'device_ref' })
  @Type(() => DeviceRef)
  @Transform(({ value }) => value || [])
  readonly deviceRef: DeviceRef | DeviceRef[];

  constructor(props?: MachineProps) {
    super(props);
    this.deviceRef = props?.deviceRef ?? [];
  }

  getDeviceRefs(): DeviceRef[] {
    if (Array.isArray(this.deviceRef)) {
      return this.deviceRef;
    } if (this.deviceRef) {
      return [this.deviceRef];
    }
    return [];
  }
}
