import 'reflect-metadata';

import { Expose, Type } from 'class-transformer';

import ClrMamePro from './clrMamePro.js';
import RomCenter from './romCenter.js';

interface HeaderOptions {
  readonly name?: string;
  readonly description?: string;
  readonly category?: string;
  readonly version?: string;
  readonly date?: string;
  readonly author?: string;
  readonly email?: string;
  readonly homepage?: string;
  readonly url?: string;
  readonly comment?: string;
  readonly clrMamePro?: ClrMamePro;
  readonly romCenter?: RomCenter;
}

export default class Header implements HeaderOptions {
  /**
   * "Name of the emulator without a version number. This field is used by the
   * update feature of the CMPro profiler."
   */
  @Expose({ name: 'name' })
  readonly name: string;

  /**
   * "Name of the emulator with a version number. This is the name displayed by
   * CMPro."
   */
  @Expose({ name: 'description' })
  readonly description: string;

  /**
   * "General comment about the emulator (e.g. the systems or game types it
   * supports)."
   */
  @Expose({ name: 'category' })
  readonly category?: string;

  /**
   * "Version number of the data file. I would recommend using something like a
   * date encoded version number (YYYYMMDD is preferable to DDMMYYYY as it can
   * be sorted and is unambiguous)."
   */
  @Expose({ name: 'version' })
  readonly version: string;

  @Expose({ name: 'date' })
  readonly date?: string;

  /**
   * "Your name and e-mail/web address."
   */
  @Expose({ name: 'author' })
  readonly author: string;

  @Expose({ name: 'email' })
  readonly email?: string;

  @Expose({ name: 'homepage' })
  readonly homepage?: string;

  @Expose({ name: 'url' })
  readonly url?: string;

  @Expose({ name: 'comment' })
  readonly comment?: string;

  @Type(() => ClrMamePro)
  @Expose({ name: 'clrmamepro' })
  readonly clrMamePro?: ClrMamePro;

  @Type(() => RomCenter)
  @Expose({ name: 'romcenter' })
  readonly romCenter?: RomCenter;

  constructor(options?: HeaderOptions) {
    this.name = options?.name || '';
    this.description = options?.description || '';
    this.category = options?.category;
    this.version = options?.version || '';
    this.date = options?.date;
    this.author = options?.author || '';
    this.email = options?.email;
    this.homepage = options?.homepage;
    this.url = options?.url;
    this.comment = options?.comment;
    this.clrMamePro = options?.clrMamePro;
    this.romCenter = options?.romCenter;
  }

  getName(): string {
    return this.name;
  }

  getClrMamePro(): ClrMamePro | undefined {
    return this.clrMamePro;
  }
}
