import type { TransformCallback } from 'node:stream';
import stream from 'node:stream';

/**
 * Protect against extracting a zip bomb.
 * @see https://en.wikipedia.org/wiki/Zip_bomb
 * @see https://www.usenix.org/system/files/woot19-paper_fifield_0.pdf
 */
export default class ZipBombProtector extends stream.Transform {
  private readonly expectedBytes: number;
  private readBytes = 0;

  constructor(expectedBytes: number) {
    super();
    this.expectedBytes = expectedBytes;
  }

  /**
   * Throw an error if we've read more than the expected bytes.
   */
  _transform(
    chunk: Buffer<ArrayBuffer>,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.readBytes += chunk.length;
    if (this.readBytes > this.expectedBytes) {
      callback(new Error(`stream exceeded expected size of ${this.expectedBytes}`));
      return;
    }
    // eslint-disable-next-line unicorn/no-null
    callback(null, chunk);
  }
}
