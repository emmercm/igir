import stream from 'node:stream';

import Defaults from '../globals/defaults.js';

/**
 * A {@link stream.Transform} that passes through only the first `count` bytes of its input.
 * Once the limit is reached it ends itself and destroys every stream piped into it, so an
 * upstream decompressor stops producing bytes that would only be thrown away.
 */
export default class LimitBytesTransform extends stream.Transform {
  private remaining: number;

  private sources: stream.Readable[] = [];

  private stopped = false;

  constructor(count: number) {
    super({ highWaterMark: Defaults.FILE_READING_CHUNK_SIZE });
    this.remaining = count;
    // Remember what's piped in, so it can be stopped once the limit is reached
    this.on('pipe', (source: stream.Readable) => {
      this.sources.push(source);
    });
    this.on('unpipe', (source: stream.Readable) => {
      this.sources = this.sources.filter((piped) => piped !== source);
    });
  }

  /**
   * Pass through bytes until `count` bytes have been emitted, then stop the input.
   */
  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: stream.TransformCallback,
  ): void {
    if (this.remaining <= 0) {
      // Bytes past the limit, either a zero-byte limit or bytes that were already in flight
      // when the input was stopped
      callback();
      this.stopSources();
      return;
    }
    if (chunk.length < this.remaining) {
      this.remaining -= chunk.length;
      callback(undefined, chunk);
      return;
    }
    const sliced = chunk.subarray(0, this.remaining);
    this.remaining = 0;
    callback(undefined, sliced);
    this.stopSources();
  }

  private stopSources(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;

    const sources = this.sources;
    for (const source of sources) {
      source.unpipe(this);
    }
    // Ending the writable side lets this stream end normally. The sources are only destroyed
    // after that, because destroying them first would destroy this stream (and any output not
    // yet read) through the pipeline they share.
    this.once('finish', () => {
      for (const source of sources) {
        source.destroy();
      }
    });
    this.end();
  }
}
