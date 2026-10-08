/**
 * @see https://github.com/openpgpjs/unbzip2-stream/blob/main/index.js
 */
declare module '@openpgp/unbzip2-stream' {
  import type stream from 'node:stream';

  /**
   * Decompress a bzip2 stream, erroring if more than {@link maxDecompressedBytes} would be
   * produced.
   */
  export default function unbzip2Stream(
    input: ReturnType<typeof stream.Readable.toWeb>,
    maxDecompressedBytes?: number,
  ): ReadableStream<Uint8Array>;
}
