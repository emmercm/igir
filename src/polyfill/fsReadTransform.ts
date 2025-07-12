import stream from 'node:stream';

export type FsReadCallback = (progress: number) => void;

/**
 * A stream transformer that tracks how many bytes have been read and calls a callback.
 */
export default class FsReadTransform extends stream.Transform {
  private readonly fsReadCallback: FsReadCallback;
  private progress = 0;

  constructor(fsReadCallback: FsReadCallback) {
    super();
    this.fsReadCallback = fsReadCallback;
  }

  /**
   * Process the stream.
   */
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: stream.TransformCallback): void {
    this.progress += chunk.length;
    this.fsReadCallback(this.progress);

    // eslint-disable-next-line unicorn/no-null
    callback(null, chunk);
  }
}
