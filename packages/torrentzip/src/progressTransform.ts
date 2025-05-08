import stream, { TransformCallback } from 'node:stream';

export type ProgressCallback = (progress: number) => void;

/**
 *
 */
export default class ProgressTransform extends stream.Transform {
  private readonly progressCallback?: ProgressCallback;
  private progress = 0;

  constructor(progressCallback?: ProgressCallback) {
    super();
    this.progressCallback = progressCallback;
  }

  /**
   *
   */
  _transform(
    chunk: Buffer<ArrayBuffer>,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.progress += chunk.length;
    if (this.progressCallback) {
      this.progressCallback(this.progress);
    }

    // eslint-disable-next-line unicorn/no-null
    callback(null, chunk);
  }
}
