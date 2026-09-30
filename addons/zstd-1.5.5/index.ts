import module from 'node:module';
import os from 'node:os';

import { type Context, getDefaultContext } from '@emnapi/runtime';

const require = module.createRequire(import.meta.url);

/**
 * Options for configuring the {@link ThreadedCompressor}.
 */
export interface ZstdThreadedCompressorOptions {
  /**
   * Compression level (1-22)
   * @default 3
   */
  level?: number;

  /**
   * Number of worker threads for multithreaded compression.
   * 0 means non-multi-threaded mode.
   * @default 0
   */
  threads?: number;
}

/**
 * Interface for the zstd native binding and high-level API.
 */
interface ZstdBinding {
  /**
   * The {@link ThreadedCompressor} class for multithreaded zstd compression.
   */
  ThreadedCompressor: new (
    options?: ZstdThreadedCompressorOptions | number,
  ) => ZstdThreadedCompressorInstance;

  /**
   * Compress data without using threads.
   */
  compressNonThreaded: (input: Buffer, compressionLevel: number) => Buffer;

  /**
   * Returns the version of the zstd library.
   * @returns Version string (e.g. "1.5.5")
   */
  getZstdVersion: () => string;
}

/**
 * Interface for the {@link ThreadedCompressor} instance methods.
 */
export interface ZstdThreadedCompressorInstance {
  /**
   * Compresses a chunk of data asynchronously.
   * The input buffer is copied to avoid modification during async compression.
   * @param chunk Buffer containing data to compress
   * @returns Promise resolving to a Buffer containing compressed data
   */
  compressChunk: (chunk: Buffer) => Promise<Buffer>;

  /**
   * Finalizes the compression stream asynchronously.
   * After calling this method, the compressor cannot be used anymore.
   * @returns Promise resolving to a Buffer containing final compressed data
   */
  end: () => Promise<Buffer>;
}

const bindingInstance: { binding?: ZstdBinding } = {};

/**
 * Load the native addon on first use, rather than at import, so that importing this
 * module's types and constants never loads a binary that may go unused.
 */
function loadBinding(): ZstdBinding {
  bindingInstance.binding ??= ((): ZstdBinding => {
    if (process.env.IGIR_ADDONS_WASM !== 'true') {
      try {
        // Try to load the development build
        return require('./build/Release/binding.node') as ZstdBinding;
      } catch {
        // Ignored
      }

      try {
        // Try to load the prebuild
        return require(
          `./addon-zstd-1.5.5/prebuilds/${os.platform()}-${os.arch()}/node.node`,
        ) as ZstdBinding;
      } catch {
        // Ignored
      }
    }

    // Load the WebAssembly build, which runs on any platform, but slower than a native build
    const wasmModule = require('./addon-zstd-1.5.5/wasm/binding.cjs') as {
      emnapiInit: (options: { context: Context }) => ZstdBinding;
    };
    return wasmModule.emnapiInit({ context: getDefaultContext() });
  })();
  return bindingInstance.binding;
}

export default {
  get ThreadedCompressor(): ZstdBinding['ThreadedCompressor'] {
    return loadBinding().ThreadedCompressor;
  },
  compressNonThreaded(input: Buffer, compressionLevel: number): Buffer {
    return loadBinding().compressNonThreaded(input, compressionLevel);
  },
  getZstdVersion(): string {
    return loadBinding().getZstdVersion();
  },
} satisfies ZstdBinding;
