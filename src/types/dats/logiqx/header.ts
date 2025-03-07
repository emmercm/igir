import 'reflect-metadata';

import { Expose, Type } from 'class-transformer';

import ClrMamePro from './clrMamePro.js';

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
  // readonly category?: string;

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
  // readonly email?: string;
  // readonly homepage?: string;
  readonly url?: string;
  readonly comment?: string;
  readonly clrMamePro?: ClrMamePro;
  // readonly romCenter?: RomCenter;
}

/**
 * Metadata for a {@link DAT}.
 */
export default class Header implements HeaderOptions {
  @Expose({ name: 'name' })
  readonly name: string;

  @Expose({ name: 'description' })
  readonly description?: string;

  @Expose({ name: 'version' })
  readonly version?: string;

  @Expose({ name: 'date' })
  readonly date?: string;

  @Expose({ name: 'author' })
  readonly author?: string;

  @Expose({ name: 'url' })
  readonly url?: string;

  @Expose({ name: 'comment' })
  readonly comment?: string;

  @Type(() => ClrMamePro)
  @Expose({ name: 'clrmamepro' })
  readonly clrMamePro?: ClrMamePro;

  constructor(options?: HeaderOptions) {
    this.name = options?.name ?? '';
    this.description = options?.description;
    this.version = options?.version;
    this.date = options?.date;
    this.author = options?.author;
    this.url = options?.url;
    this.comment = options?.comment;
    this.clrMamePro = options?.clrMamePro;
  }

  /**
   * Create an XML object, to be used by the owning {@link DAT}.
   */
  toXmlDatObj(): object {
    return Object.fromEntries(
      Object.entries({
        name: this.name,
        description: this.description,
        version: this.version,
        date: this.date,
        author: this.author,
        url: this.url,
        comment: this.comment,
      }).filter(([, val]) => val !== undefined),
    );
  }

  // Property getters

  getName(): string {
    return this.name;
  }

  getDescription(): string | undefined {
    return this.description;
  }

  getVersion(): string | undefined {
    return this.version;
  }

  getComment(): string | undefined {
    return this.comment;
  }

  getClrMamePro(): ClrMamePro | undefined {
    return this.clrMamePro;
  }

  // Computed getters

  /**
   * Return a string representation of this {@link Header}.
   */
  toString(): string {
    return JSON.stringify(this, undefined, '  ').replace(/\n +/g, ' ');
  }
}
