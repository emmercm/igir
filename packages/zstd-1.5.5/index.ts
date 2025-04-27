import path from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-expect-error @types/node-gyp-build doesn't exist
import nodeGypBuild from 'node-gyp-build';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
const zstd = nodeGypBuild(__dirname) as {
  Compressor: new (level?: number) => ZstdStreamCompressorInstance;
  getZstdVersion(): string;
};

export interface ZstdStreamCompressorInstance {
  compressChunk(chunk: Buffer): Buffer;
  end(): Buffer;
}

export default zstd;
