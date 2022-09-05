import { Expose } from 'class-transformer';

import File from '../files/file.js';

/**
 * @see http://www.logiqx.com/DatFAQs/CMPro.php
 */
export default class ROM {
  @Expose({ name: 'name' })
  private readonly name!: string;

  @Expose({ name: 'size' })
  private readonly size!: number;

  @Expose({ name: 'crc' })
  private readonly crc?: string;

  @Expose({ name: 'sha1' })
  private readonly sha1?: string;

  @Expose({ name: 'md5' })
  private readonly md5?: string;

  @Expose({ name: 'merge' })
  private readonly merge?: string;

  @Expose({ name: 'status' })
  private readonly status: 'baddump' | 'nodump' | 'good' | 'verified' = 'good';

  @Expose({ name: 'date' })
  private readonly date?: string;

  constructor(name: string, crc: string) {
    this.name = name;
    this.crc = crc;
  }

  getName(): string {
    return this.name;
  }

  getCrc32(): string {
    return this.crc ? this.crc.replace(/^0x/, '').padStart(8, '0') : '';
  }

  getSha1(): string {
    return this.sha1 ? this.sha1.replace(/^0x/, '').padStart(40, '0') : '';
  }

  getMd5(): string {
    return this.md5 ? this.md5.replace(/^0x/, '').padStart(32, '0') : '';
  }

  toFile(): File {
    return new File(this.getName(), undefined, this.getCrc32());
  }
}
