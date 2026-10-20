import type { Readable } from 'node:stream';

export default {
  async fromReadable(readable: Readable): Promise<Buffer> {
    readable.resume();

    const chunks: Buffer[] = await Array.fromAsync(readable as AsyncIterable<Buffer>);
    return Buffer.concat(chunks);
  },

  /**
   * Read the first {@link byteCount} bytes of a readable, then stop reading it.
   * @returns those bytes, or fewer if the readable ends first
   */
  async fromReadableFirstBytes(readable: Readable, byteCount: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let bytesRead = 0;

    if (byteCount > 0) {
      for await (const chunk of readable) {
        if (!Buffer.isBuffer(chunk)) {
          throw new TypeError('readable must be in binary mode');
        }
        chunks.push(chunk);
        bytesRead += chunk.length;

        // Breaking destroys the readable, so it doesn't read any further
        if (bytesRead >= byteCount) {
          break;
        }
      }
    }

    return Buffer.concat(chunks, Math.min(bytesRead, byteCount));
  },
};
