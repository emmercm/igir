import 'reflect-metadata';

import { Expose } from 'class-transformer';

export default class ClrMamePro {
  private readonly header?: string;

  @Expose({ name: 'forcemerging' })
  private readonly forceMerging: 'none' | 'split' | 'full' = 'split';

  @Expose({ name: 'forcenodump' })
  private readonly forceNoDump: 'obsolete' | 'required' | 'ignore' = 'obsolete';

  @Expose({ name: 'forcepacking' })
  private readonly forcePacking: 'zip' | 'unzip' = 'zip';
}
