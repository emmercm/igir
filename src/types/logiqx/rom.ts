import { Expose } from 'class-transformer';

import File from '../files/file.js';

/**
 * @see http://www.logiqx.com/DatFAQs/CMPro.php
 */
export default class ROM {
  @Expose({ name: 'name' })
  private readonly name: string;

  @Expose({ name: 'size' })
  private readonly size: number;

  @Expose({ name: 'crc' })
  private readonly crc?: string;

  constructor(name: string, size: number, crc: string) {
    this.name = name;
    this.size = size;
    this.crc = crc;
  }

  getName(): string {
    return this.name.replace(/[\\/]/g, '/');
  }

  getSize(): number {
    return this.size;
  }

  getCrc32(): string {
    return this.crc ? this.crc.replace(/^0x/, '').padStart(8, '0') : '';
  }

  async toFile(): Promise<File> {
    return File.fileOf(this.getName(), this.getSize(), this.getCrc32());
  }

  /** *************************
   *                          *
   *     Pseudo Built-Ins     *
   *                          *
   ************************** */

  hashCode(): string {
    return File.hashCode(this.getCrc32(), this.getSize());
  }
}
