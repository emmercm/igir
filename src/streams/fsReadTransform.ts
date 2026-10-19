import stream from 'node:stream';

import Defaults from '../globals/defaults.js';

export type FsReadCallback = (progress: number, total?: number) => void;

/**
 * A stream transformer that tracks how many bytes have been read and calls a callback.
 */
export default class FsReadTransform extends stream.Transform {
  private readonly fsReadCallback: FsReadCallback;
  private progress = 0;

  constructor(fsReadCallback: FsReadCallback) {
    super({ highWaterMark: Defaults.FILE_READING_CHUNK_SIZE });
    this.fsReadCallback = fsReadCallback;
  }

  /**
   * Process the stream.
   */
  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: stream.TransformCallback,
  ): void {
    this.progress += chunk.length;
    this.fsReadCallback(this.progress);

    // eslint-disable-next-line unicorn/no-null
    callback(null, chunk);
  }
}
