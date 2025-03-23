import { Readable } from 'node:stream';

export default {
  async fromReadable(readable: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      readable.resume();

      const chunks: Buffer[] = [];
      readable.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      readable.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      readable.on('error', reject);
    });
  },
};
