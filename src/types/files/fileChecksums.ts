import crypto from 'node:crypto';
import { Readable, Stream } from 'node:stream';

import { crc32 } from '@node-rs/crc32';

export enum ChecksumBitmask {
  NONE = 0x0_00,
  CRC32 = 0x0_01,
  MD5 = 0x0_10,
  SHA1 = 0x1_00,
}

export interface ChecksumProps {
  crc32?: string,
  md5?: string,
  sha1?: string,
}

export default class FileChecksums {
  public static async hashData(
    data: Buffer | string,
    checksumBitmask: number,
  ): Promise<ChecksumProps> {
    const readable = new Readable();
    readable.push(data);
    // eslint-disable-next-line unicorn/no-null
    readable.push(null);
    return this.hashStream(readable, checksumBitmask);
  }

  public static async hashStream(
    stream: Stream,
    checksumBitmask: number,
  ): Promise<ChecksumProps> {
    // Not calculating any checksums, do nothing
    if (!checksumBitmask) {
      return {};
    }

    return new Promise((resolve, reject) => {
      let crc: number | undefined;
      const md5 = checksumBitmask & ChecksumBitmask.MD5 ? crypto.createHash('md5') : undefined;
      const sha1 = checksumBitmask & ChecksumBitmask.SHA1 ? crypto.createHash('sha1') : undefined;

      stream.on('data', (chunk) => {
        if (checksumBitmask & ChecksumBitmask.CRC32) {
          crc = crc32(chunk, crc);
        }
        if (md5) {
          md5.update(chunk);
        }
        if (sha1) {
          sha1.update(chunk);
        }
      });
      stream.on('end', () => {
        resolve({
          crc32: crc?.toString(16),
          md5: md5?.digest('hex'),
          sha1: sha1?.digest('hex'),
        });
      });

      stream.on('error', reject);
    });
  }
}
