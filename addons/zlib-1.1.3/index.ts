import module from 'node:module';
import os from 'node:os';

import { type Context, getDefaultContext } from '@emnapi/runtime';

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

const bindingInstance: { binding?: ZlibBinding } = {};

/**
 * Load the native addon on first use, rather than at import, so that importing this
 * module's types and constants never loads a binary that may go unused.
 */
function loadBinding(): ZlibBinding {
  bindingInstance.binding ??= ((): ZlibBinding => {
    if (process.env.IGIR_ADDONS !== 'wasm') {
      try {
        // Try to load the development build
        return require('./build/Release/zlib.node') as ZlibBinding;
      } catch {
        // Ignored
      }

      try {
        // Try to load the prebuild
        return require(
          `./addon-zlib-1.1.3/prebuilds/${os.platform()}-${os.arch()}/node.node`,
        ) as ZlibBinding;
      } catch (error) {
        // The native build is required, rather than falling back to the WebAssembly build
        if (process.env.IGIR_ADDONS === 'native') {
          throw error;
        }
      }
    }

    // Load the WebAssembly build, which runs on any platform, but slower than a native build
    const wasmModule = require('./addon-zlib-1.1.3/wasm/zlib.cjs') as {
      emnapiInit: (options: { context: Context }) => ZlibBinding;
    };
    return wasmModule.emnapiInit({ context: getDefaultContext() });
  })();
  return bindingInstance.binding;
}

export default {
  get Deflater(): ZlibBinding['Deflater'] {
    return loadBinding().Deflater;
  },
  getZlibVersion(): string {
    return loadBinding().getZlibVersion();
  },
  get Z_NO_FLUSH(): number {
    return loadBinding().Z_NO_FLUSH;
  },
  get Z_SYNC_FLUSH(): number {
    return loadBinding().Z_SYNC_FLUSH;
  },
  get Z_FULL_FLUSH(): number {
    return loadBinding().Z_FULL_FLUSH;
  },
  get Z_FINISH(): number {
    return loadBinding().Z_FINISH;
  },
} satisfies ZlibBinding;
