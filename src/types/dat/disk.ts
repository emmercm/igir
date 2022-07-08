export default class Disk {
  private name!: string;

  private sha1?: string;

  private md5?: string;

  private merge?: string;

  private status: 'baddump' | 'nodump' | 'good' | 'verified' = 'good';
}
