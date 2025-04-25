import stream, { TransformCallback } from 'node:stream';

import zlib113 from './zlib113.js';

/**
 * A zlib deflateRaw stream transform.
 */
export default class DeflateTransform extends stream.Transform {
  private readonly deflater = new zlib113.Deflater(9);

  constructor() {
    super({ objectMode: true });
  }
  /**
   * Deflate the chunk and emit the result.
   */
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      const compressedChunk = this.deflater.push(chunk);
      if (compressedChunk.length > 0) {
        this.push(compressedChunk);
      }
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  /**
   * Close the zlib deflater when the stream ends.
   */
  _flush(callback: TransformCallback): void {
    try {
      const finalChunk = this.deflater.push(Buffer.alloc(0), 4); // Z_FINISH
      if (finalChunk.length > 0) {
        this.push(finalChunk);
      }
      callback();
    } catch (error) {
      callback(error as Error);
    } finally {
      this.deflater.close();
    }
  }
}
