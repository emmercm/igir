import stream, { TransformCallback } from 'node:stream';

export type FsCopyCallback = (progress: number) => void;

/**
 * A stream transformer that tracks how many bytes have been read and calls a callback.
 */
export default class FsCopyTransform extends stream.Transform {
  private readonly fsCopyCallback?: FsCopyCallback;
  private progress = 0;

  constructor(fsCopyCallback?: FsCopyCallback) {
    super();
    this.fsCopyCallback = fsCopyCallback;
  }

  /**
   * Process the stream.
   */
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.progress += chunk.length;
    if (this.fsCopyCallback) {
      this.fsCopyCallback(this.progress);
    }

    // eslint-disable-next-line unicorn/no-null
    callback(null, chunk);
  }
}
