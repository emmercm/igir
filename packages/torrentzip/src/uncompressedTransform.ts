import type { TransformCallback } from 'node:stream';
import stream from 'node:stream';

import { Crc32 } from '@aws-crypto/crc32';

/**
 * A stream transform to calculate the size and CRC32 of a pre-compression file.
 */
export default class UncompressedTransform extends stream.Transform {
  private size = 0;
  private readonly crc32 = new Crc32();

  /**
   * Increment the size and update the CRC32, then passthrough the data.
   */
  _transform(
    chunk: Buffer<ArrayBuffer>,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.size += chunk.length;
    try {
      this.crc32.update(chunk);
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    // eslint-disable-next-line unicorn/no-null
    callback(null, chunk);
  }

  getSize(): number {
    return this.size;
  }

  getCrc32(): number {
    return this.crc32.digest();
  }
}
