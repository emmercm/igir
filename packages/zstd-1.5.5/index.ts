import module from 'node:module';
import stream from 'node:stream';

import { getPrebuildPath } from './macros.js' with { type: 'macro' };

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
   * The {@link Decompressor} class for streaming zstd decompression.
   */
  Decompressor: new () => ZstdDecompressorInstance;

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

/**
 * Interface for the {@link Decompressor} instance methods.
 */
export interface ZstdDecompressorInstance {
  /**
   * Decompresses a chunk of data asynchronously.
   * @param chunk Buffer containing compressed data
   * @returns Promise resolving to a Buffer containing decompressed data
   */
  decompressChunk: (chunk: Buffer) => Promise<Buffer>;

  /**
   * Finalizes the decompression stream asynchronously and cleans up native resources.
   * After calling this method, the decompressor cannot be used anymore.
   * @returns Promise resolving to a Buffer containing any final decompressed data
   */
  end: () => Promise<Buffer>;
}

/**
 * A Node.js Transform stream for Zstd decompression.
 */
export class ZstdDecompressStream extends stream.Transform {
  private readonly decompressor: ZstdDecompressorInstance = new zstd.Decompressor();
  private decompressorEnded = false;

  /**
   * Decompress the chunk and emit the result.
   */
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: stream.TransformCallback): void {
    if (this.decompressorEnded) {
      callback(new Error('cannot decompress after the compressor has been ended'));
      return;
    }

    this.decompressor
      .decompressChunk(chunk)
      .then((decompressedChunk) => {
        if (decompressedChunk.length > 0) {
          this.push(decompressedChunk);
        }
        callback();
      })
      .catch(callback);
  }

  /**
   * @param callback Function to call when flushing is complete
   */
  _flush(callback: stream.TransformCallback): void {
    this.finalizeDecompressor(callback);
  }

  /**
   * Clean up native resources.
   */
  _destroy(err: Error | null, callback: (error: Error | null) => void): void {
    this.cleanup((cleanupError) => {
      if (cleanupError) {
        callback(cleanupError);
      } else {
        callback(err);
      }
    });
  }

  /**
   * Clean up method to be called when the stream ends.
   */
  private cleanup(callback: stream.TransformCallback): void {
    this.finalizeDecompressor(callback);
  }

  /**
   * Finalize the compressor and emit the final output.
   */
  private finalizeDecompressor(callback: stream.TransformCallback): void {
    if (this.decompressorEnded) {
      callback();
      return;
    }
    this.decompressorEnded = true;

    this.decompressor
      .end()
      .then((finalData) => {
        if (finalData.length > 0) {
          this.push(finalData);
        }
        callback();
      })
      .catch(callback);
  }
}

const zstd = ((): ZstdBinding => {
  try {
    return require(getPrebuildPath()) as ZstdBinding;
  } catch {
    return require(`./addon-zstd-1.5.5/build/Release/binding.node`) as ZstdBinding;
  }
})();
export default {
  ...zstd,
  DecompressStream: ZstdDecompressStream,
};
