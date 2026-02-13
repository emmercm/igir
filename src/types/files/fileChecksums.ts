import crypto from 'node:crypto';
import type stream from 'node:stream';
import { Readable } from 'node:stream';

import { Crc32 } from '@aws-crypto/crc32';

import type { FsReadCallback } from '../../polyfill/fsReadTransform.js';
import FsReadTransform from '../../polyfill/fsReadTransform.js';
import StreamPoly from '../../polyfill/streamPoly.js';
import File from './file.js';

export const ChecksumBitmask = {
  NONE: 0x0_00,
  CRC32: 0x0_01,
  MD5: 0x0_10,
  SHA1: 0x1_00,
  SHA256: 0x10_00,
} as const;
export type ChecksumBitmaskKey = keyof typeof ChecksumBitmask;
export type ChecksumBitmaskValue = (typeof ChecksumBitmask)[ChecksumBitmaskKey];
export const ChecksumBitmaskInverted = Object.fromEntries(
  Object.entries(ChecksumBitmask).map(([key, value]) => [value, key]),
) as Record<ChecksumBitmaskValue, ChecksumBitmaskKey>;

export interface ChecksumProps {
  crc32?: string;
  md5?: string;
  sha1?: string;
  sha256?: string;
}

export default {
  async hashData(data: Buffer | string, checksumBitmask: number): Promise<ChecksumProps> {
    const readable = new Readable();
    readable.push(data);
    // eslint-disable-next-line unicorn/no-null
    readable.push(null);
    return this.hashStream(readable, checksumBitmask);
  },

  async hashFile(
    filePath: string,
    checksumBitmask: number,
    start?: number,
    end?: number,
    callback?: FsReadCallback,
  ): Promise<ChecksumProps> {
    return File.createStreamFromFile(
      filePath,
      async (readable) => this.hashStream(readable, checksumBitmask, callback),
      start,
      end,
    );
  },

  async hashStream(
    readable: stream.Readable,
    checksumBitmask: number,
    callback?: FsReadCallback,
  ): Promise<ChecksumProps> {
    // Not calculating any checksums, do nothing
    if (!checksumBitmask) {
      // WARN(cemmer): this may leave the readable un-drained and therefore some file handles open!
      return {};
    }

    const streamWithCallback =
      callback === undefined
        ? readable
        : StreamPoly.withTransforms(readable, new FsReadTransform(callback));

    const crc = checksumBitmask & ChecksumBitmask.CRC32 ? new Crc32() : undefined;
    const md5 = checksumBitmask & ChecksumBitmask.MD5 ? crypto.createHash('md5') : undefined;
    const sha1 = checksumBitmask & ChecksumBitmask.SHA1 ? crypto.createHash('sha1') : undefined;
    const sha256 =
      checksumBitmask & ChecksumBitmask.SHA256 ? crypto.createHash('sha256') : undefined;

    for await (const chunk of streamWithCallback as AsyncIterable<Buffer>) {
      crc?.update(chunk);
      md5?.update(chunk);
      sha1?.update(chunk);
      sha256?.update(chunk);
    }

    return {
      crc32:
        crc?.digest().toString(16).padStart(8, '0') ??
        // Empty files won't emit any data, default to the empty file CRC32
        (checksumBitmask & ChecksumBitmask.CRC32 ? '00000000' : undefined),
      md5: md5?.digest('hex').padStart(32, '0'),
      sha1: sha1?.digest('hex').padStart(40, '0'),
      sha256: sha256?.digest('hex').padStart(64, '0'),
    };
  },
};
