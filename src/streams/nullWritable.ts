import stream from 'node:stream';

/**
 * A {@link stream.Writable} that discards everything written to it.
 */
export default class NullWritable extends stream.Writable {
  /**
   * Discard the chunk.
   */
  override _write(
    _chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}
