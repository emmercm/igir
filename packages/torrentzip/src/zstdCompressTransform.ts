import stream from 'node:stream';

import zstd, { ZstdThreadedCompressorInstance } from '../../zstd-1.5.5/index.js';

/**
 * A Transform stream that compresses data using zstd with multithreading support.
 */
export default class ZstdCompressTransform extends stream.Transform {
  private readonly compressor: ZstdThreadedCompressorInstance;
  private compressorEnded = false;

  /**
   * Creates a new ZstdCompressTransform stream.
   */
  constructor(threads: number) {
    super();

    if (threads < 1) {
      // Has to be >0 to separate the data into multiple blocks, can be 1
      throw new Error('ZSTD_c_nbWorkers must be greater than 1');
    }
    this.compressor = new zstd.ThreadedCompressor({
      level: 19,
      threads,
    });

    // Set up cleanup handlers
    this.on('error', () => {
      this.cleanup(() => {
        /* ignored */
      });
    });
    this.on('close', () => {
      this.cleanup(() => {
        /* ignored */
      });
    });
  }

  /**
   * Compress the chunk and emit the result.
   */
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: stream.TransformCallback): void {
    if (this.compressorEnded) {
      callback(new Error('cannot compress after the compressor has been ended'));
      return;
    }

    this.compressor
      .compressChunk(chunk)
      .then((compressedChunk) => {
        if (compressedChunk.length > 0) {
          this.push(compressedChunk);
        }
        callback();
      })
      .catch(callback);
  }

  /**
   * @param callback Function to call when flushing is complete
   */
  _flush(callback: stream.TransformCallback): void {
    this.finalizeCompressor(callback);
  }

  /**
   * Clean up resources when stream.destroy() is called.
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
    this.finalizeCompressor(callback);
  }

  /**
   * Finalize the compressor and emit the final output.
   */
  private finalizeCompressor(callback: stream.TransformCallback): void {
    if (this.compressorEnded) {
      callback();
      return;
    }
    this.compressorEnded = true;

    this.compressor
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
