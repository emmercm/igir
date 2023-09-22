import 'reflect-metadata';

import { Expose } from 'class-transformer';

interface ClrMameProOptions {
  readonly header?: string;
  readonly forceMerging?: 'none' | 'split' | 'full';
  readonly forceNoDump?: 'obsolete' | 'required' | 'ignore';
  readonly forcePacking?: 'zip' | 'unzip';
}

/**
 * "CMPro data files use a 'clrmamepro' element to specify details such as the
 * emulator name, description, category and the data file version."
 * @see http://www.logiqx.com/DatFAQs/CMPro.php
 */
export default class ClrMamePro implements ClrMameProOptions {
  /**
   * No-Intro DATs use this to indicate what file header has been added before the raw ROM data.
   * {@link FileHeader.HEADERS}
   */
  @Expose({ name: 'header' })
  readonly header: string;

  /**
   * "To force CMPro to use a particular merging format (none/split/full). Only
   * do this if the emulator doesn't allow all three of the modes!"
   */
  @Expose({ name: 'forcemerging' })
  readonly forceMerging: 'none' | 'split' | 'full';

  @Expose({ name: 'forcenodump' })
  readonly forceNoDump: 'obsolete' | 'required' | 'ignore';

  @Expose({ name: 'forcepacking' })
  readonly forcePacking: 'zip' | 'unzip';

  constructor(options?: ClrMameProOptions) {
    this.header = options?.header ?? '';
    this.forceMerging = options?.forceMerging ?? 'split';
    this.forceNoDump = options?.forceNoDump ?? 'obsolete';
    this.forcePacking = options?.forcePacking ?? 'zip';
  }

  getHeader(): string {
    return this.header;
  }
}
