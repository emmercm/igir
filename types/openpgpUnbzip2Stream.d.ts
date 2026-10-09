/**
 * @see https://github.com/openpgpjs/unbzip2-stream/blob/main/index.js
 */
declare module '@openpgp/unbzip2-stream' {
  /**
   * Decompress a bzip2 stream, erroring if more than {@link maxDecompressedBytes} would be
   * produced.
   */
  export default function unbzip2Stream(
    input: ReadableStream<Uint8Array>,
    maxDecompressedBytes?: number,
  ): ReadableStream<Uint8Array>;
}
