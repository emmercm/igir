import { Expose } from 'class-transformer';

interface DiskOptions {
  readonly name?: string;
  readonly sha1?: string;
  readonly md5?: string;
  readonly merge?: string;
  readonly status?: 'baddump' | 'nodump' | 'good' | 'verified';
}

/**
 * "CMPro includes disk support but at this time, RomCenter does not. MD5 and
 * SHA1 do not both need to be specified in the data file:"
 *
 * @see http://www.logiqx.com/DatFAQs/CMPro.php
 */
export default class Disk implements DiskOptions {
  @Expose({ name: 'name' })
  readonly name: string;

  @Expose({ name: 'sha1' })
  readonly sha1: string;

  @Expose({ name: 'md5' })
  readonly md5: string;

  @Expose({ name: 'merge' })
  readonly merge: string;

  @Expose({ name: 'status' })
  readonly status: 'baddump' | 'nodump' | 'good' | 'verified';

  constructor(options?: DiskOptions) {
    this.name = options?.name ?? '';
    this.sha1 = options?.sha1 ?? '';
    this.md5 = options?.md5 ?? '';
    this.merge = options?.merge ?? '';
    this.status = options?.status ?? 'good';
  }
}
