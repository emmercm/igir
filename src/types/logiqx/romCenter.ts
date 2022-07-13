import 'reflect-metadata';

import { Expose } from 'class-transformer';

/**
 * @see http://www.logiqx.com/DatFAQs/RomCenter.php
 */
export default class RomCenter {
  private readonly plugin?: string;

  @Expose({ name: 'rommode' })
  private readonly romMode: 'merged' | 'split' | 'unmerged' = 'split';

  @Expose({ name: 'biosmode' })
  private readonly biosMode: 'merged' | 'split' | 'unmerged' = 'split';

  @Expose({ name: 'samplemode' })
  private readonly sampleMode: 'merged' | 'unmerged' = 'merged';

  @Expose({ name: 'lockrommode' })
  private readonly lockRomMode: 'yes' | 'no' = 'no';

  @Expose({ name: 'lockbiosmode' })
  private readonly lockBiosMode: 'yes' | 'no' = 'no';

  @Expose({ name: 'locksamplemode' })
  private readonly lockSampleMode: 'yes' | 'no' = 'no';
}
