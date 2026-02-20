import module from 'node:module';

import { getPrebuildPath } from './macros.js' with { type: 'macro' };

const require = module.createRequire(import.meta.url);

export interface ZlibBinding {
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
}

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

const zlib = ((): ZlibBinding => {
  try {
    return require(getPrebuildPath()) as ZlibBinding;
  } catch {
    return require(`./addon-zlib-1.1.3/build/Release/zlib.node`) as ZlibBinding;
  }
})();
export default zlib;
