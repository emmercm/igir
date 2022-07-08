import { Expose } from 'class-transformer';

export default class ClrMamePro {
  private header?: string;

  @Expose({ name: 'forcemerging' })
  private forceMerging: 'none' | 'split' | 'full' = 'split';

  @Expose({ name: 'forcenodump' })
  private forceNoDump: 'obsolete' | 'required' | 'ignore' = 'obsolete';

  @Expose({ name: 'forcepacking' })
  private forcePacking: 'zip' | 'unzip' = 'zip';
}
