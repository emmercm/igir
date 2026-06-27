import type { Readable } from 'node:stream';

export default {
  async fromReadable(readable: Readable): Promise<Buffer> {
    readable.resume();

    const chunks: Buffer[] = await Array.fromAsync(readable as AsyncIterable<Buffer>);
    return Buffer.concat(chunks);
  },
};
