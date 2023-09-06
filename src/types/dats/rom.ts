import { Expose } from 'class-transformer';

import Archive from '../files/archives/archive.js';
import ArchiveEntry from '../files/archives/archiveEntry.js';
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

  @Expose({ name: 'md5' })
  private readonly md5?: string;

  @Expose({ name: 'sha1' })
  private readonly sha1?: string;

  @Expose({ name: 'status' })
  private readonly status?: string;

  constructor(name: string, size: number, crc: string, md5?: string, sha1?: string) {
    this.name = name;
    this.size = size;
    this.crc = crc;
    this.md5 = md5;
    this.sha1 = sha1;
  }

  /**
   * Create an XML object, to be used by the owning {@link Game}.
   */
  toXmlDatObj(): object {
    return {
      $: {
        name: this.name,
        size: this.size,
        crc: this.crc,
        md5: this.md5,
        sha1: this.sha1,
        status: this.status,
      },
    };
  }

  // Property getters

  getName(): string {
    return this.name.replace(/[\\/]/g, '/');
  }

  getSize(): number {
    return this.size;
  }

  getCrc32(): string {
    return this.crc ? this.crc.replace(/^0x/, '').padStart(8, '0') : '';
  }

  /**
   * Turn this {@link ROM} into a non-existent {@link File}.
   */
  async toFile(): Promise<File> {
    return File.fileOf(this.getName(), this.getSize(), this.getCrc32());
  }

  /**
   * Turn this {@link ROM} into a non-existent {@link ArchiveEntry}, given a {@link Archive}.
   */
  async toArchiveEntry<A extends Archive>(archive: A): Promise<ArchiveEntry<A>> {
    return ArchiveEntry.entryOf(archive, this.getName(), this.getSize(), this.getCrc32());
  }

  /**
   ****************************
   *
   *     Pseudo Built-Ins     *
   *
   ****************************
   */

  /**
   * A string hash code to uniquely identify this {@link ROM}.
   */
  hashCode(): string {
    return File.hashCode(this.getCrc32(), this.getSize());
  }
}
