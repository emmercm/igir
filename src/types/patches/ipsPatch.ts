import path from 'path';

import FilePoly from '../../polyfill/filePoly.js';
import File from '../files/file.js';
import Patch from './patch.js';

interface IPSRecord {
  offset: number,
  data: Buffer,
}

/**
 * @link https://zerosoft.zophar.net/ips.php
 */
export default class IPSPatch extends Patch {
  private readonly records: IPSRecord[] = [];

  static patchFrom(file: File): IPSPatch {
    const crcBefore = Patch.getCrcFromPath(file.getExtractedFilePath());
    return new IPSPatch(file, crcBefore);
  }

  getRomName(): string {
    return path.parse(this.getFile().getExtractedFilePath()).name
      .replace(new RegExp(this.getCrcBefore(), 'g'), '')
      .trim();
  }

  private async parsePatch(): Promise<void> {
    if (this.records.length) {
      return;
    }

    await this.getFile().extractToFile(async (patchFile) => {
      const fp = await FilePoly.fileFrom(patchFile, 'r');

      const header = (await fp.readNext(5)).toString();
      if (header !== 'PATCH') {
        throw new Error(`IPS patch header is invalid: ${this.getFile().toString()}`);
      }

      /* eslint-disable no-constant-condition, no-await-in-loop */
      while (true) {
        const offset = await fp.readNext(3);
        if (offset === null || offset.toString() === 'EOF') {
          break;
        }

        const offsetInt = parseInt(offset.toString('hex'), 16);
        const size = parseInt((await fp.readNext(2)).toString('hex'), 16);
        if (size === 0) {
          // Run-length encoding record
          const rleSize = parseInt((await fp.readNext(2)).toString('hex'), 16);
          const data = Buffer.from((await fp.readNext(1)).toString('hex')
            .repeat(rleSize), 'hex');
          this.records.push({ offset: offsetInt, data });
        } else {
          // Standard record
          const data = await fp.readNext(size);
          this.records.push({ offset: offsetInt, data });
        }
      }

      await fp.close();
    });
  }

  async apply<T>(
    file: File,
    callback: (tempFile: string) => (T | Promise<T>),
  ): Promise<T> {
    await this.parsePatch();

    return file.extractToTempFile(async (tempFile) => {
      const fp = await FilePoly.fileFrom(tempFile, 'r+');

      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < this.records.length; i += 1) {
        const record = this.records[i];
        await fp.writeAt(record.data, record.offset);
      }

      await fp.close();

      return callback(tempFile);
    });
  }
}
