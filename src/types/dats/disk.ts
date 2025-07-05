import type { ROMProps } from './rom.js';
import ROM from './rom.js';

interface DiskProps extends Omit<ROMProps, 'size'> {
  size?: number;
  // region?: string,
  // index?: number,
  // writable?: 'yes' | 'no',
}

/**
 * "CMPro includes disk support but at this time, RomCenter does not. MD5 and
 * SHA1 do not both need to be specified in the data file:"
 * @see http://www.logiqx.com/DatFAQs/CMPro.php
 */
export default class Disk extends ROM implements DiskProps {
  constructor(props?: DiskProps) {
    super(
      props
        ? {
            ...props,
            size: props.size ?? 0,
          }
        : undefined,
    );
  }
}
