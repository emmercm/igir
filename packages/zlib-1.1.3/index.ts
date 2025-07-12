import path from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-expect-error @types/node-gyp-build doesn't exist
import nodeGypBuild from 'node-gyp-build';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
const zlib = nodeGypBuild(__dirname) as {
  Deflater: new (level?: number) => DeflaterInstance;

  /**
   * Get the zlib library version
   * @returns Version string (e.g. "1.1.3")
   */
  getZlibVersion: () => string;

  // Flush mode constants
  Z_NO_FLUSH: number;
  Z_SYNC_FLUSH: number;
  Z_FULL_FLUSH: number;
  Z_FINISH: number;
};

export interface DeflaterInstance {
  /**
   * Compress a chunk of data
   * @param chunk Data buffer to compress
   * @param flush Flush mode (Z_NO_FLUSH, Z_SYNC_FLUSH, Z_FULL_FLUSH, Z_FINISH, Z_BLOCK)
   * @returns Compressed data buffer
   */
  compressChunk: (chunk: Buffer, flush?: number) => Buffer;

  /**
   * Finalize compression and return any remaining compressed data
   * @returns Final compressed data buffer
   */
  end: () => Buffer;

  /**
   * Release resources without attempting to retrieve final data
   * Use this for cleanup in error scenarios
   */
  dispose: () => void;
}

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
