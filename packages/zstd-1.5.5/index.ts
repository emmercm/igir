import path from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-expect-error @types/node-gyp-build doesn't exist
import nodeGypBuild from 'node-gyp-build';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * Interface for the zstd native binding.
 */
interface ZstdBinding {
  /**
   * The {@link ThreadedCompressor} class for multithreaded zstd compression.
   */
  ThreadedCompressor: new (
    options?: ZstdThreadedCompressorOptions | number,
  ) => ZstdThreadedCompressorInstance;

  /**
   * Returns the version of the zstd library.
   * @returns Version string (e.g. "1.5.2")
   */
  getZstdVersion(): string;
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
  compressChunk(chunk: Buffer): Promise<Buffer>;

  /**
   * Finalizes the compression stream asynchronously.
   * After calling this method, the compressor cannot be used anymore.
   * @returns Promise resolving to a Buffer containing final compressed data
   */
  end(): Promise<Buffer>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
const zstd = nodeGypBuild(__dirname) as ZstdBinding;
export default zstd;
