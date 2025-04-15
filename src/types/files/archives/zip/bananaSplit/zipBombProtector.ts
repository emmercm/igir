import stream, { TransformCallback } from 'node:stream';

export default class ZipBombProtector extends stream.Transform {
  private readonly expectedBytes: number;
  private readBytes = 0;

  constructor(expectedBytes: number) {
    super();
    this.expectedBytes = expectedBytes;
  }

  _transform(
    chunk: Buffer<ArrayBuffer>,
    encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.readBytes += chunk.length;
    if (this.readBytes > this.expectedBytes) {
      return callback(new Error(`stream exceeded expected size of ${this.expectedBytes}`));
    }
    // eslint-disable-next-line unicorn/no-null
    callback(null, chunk);
  }
}
