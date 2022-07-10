export default class Disk {
  private readonly name!: string;

  private readonly sha1?: string;

  private readonly md5?: string;

  private readonly merge?: string;

  private readonly status: 'baddump' | 'nodump' | 'good' | 'verified' = 'good';
}
