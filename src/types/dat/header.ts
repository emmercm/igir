import { Expose, Type } from 'class-transformer';
import _ from 'reflect-metadata';

import ClrMamePro from './clrMamePro.js';
import RomCenter from './romCenter.js';

export default class Header {
  private readonly name!: string;

  private readonly description!: string;

  private readonly category?: string;

  private readonly version!: string;

  private readonly date?: string;

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
