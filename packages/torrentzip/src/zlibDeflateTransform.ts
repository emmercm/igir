import stream, { TransformCallback } from 'node:stream';

import zlib, { DeflaterInstance } from '../../zlib-1.1.3/index.js';

/**
 * A Transform stream that compresses data using zlib.
 */
export default class ZlibCompressTransform extends stream.Transform {
  private readonly deflater: DeflaterInstance = new zlib.Deflater(9);
  private deflaterEnded = false;

  constructor() {
    super();

    // Set up cleanup handlers
    this.on('error', () => {
      this.cleanup();
    });
    this.on('close', () => {
      this.cleanup();
    });
  }

  /**
   * Deflate the chunk and emit the result.
   */
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      if (this.deflaterEnded) {
        callback(new Error('cannot compress after the deflater has been ended'));
        return;
      }

      const compressedChunk = this.deflater.compressChunk(chunk);
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
   * Close the zlib deflater when the stream ends.
   */
  _flush(callback: TransformCallback): void {
    try {
      this.finalizeDeflater();
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Clean up resources when stream.destroy() is called.
   */
  _destroy(err: Error | null, callback: (error: Error | null) => void): void {
    try {
      this.cleanup();
      callback(err);
    } catch (cleanupError) {
      callback(cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)));
    }
  }

  /**
   * Clean up method to be called when the stream ends.
   */
  private cleanup(): void {
    try {
      this.finalizeDeflater();
    } catch {
      /* ignored */
    }
  }

  /**
   * Finalize the deflater and emit the final output.
   */
  private finalizeDeflater(): void {
    if (this.deflaterEnded) {
      return;
    }
    this.deflaterEnded = true;

    const finalChunk = this.deflater.end();
    if (finalChunk.length > 0) {
      this.push(finalChunk);
    }
  }
}
