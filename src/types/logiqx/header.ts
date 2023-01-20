import 'reflect-metadata';

import { Expose, Type } from 'class-transformer';

import ClrMamePro from './clrMamePro.js';
import RomCenter from './romCenter.js';

interface HeaderOptions {
  /**
   * "Name of the emulator without a version number. This field is used by the
   * update feature of the CMPro profiler."
   */
  readonly name?: string;

  /**
   * "Name of the emulator with a version number. This is the name displayed by
   * CMPro."
   */
  readonly description?: string;

  /**
   * "General comment about the emulator (e.g. the systems or game types it
   * supports)."
   */
  readonly category?: string;

  /**
   * "Version number of the data file. I would recommend using something like a
   * date encoded version number (YYYYMMDD is preferable to DDMMYYYY as it can
   * be sorted and is unambiguous)."
   */
  readonly version?: string;
  readonly date?: string;

  /**
   * "Your name and e-mail/web address."
   */
  readonly author?: string;
  readonly email?: string;
  readonly homepage?: string;
  readonly url?: string;
  readonly comment?: string;
  readonly clrMamePro?: ClrMamePro;
  readonly romCenter?: RomCenter;
}

export default class Header implements HeaderOptions {
  @Expose({ name: 'name' })
  readonly name: string;

  @Type(() => ClrMamePro)
  @Expose({ name: 'clrmamepro' })
  readonly clrMamePro?: ClrMamePro;

  constructor(options?: HeaderOptions) {
    this.name = options?.name || '';
    this.clrMamePro = options?.clrMamePro;
  }

  getName(): string {
    return this.name;
  }

  getClrMamePro(): ClrMamePro | undefined {
    return this.clrMamePro;
  }
}
