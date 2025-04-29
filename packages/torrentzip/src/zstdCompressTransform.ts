import stream, { TransformCallback } from 'node:stream';

import zstd from '@igir/zstd-1.5.5';

/**
 * A Zstd compress stream transform.
 */
export default class ZstdCompressTransform extends stream.Transform {
  private readonly compressor = new zstd.Compressor(19);
  private compressorEnded = false;

  constructor(options = {}) {
    super(options);

    // Set up cleanup handlers
    this.on('error', () => {
      this.cleanup();
    });
    this.on('close', () => {
      this.cleanup();
    });
  }

  /**
   * Compress the chunk and emit the result.
   */
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      if (this.compressorEnded) {
        callback(new Error('cannot compress after the compressor has been ended'));
        return;
      }

      const compressedChunk = this.compressor.compressChunk(chunk);
      if (compressedChunk.length > 0) {
        this.push(compressedChunk);
      }
      callback();
    } catch (error) {
      this.cleanup();
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Close the Zstd compressor when the stream ends.
   */
  _flush(callback: TransformCallback): void {
    try {
      this.finalizeCompressor();
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  /**
   * Clean up resources when stream.destroy() is called.
   */
  _destroy(err: Error | null, callback: (error: Error | null) => void): void {
    try {
      this.cleanup();
      callback(err);
    } catch (error) {
      callback(error as Error);
    }
  }

  /**
   * Clean up method to be called when the stream ends.
   */
  private cleanup(): void {
    try {
      this.finalizeCompressor();
    } catch {
      /* ignored */
    }
  }

  /**
   * Finalize the compressor and emit the final output.
   */
  private finalizeCompressor(): void {
    if (!this.compressorEnded) {
      try {
        const finalChunk = this.compressor.end();
        this.compressorEnded = true;

        if (finalChunk.length > 0) {
          this.push(finalChunk);
        }
      } catch (error) {
        this.compressorEnded = true;
        throw error;
      }
    }
  }
}
