import { Expose, Type } from 'class-transformer';

import ClrMamePro from './clrMamePro';
import RomCenter from './romCenter';

export default class Header {
  private name!: string;

  private description!: string;

  private category?: string;

  private version!: string;

  private date?: string;

  private author!: string;

  private email?: string;

  private homepage?: string;

  private url?: string;

  private comment?: string;

  @Type(() => ClrMamePro)
  @Expose({ name: 'clrmamepro' })
  private clrMamePro?: ClrMamePro;

  @Type(() => RomCenter)
  @Expose({ name: 'romcenter' })
  private romCenter?: RomCenter;

  getName(): string {
    return this.name;
  }
}
