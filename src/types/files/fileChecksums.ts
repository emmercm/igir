import { crc32 } from '@node-rs/crc32';
import crypto from 'crypto';
import { Stream } from 'stream';

export enum ChecksumBitmask {
  CRC32 = 0x001,
  MD5 = 0x010,
  SHA1 = 0x100,
}

export interface ChecksumProps {
  crc32?: string,
  md5?: string,
  sha1?: string,
}

export default class FileChecksums {
  public static async hashStream(
    stream: Stream,
    checksumBitmask: number,
  ): Promise<ChecksumProps> {
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
          crc32: (crc ?? 0).toString(16),
          md5: md5 !== undefined ? md5.digest('hex') : undefined,
          sha1: sha1 !== undefined ? sha1.digest('hex') : undefined,
        });
      });

      stream.on('error', reject);
    });
  }
}
