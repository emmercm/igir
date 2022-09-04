import 'reflect-metadata';

import { Expose } from 'class-transformer';

/**
 * "CMPro data files use a 'clrmamepro' element to specify details such as the
 * emulator name, description, category and the data file version."
 *
 * @see http://www.logiqx.com/DatFAQs/CMPro.php
 */
export default class ClrMamePro {
  /**
   * No-Intro DATs use this to indicate what file header has been added before the raw ROM data.
   * {@link FileHeader.HEADERS}
   */
  @Expose({ name: 'header' })
  private readonly header?: string;

  /**
   * "To force CMPro to use a particular merging format (none/split/full). Only
   * do this if the emulator doesn't allow all three of the modes!"
   */
  @Expose({ name: 'forcemerging' })
  private readonly forceMerging: 'none' | 'split' | 'full' = 'split';

  @Expose({ name: 'forcenodump' })
  private readonly forceNoDump: 'obsolete' | 'required' | 'ignore' = 'obsolete';

  @Expose({ name: 'forcepacking' })
  private readonly forcePacking: 'zip' | 'unzip' = 'zip';

  getHeader(): string | undefined {
    return this.header;
  }
}
