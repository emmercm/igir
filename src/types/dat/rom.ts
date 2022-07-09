import path from 'path';

export default class ROM {
  private name!: string;

  private size!: number;

  private crc?: string;

  private sha1?: string;

  private md5?: string;

  private merge?: string;

  private status: 'baddump' | 'nodump' | 'good' | 'verified' = 'good';

  private date?: string;

  getExtension(): string {
    return path.extname(this.name);
  }

  getCrc(): string {
    return this.crc ? this.crc.replace(/^0x/, '').padStart(8, '0') : '';
  }

  getSha1(): string {
    return this.sha1 ? this.sha1.replace(/^0x/, '').padStart(40, '0') : '';
  }

  getMd5(): string {
    return this.md5 ? this.md5.replace(/^0x/, '').padStart(32, '0') : '';
  }
}
