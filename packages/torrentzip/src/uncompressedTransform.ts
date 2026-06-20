import type { TransformCallback } from 'node:stream';
import stream from 'node:stream';
import zlib from 'node:zlib';

/**
 * A stream transform to calculate the size and CRC32 of a pre-compression file.
 */
export default class UncompressedTransform extends stream.Transform {
  private size = 0;
  private crc32 = 0;

  /**
   * Increment the size and update the CRC32, then passthrough the data.
   */
  override _transform(
    chunk: Buffer<ArrayBuffer>,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.size += chunk.length;
    try {
      this.crc32 = zlib.crc32(chunk, this.crc32);
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
    return this.crc32 >>> 0;
  }
}
