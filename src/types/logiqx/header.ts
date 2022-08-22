import 'reflect-metadata';

import { Expose, Type } from 'class-transformer';

import ClrMamePro from './clrMamePro.js';
import RomCenter from './romCenter.js';

interface HeaderOptions {
  name?: string;
  description?: string;
  category?: string;
  version?: string;
  date?: string;
  author?: string;
  email?: string;
  homepage?: string;
  url?: string;
  comment?: string;
  clrMamePro?: ClrMamePro;
  romCenter?: RomCenter;
}

export default class Header {
  /**
   * "Name of the emulator without a version number. This field is used by the
   * update feature of the CMPro profiler."
   */
  @Expose({ name: 'name' })
  private readonly name!: string;

  /**
   * "Name of the emulator with a version number. This is the name displayed by
   * CMPro."
   */
  @Expose({ name: 'description' })
  private readonly description!: string;

  /**
   * "General comment about the emulator (e.g. the systems or game types it
   * supports)."
   */
  @Expose({ name: 'category' })
  private readonly category?: string;

  /**
   * "Version number of the data file. I would recommend using something like a
   * date encoded version number (YYYYMMDD is preferable to DDMMYYYY as it can
   * be sorted and is unambiguous)."
   */
  @Expose({ name: 'version' })
  private readonly version!: string;

  @Expose({ name: 'date' })
  private readonly date?: string;

  /**
   * "Your name and e-mail/web address."
   */
  @Expose({ name: 'author' })
  private readonly author!: string;

  @Expose({ name: 'email' })
  private readonly email?: string;

  @Expose({ name: 'homepage' })
  private readonly homepage?: string;

  @Expose({ name: 'url' })
  private readonly url?: string;

  @Expose({ name: 'comment' })
  private readonly comment?: string;

  @Type(() => ClrMamePro)
  @Expose({ name: 'clrmamepro' })
  private readonly clrMamePro?: ClrMamePro;

  @Type(() => RomCenter)
  @Expose({ name: 'romcenter' })
  private readonly romCenter?: RomCenter;

  constructor(options?: HeaderOptions) {
    if (options) {
      this.name = options.name || '';
      this.description = options.description || '';
      this.category = options.category;
      this.version = options.version || '';
      this.date = options.date;
      this.author = options.author || '';
      this.email = options.email;
      this.homepage = options.homepage;
      this.url = options.url;
      this.comment = options.comment;
      this.clrMamePro = options.clrMamePro;
      this.romCenter = options.romCenter;
    }
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string {
    return this.description;
  }

  getVersion(): string {
    return this.version;
  }

  getDate(): string | undefined {
    return this.date;
  }
}
