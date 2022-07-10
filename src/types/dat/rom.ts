import path from 'path';

export default class ROM {
  private readonly name!: string;

  private readonly size!: number;

  private readonly crc?: string;

  private readonly sha1?: string;

  private readonly md5?: string;

  private readonly merge?: string;

  private readonly status: 'baddump' | 'nodump' | 'good' | 'verified' = 'good';

  private readonly date?: string;

  getName(): string {
    return this.name;
  }

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
