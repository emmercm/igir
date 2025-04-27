import path from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-expect-error @types/node-gyp-build doesn't exist
import nodeGypBuild from 'node-gyp-build';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
const zlib = nodeGypBuild(path.join(__dirname, '..')) as {
  Deflater: new (level?: number) => DeflaterInstance;
  getZlibVersion(): string;
};

export interface DeflaterInstance {
  push(data: Buffer, flushMode?: number): Buffer;
  close(): void;
}

export default zlib;
