import stream, { TransformCallback } from 'node:stream';

/**
 * A stream transform to calculate the size of a post-compression file.
 */
export default class CompressedTransform extends stream.Transform {
  private size = 0;

  /**
   * Increment the size and passthrough the data.
   */
  _transform(
    chunk: Buffer<ArrayBuffer>,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.size += chunk.length;

    // eslint-disable-next-line unicorn/no-null
    callback(null, chunk);
  }

  getSize(): number {
    return this.size;
  }
}
