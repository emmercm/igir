import 'reflect-metadata';

import { Expose } from 'class-transformer';

interface RomCenterOptions {
  readonly plugin?: string;
  readonly romMode?: 'merged' | 'split' | 'unmerged';
  readonly biosMode?: 'merged' | 'split' | 'unmerged';
  readonly sampleMode?: 'merged' | 'unmerged';
  readonly lockRomMode?: 'yes' | 'no';
  readonly lockBiosMode?: 'yes' | 'no';
  readonly lockSampleMode?: 'yes' | 'no';
}

/**
 * @see http://www.logiqx.com/DatFAQs/RomCenter.php
 */
export default class RomCenter implements RomCenterOptions {
  @Expose({ name: 'plugin' })
  readonly plugin: string;

  @Expose({ name: 'rommode' })
  readonly romMode: 'merged' | 'split' | 'unmerged';

  @Expose({ name: 'biosmode' })
  readonly biosMode: 'merged' | 'split' | 'unmerged';

  @Expose({ name: 'samplemode' })
  readonly sampleMode: 'merged' | 'unmerged';

  @Expose({ name: 'lockrommode' })
  readonly lockRomMode: 'yes' | 'no';

  @Expose({ name: 'lockbiosmode' })
  readonly lockBiosMode: 'yes' | 'no';

  @Expose({ name: 'locksamplemode' })
  readonly lockSampleMode: 'yes' | 'no';

  constructor(options?: RomCenterOptions) {
    this.plugin = options?.plugin || '';
    this.romMode = options?.romMode || 'split';
    this.biosMode = options?.biosMode || 'split';
    this.sampleMode = options?.sampleMode || 'merged';
    this.lockRomMode = options?.lockRomMode || 'no';
    this.lockBiosMode = options?.lockBiosMode || 'no';
    this.lockSampleMode = options?.lockSampleMode || 'no';
  }
}
