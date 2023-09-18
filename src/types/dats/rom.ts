import { Expose } from 'class-transformer';

import Archive from '../files/archives/archive.js';
import ArchiveEntry from '../files/archives/archiveEntry.js';
import File from '../files/file.js';

export interface ROMProps {
  readonly name: string,
  readonly size: number,
  readonly crc?: string,
  readonly md5?: string,
  readonly sha1?: string,
  readonly status?: string,
  readonly merge?: string,
  readonly bios?: string,
}

/**
 * @see http://www.logiqx.com/DatFAQs/CMPro.php
 */
export default class ROM implements ROMProps {
  @Expose()
  readonly name: string;

  @Expose()
  readonly size: number;

  @Expose()
  readonly crc?: string;

  @Expose()
  readonly md5?: string;

  @Expose()
  readonly sha1?: string;

  @Expose()
  readonly status?: string;

  @Expose()
  readonly merge?: string;

  @Expose()
  readonly bios?: string;

  constructor(props?: ROMProps) {
    this.name = props?.name ?? '';
    this.size = props?.size ?? 0;
    this.crc = props?.crc;
    this.md5 = props?.md5;
    this.sha1 = props?.sha1;
    this.status = props?.status;
    this.merge = props?.merge;
    this.bios = props?.bios;
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

  getMerge(): string | undefined {
    return this.merge;
  }

  getBios(): string | undefined {
    return this.bios;
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
