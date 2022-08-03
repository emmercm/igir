import { Expose } from 'class-transformer';

/**
 * "CMPro includes disk support but at this time, RomCenter does not. MD5 and
 * SHA1 do not both need to be specified in the data file:"
 *
 * @see http://www.logiqx.com/DatFAQs/CMPro.php
 */
export default class Disk {
  @Expose({ name: 'name' })
  private readonly name!: string;

  @Expose({ name: 'sha1' })
  private readonly sha1?: string;

  @Expose({ name: 'md5' })
  private readonly md5?: string;

  @Expose({ name: 'merge' })
  private readonly merge?: string;

  @Expose({ name: 'status' })
  private readonly status: 'baddump' | 'nodump' | 'good' | 'verified' = 'good';
}
