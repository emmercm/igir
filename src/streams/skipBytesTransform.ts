import stream from 'node:stream';

import Defaults from '../globals/defaults.js';

/**
 * A {@link stream.Transform} that drops the first `count` bytes of its input.
 */
export default class SkipBytesTransform extends stream.Transform {
  private remaining: number;

  constructor(count: number) {
    super({ highWaterMark: Defaults.FILE_READING_CHUNK_SIZE });
    this.remaining = count;
  }

  /**
   * Pass through bytes after the leading `count` bytes have been dropped.
   */
  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: stream.TransformCallback,
  ): void {
    if (this.remaining > 0) {
      if (chunk.length <= this.remaining) {
        this.remaining -= chunk.length;
        callback();
        return;
      }
      const sliced = chunk.subarray(this.remaining);
      this.remaining = 0;
      callback(undefined, sliced);
      return;
    }
    callback(undefined, chunk);
  }
}
