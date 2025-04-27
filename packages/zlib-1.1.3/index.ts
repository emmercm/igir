import path from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-expect-error @types/node-gyp-build doesn't exist
import nodeGypBuild from 'node-gyp-build';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
const zlib = nodeGypBuild(__dirname) as {
  Deflater: new (level?: number) => DeflaterInstance;
  getZlibVersion(): string;
};

export interface DeflaterInstance {
  compressChunk(data: Buffer, flushMode?: number): Buffer;
  end(): void;
}

export const ZlibFlush = {
  Z_NO_FLUSH: 0,
  Z_PARTIAL_FLUSH: 1,
  Z_SYNC_FLUSH: 2,
  Z_FULL_FLUSH: 3,
  Z_FINISH: 4,
  Z_BLOCK: 5,
  Z_TREES: 6,
} as const;
export type ZlibFlushKey = keyof typeof ZlibFlush;
export type ZlibFlushValue = (typeof ZlibFlush)[ZlibFlushKey];

export const ZlibCompressionLevel = {
  Z_NO_COMPRESSION: 0,
  Z_BEST_SPEED: 1,
  Z_BEST_COMPRESSION: 9,
  Z_DEFAULT_COMPRESSION: -1,
} as const;
export type ZlibCompressionLevelKey = keyof typeof ZlibCompressionLevel;
export type ZlibCompressionLevelValue =
  (typeof ZlibCompressionLevel)[keyof typeof ZlibCompressionLevel];

export default zlib;
