import stream from 'node:stream';

import zstd from '../../zstd-1.5.5/index.js';

/**
 * A Transform stream that compresses data using zstd synchronous compression.
 */
export default class ZstdNonThreadedCompressTransform extends stream.Transform {
  private readonly chunks: Buffer[] = [];

  /**
   * Buffer all read file data.
   */
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: stream.TransformCallback): void {
    this.chunks.push(chunk);
    callback();
  }

  /**
   * Compress all file data in a single call.
   */
  _flush(callback: stream.TransformCallback): void {
    this.push(zstd.compressNonThreaded(Buffer.concat(this.chunks), 19));
    callback();
  }
}
