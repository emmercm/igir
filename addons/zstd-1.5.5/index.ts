import module from 'node:module';
import os from 'node:os';

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

const zstd = ((): ZstdBinding => {
  try {
    // Try to load the development build
    return require('./build/Release/binding.node') as ZstdBinding;
  } catch {
    try {
      // Try to load the prebuild
      return require(
        `./addon-zstd-1.5.5/prebuilds/${os.platform()}-${os.arch()}/node.node`,
      ) as ZstdBinding;
    } catch {
      // Try to load the postinstall build
      return require('./addon-zstd-1.5.5/build/Release/binding.node') as ZstdBinding;
    }
  }
})();
export default zstd;
