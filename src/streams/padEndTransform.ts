import stream from 'node:stream';

import Defaults from '../globals/defaults.js';

/**
 * A {@link stream.Transform} that passes its input through, then appends a fill byte until the
 * total number of bytes emitted reaches `maxLength`. Input longer than `maxLength` is passed
 * through unchanged.
 */
export default class PadEndTransform extends stream.Transform {
  private readonly maxLength: number;
  private readonly fillString: string | number;
  private bytesRead = 0;
  private paddingRemaining = 0;
  private flushCallback?: stream.TransformCallback;

  constructor(maxLength: number, fillString: string | number) {
    super({ highWaterMark: Defaults.FILE_READING_CHUNK_SIZE });
    this.maxLength = maxLength;
    this.fillString = fillString;
  }

  /**
   * Pass the chunk through, remembering how many bytes have been seen.
   */
  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: stream.TransformCallback,
  ): void {
    this.bytesRead += chunk.length;
    callback(undefined, chunk);
  }

  /**
   * Start appending the fill bytes needed to reach `maxLength`.
   */
  override _flush(callback: stream.TransformCallback): void {
    this.paddingRemaining = Math.max(this.maxLength - this.bytesRead, 0);
    // The stream can't end until every padding byte has been emitted, which may take more than
    // one pass, so the callback is held until pushPadding() is finished with it
    this.flushCallback = callback;
    this.pushPadding();
  }

  /**
   * Emit more padding once the consumer has drained what was emitted already.
   */
  override _read(size: number): void {
    super._read(size);
    if (this.flushCallback !== undefined) {
      this.pushPadding();
    }
  }

  /**
   * Emit padding until `push()` reports that the read buffer is full, then stop until
   * {@link PadEndTransform._read} calls back. The padded size can be many times the high watermark,
   * so emitting all of it at once would buffer it in memory without bound.
   */
  private pushPadding(): void {
    while (this.paddingRemaining > 0) {
      // Emit the padding in chunks, the padded size can be much larger than the input
      const chunkSize = Math.min(this.paddingRemaining, Defaults.FILE_READING_CHUNK_SIZE);
      this.paddingRemaining -= chunkSize;
      if (!this.push(Buffer.alloc(chunkSize, this.fillString))) {
        return;
      }
    }

    // Clear the callback before invoking it, a re-entrant push() must not end the stream twice
    const callback = this.flushCallback;
    this.flushCallback = undefined;
    callback?.();
  }
}
