import stream from 'node:stream';

import zstd, { ZstdThreadedCompressorInstance } from '@igir/zstd-1.5.5';

/**
 * A Transform stream that compresses data using zstd with multithreading support.
 */
export class ZstdCompressTransform extends stream.Transform {
  private readonly compressor: ZstdThreadedCompressorInstance;
  private pendingOperationsCount = 0;
  private finalized = false;
  private finalizationPromise?: Promise<Buffer>;

  /**
   * Creates a new ZstdCompressTransform stream.
   */
  constructor(threads: number) {
    super();

    if (threads < 1) {
      throw new Error('ZSTD_c_nbWorkers must be greater than 1');
    }
    this.compressor = new zstd.ThreadedCompressor({
      level: 19,
      // Has to be >0 to separate the data into multiple blocks, can be 1
      threads,
    });

    this.on('error', this.handleError);
    this.on('close', this.handleClose);
  }

  /**
   * Error handler for the stream.
   */
  private readonly handleError = (): void => {
    // Ensure we're marked as finalized on errors
    this.finalized = true;
  };

  /**
   * Close handler for the stream.
   */
  private readonly handleClose = (): void => {
    // Ensure we're marked as finalized on close
    this.finalized = true;
  };

  /**
   * @param chunk The chunk to process
   * @param encoding The encoding of the chunk (if string)
   * @param callback Function to call when processing is complete
   */
  _transform(chunk: Buffer, encoding: BufferEncoding, callback: stream.TransformCallback): void {
    if (this.finalized) {
      callback(new Error('Cannot write after end()'));
      return;
    }

    // Convert to Buffer if not already
    if (!Buffer.isBuffer(chunk)) {
      try {
        chunk = Buffer.from(chunk, encoding);
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
        return;
      }
    }

    // Don't process empty chunks
    if (chunk.length === 0) {
      callback();
      return;
    }

    try {
      // Increment pending operations counter
      this.pendingOperationsCount++;

      // Process chunk asynchronously
      this.compressor
        .compressChunk(chunk)
        .then((compressedData) => {
          // Decrement counter when done
          this.pendingOperationsCount--;

          if (compressedData.length > 0) {
            // Check if we can push (handle backpressure)
            const canPush = this.push(compressedData);

            // Schedule callback based on backpressure
            if (canPush) {
              callback();
            } else {
              // If we can't push, delay callback until drain
              this.once('drain', () => {
                callback();
              });
            }
          } else {
            callback();
          }
        })
        .catch((error: unknown) => {
          // Decrement counter on error
          this.pendingOperationsCount--;
          callback(error instanceof Error ? error : new Error(String(error)));
        });
    } catch (error) {
      // Decrement counter if initial call fails
      this.pendingOperationsCount--;
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * @param callback Function to call when flushing is complete
   */
  _flush(callback: stream.TransformCallback): void {
    // If no pending operations, finalize immediately
    if (this.pendingOperationsCount === 0) {
      this.finalizeCompressor(callback);
    } else {
      // Otherwise, wait for a bit and check again
      const checkPending = (): void => {
        if (this.pendingOperationsCount === 0) {
          this.finalizeCompressor(callback);
        } else {
          // Retry after a short delay
          setTimeout(checkPending, 10);
        }
      };

      checkPending();
    }
  }

  /**
   * Helper method to finalize the compressor.
   * @param callback Function to call when finalization is complete
   */
  private finalizeCompressor(callback: stream.TransformCallback): void {
    this.finalized = true;
    this.finalizationPromise = this.compressor.end();

    this.finalizationPromise
      .then((finalData) => {
        if (finalData.length > 0) {
          this.push(finalData);
        }
        callback();
      })
      .catch(callback);
  }

  /**
   * Implementation of stream.Transform._destroy
   * @param error Error that caused destruction, if any
   * @param callback Function to call when destruction is complete
   */
  _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.finalized = true;

    // If we already have a finalization promise or there's an error, just complete
    if (this.finalizationPromise || error) {
      callback(error);
      return;
    }

    // If there are pending operations, wait for them with a timeout
    if (this.pendingOperationsCount > 0) {
      // Set a timeout to avoid hanging indefinitely
      const timeoutId = setTimeout(() => {
        callback(new Error('Timed out waiting for pending compression operations'));
      }, 5000); // 5 second timeout

      const checkPending = (): void => {
        if (this.pendingOperationsCount === 0) {
          clearTimeout(timeoutId);

          // Now finalize the compressor
          this.compressor
            .end()
            .then(() => {
              callback();
            })
            .catch(callback);
        } else {
          // Check again soon
          setTimeout(checkPending, 50);
        }
      };

      checkPending();
    } else {
      // No pending operations, finalize immediately
      this.compressor
        .end()
        .then(() => {
          callback();
        })
        .catch(callback);
    }
  }
}

export default ZstdCompressTransform;
