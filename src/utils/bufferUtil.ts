import type { Readable } from 'node:stream';

export default {
  async fromReadable(readable: Readable): Promise<Buffer> {
    readable.resume();

    const chunks: Buffer[] = [];
    for await (const chunk of readable as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  },
};
