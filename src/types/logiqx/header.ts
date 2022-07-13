import 'reflect-metadata';

import { Expose, Type } from 'class-transformer';

import ClrMamePro from './clrMamePro.js';
import RomCenter from './romCenter.js';

export default class Header {
  /**
   * "Name of the emulator without a version number. This field is used by the
   * update feature of the CMPro profiler."
   */
  private readonly name!: string;

  /**
   * "Name of the emulator with a version number. This is the name displayed by
   * CMPro."
   */
  private readonly description!: string;

  /**
   * "General comment about the emulator (e.g. the systems or game types it
   * supports)."
   */
  private readonly category?: string;

  /**
   * "Version number of the data file. I would recommend using something like a
   * date encoded version number (YYYYMMDD is preferable to DDMMYYYY as it can
   * be sorted and is unambiguous)."
   */
  private readonly version!: string;

  private readonly date?: string;

  /**
   * "Your name and e-mail/web address."
   */
  private readonly author!: string;

  private readonly email?: string;

  private readonly homepage?: string;

  private readonly url?: string;

  private readonly comment?: string;

  @Type(() => ClrMamePro)
  @Expose({ name: 'clrmamepro' })
  private readonly clrMamePro?: ClrMamePro;

  @Type(() => RomCenter)
  @Expose({ name: 'romcenter' })
  private readonly romCenter?: RomCenter;

  getName(): string {
    return this.name;
  }
}
