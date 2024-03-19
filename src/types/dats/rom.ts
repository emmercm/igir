import { Expose } from 'class-transformer';

import Archive from '../files/archives/archive.js';
import ArchiveEntry from '../files/archives/archiveEntry.js';
import File from '../files/file.js';
import { ChecksumProps } from '../files/fileChecksums.js';

type ROMStatus = 'baddump' | 'nodump' | 'good';

export interface ROMProps extends ChecksumProps {
  readonly name: string,
  readonly size: number,
  readonly status?: ROMStatus,
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

  @Expose({ name: 'crc' })
  readonly crc32?: string;

  @Expose()
  readonly md5?: string;

  @Expose()
  readonly sha1?: string;

  @Expose()
  readonly status?: ROMStatus;

  @Expose()
  readonly merge?: string;

  @Expose()
  readonly bios?: string;

  constructor(props?: ROMProps) {
    this.name = props?.name ?? '';
    this.size = props?.size ?? 0;
    this.crc32 = props?.crc32?.toLowerCase().replace(/^0x/, '').padStart(8, '0');
    this.md5 = props?.md5?.toLowerCase().replace(/^0x/, '').padStart(32, '0');;
    this.sha1 = props?.sha1?.toLowerCase().replace(/^0x/, '').padStart(40, '0');
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
        name: this.getName(),
        size: this.getSize(),
        crc: this.getCrc32(),
        md5: this.getMd5(),
        sha1: this.getSha1(),
        status: this.getStatus(),
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

  getCrc32(): string | undefined {
    return this.crc32;
  }

  getMd5(): string | undefined {
    return this.md5;
  }

  getSha1(): string | undefined {
    return this.sha1;
  }

  getStatus(): ROMStatus | undefined {
    return this.status;
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
    return File.fileOf({
      ...this,
      filePath: this.getName(),
      size: this.getSize(),
    });
  }

  /**
   * Turn this {@link ROM} into a non-existent {@link ArchiveEntry}, given a {@link Archive}.
   */
  async toArchiveEntry<A extends Archive>(archive: A): Promise<ArchiveEntry<A>> {
    return ArchiveEntry.entryOf({
      ...this,
      archive,
      entryPath: this.getName(),
      size: this.getSize(),
    });
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
    return this.getSha1()
      ?? this.getMd5()
      ?? `${this.getCrc32()}|${this.getSize()}`;
  }
}
