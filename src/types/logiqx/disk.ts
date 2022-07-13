/**
 * "CMPro includes disk support but at this time, RomCenter does not. MD5 and
 * SHA1 do not both need to be specified in the data file:"
 *
 * @see http://www.logiqx.com/DatFAQs/CMPro.php
 */
export default class Disk {
  private readonly name!: string;

  private readonly sha1?: string;

  private readonly md5?: string;

  private readonly merge?: string;

  private readonly status: 'baddump' | 'nodump' | 'good' | 'verified' = 'good';
}
