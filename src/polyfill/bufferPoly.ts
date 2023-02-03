import { Readable } from 'stream';

export default class BufferPoly {
  static async fromReadable(readable: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      readable.resume();

      const chunks: Buffer[] = [];
      readable.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));
      });

      readable.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      readable.on('error', reject);
    });
  }
}
