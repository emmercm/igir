import stream from 'node:stream';

import type { ErrnoException } from 'fast-glob/out/types/index.js';

import Defaults from '../globals/defaults.js';

export default {
  /**
   * Concatenate multiple readable streams into a single readable stream.
   */
  concat(...readables: stream.Readable[]): stream.Readable {
    if (readables.length === 1) {
      // Don't incur the overhead of any passthroughs
      return readables[0];
    }

    const out = new stream.PassThrough({ highWaterMark: Defaults.FILE_READING_CHUNK_SIZE });
    let current = 0;
    let activeStream: stream.Readable | undefined = undefined;
    let destroyed = false;

    /**
     * Pipe the next input stream to the output stream.
     */
    function pipeNext(): void {
      if (destroyed) {
        return;
      }

      if (current >= readables.length) {
        out.end();
        return;
      }

      activeStream = readables[current++];
      activeStream.pipe(out, { end: false });
      activeStream.once('error', (err) => {
        out.emit('error', err);
      });
      activeStream.once('end', pipeNext);
    }

    // Allow the passthrough to be destroyed
    out._destroy = (err: Error | null, callback: (error?: Error | null) => void): void => {
      destroyed = true;
      if (typeof activeStream?.destroy === 'function') {
        activeStream.destroy(err ?? undefined);
      }

      for (let i = current; i < readables.length; i++) {
        const readable = readables[i];
        if (typeof readable.destroy === 'function') {
          readable.destroy();
        }
      }

      callback(err);
    };

    pipeNext();
    return out;
  },

  /**
   * Pad a readable stream to a specified length by appending a fill string.
   */
  padEnd(
    readable: stream.Readable,
    maxLength: number,
    fillString: string | number,
  ): stream.Readable {
    const output = new stream.PassThrough({ highWaterMark: Defaults.FILE_READING_CHUNK_SIZE });
    let readableBytesRead = 0;

    readable.on('data', (chunk: Buffer) => {
      readableBytesRead += chunk.length;
      output.write(chunk);
    });

    readable.on('end', () => {
      const remainingBytes = maxLength - readableBytesRead;
      if (remainingBytes > 0) {
        this.staticReadable(remainingBytes, fillString).pipe(output, { end: true });
      } else {
        output.end();
      }
    });

    readable.on('error', (err) => output.destroy(err));

    return output;
  },

  /**
   * Split a readable stream into multiple readable streams, such that the original stream can be
   * read concurrently by multiple consumers.
   */
  split(readable: stream.Readable, count: number): stream.Readable[] {
    if (count === 0) {
      return [];
    }
    if (count === 1) {
      // Don't incur the overhead of any passthroughs
      return [readable];
    }

    const outputs: stream.Readable[] = [];

    for (let i = 0; i < count; i++) {
      const output = new stream.PassThrough({ highWaterMark: Defaults.FILE_READING_CHUNK_SIZE });
      readable.on('data', output.write.bind(output));
      readable.on('end', output.end.bind(output));
      readable.on('error', output.destroy.bind(output));
      outputs.push(output);
    }

    return outputs;
  },

  /**
   * Generate a static readable stream that emits a fixed number of bytes filled with a specified
   * string or number.
   */
  staticReadable(length: number, fillString: string | number): stream.Readable {
    let bytesRemaining = length;

    return new stream.Readable({
      read(size: number): void {
        // Emit a chunk up to `size` bytes, or the remaining bytes if less
        const chunkSize = Math.min(size, bytesRemaining);
        const chunk = Buffer.alloc(chunkSize, fillString);
        this.push(chunk);
        bytesRemaining -= chunkSize;

        if (bytesRemaining <= 0) {
          // End the stream
          // eslint-disable-next-line unicorn/no-null
          this.push(null);
        }
      },
    });
  },

  /**
   * Return a new readable stream that has had the specified transforms applied to it.
   * This differs from {@link stream.pipeline} in that it returns a readable stream, NOT a writable
   * stream.
   */
  withTransforms(readable: stream.Readable, ...transforms: stream.Transform[]): stream.Readable {
    if (transforms.length === 0) {
      // Don't incur the overhead of any passthroughs
      return readable;
    }

    const output = new stream.PassThrough({ highWaterMark: Defaults.FILE_READING_CHUNK_SIZE });
    Reflect.apply(stream.pipeline, undefined, [
      readable,
      ...transforms,
      output,
      (err?: ErrnoException): void => {
        if (err) {
          output.destroy(err);
        }
      },
    ]);
    return output;
  },
};
