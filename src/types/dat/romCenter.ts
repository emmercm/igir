import { Expose } from 'class-transformer';

export default class RomCenter {
  private plugin?: string;

  @Expose({ name: 'rommode' })
  private romMode: 'merged' | 'split' | 'unmerged' = 'split';

  @Expose({ name: 'biosmode' })
  private biosMode: 'merged' | 'split' | 'unmerged' = 'split';

  @Expose({ name: 'samplemode' })
  private sampleMode: 'merged' | 'unmerged' = 'merged';

  @Expose({ name: 'lockrommode' })
  private lockRomMode: 'yes' | 'no' = 'no';

  @Expose({ name: 'lockbiosmode' })
  private lockBiosMode: 'yes' | 'no' = 'no';

  @Expose({ name: 'locksamplemode' })
  private lockSampleMode: 'yes' | 'no' = 'no';
}
