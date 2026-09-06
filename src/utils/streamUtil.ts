import stream from 'node:stream';

import Defaults from '../globals/defaults.js';

// A consumer that stops short of the end of a stream aborts the pipeline behind it. That is a
// normal, expected outcome here — not a failure worth reporting to the caller. Which code the
// abort carries varies by Node.js version and by transform, so both have to be recognized.
const ABANDONED_CODES = new Set(['ERR_STREAM_PREMATURE_CLOSE', 'ABORT_ERR']);

export default {
  /**
   * Read `source` through an optional `transform`, invoke the callback with the resulting stream,
   * and tear both streams down once the callback is finished with them.
   *
   * Use this instead of any of the standard library's own composition calls. Each of them exhibits
   * at least one realistic failure mode:
   *
   * | Failure mode                                                           | `Readable.pipe()` | `stream.pipeline()` | `stream.promises.pipeline()` | `stream.compose()` |
   * | ---------------------------------------------------------------------- | ----------------- | ------------------- | ---------------------------- | ------------------ |
   * | Source error is catchable only by `process.on('uncaughtException')`    | yes               | no                  | no                           | no                 |
   * | Source error leaves the destination neither ended nor errored          | yes               | no                  | no                           | no                 |
   * | Source destroyed without an error leaves the destination open forever  | yes               | no                  | no                           | no                 |
   * | Consumer stopping short leaves the source open                         | yes               | no                  | no                           | no                 |
   * | Consumer stopping short is reported as an error, not as a normal end   | no                | yes                 | yes                          | yes                |
   * | Consumer stopping short raises an uncaughtException/unhandledRejection | no                | no                  | yes                          | yes                |
   */
  async pipelineSafe<T>(
    source: stream.Readable,
    transform: stream.Transform | undefined,
    callback: (readable: stream.Readable) => T | Promise<T>,
  ): Promise<T> {
    if (transform === undefined) {
      // Nothing to compose, so there is no pipe to make safe
      try {
        return await callback(source);
      } finally {
        source.destroy();
      }
    }

    // Catch failures on either stream
    // Use a resolve() instead of reject() so we can keep `NodeJS.ErrnoException` typed
    const piped = Promise.withResolvers<NodeJS.ErrnoException | null | undefined>();
    stream.pipeline(source, transform, (err) => {
      piped.resolve(err);
    });

    // Catch failures in the source's own destroy(), required for Node.js 22 stream.pipeline()
    // Use a resolve() instead of reject() so we can keep `NodeJS.ErrnoException` typed
    const sourceFinished = Promise.withResolvers<NodeJS.ErrnoException | null | undefined>();
    const cleanupFinished = stream.finished(source, (err) => {
      sourceFinished.resolve(err);
    });

    let result: T;
    try {
      result = await callback(transform);
    } catch (error) {
      transform.destroy();
      source.destroy();
      await piped.promise;
      await sourceFinished.promise;
      cleanupFinished();
      throw error;
    }
    transform.destroy();
    source.destroy();

    const errors = [await piped.promise, await sourceFinished.promise];
    cleanupFinished();
    for (const error of errors) {
      if (error !== null && error !== undefined && !ABANDONED_CODES.has(error.code ?? '')) {
        throw error;
      }
    }
    return result;
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
    // The source is only destroyed once every output has been destroyed, otherwise one consumer
    // finishing early would truncate every other consumer
    let liveOutputs = count;
    // The source is paused while any output is above its high watermark, otherwise the slowest
    // consumer would cause the source to be buffered in memory without bound
    let pausedOutputs = 0;

    for (let i = 0; i < count; i++) {
      const output = new stream.PassThrough({ highWaterMark: Defaults.FILE_READING_CHUNK_SIZE });
      let isPaused = false;

      /**
       * Stop this output from holding the source paused, resuming the source if it was the last
       * output to be waiting.
       */
      const releasePause = (): void => {
        if (!isPaused) {
          return;
        }
        isPaused = false;
        pausedOutputs -= 1;
        if (pausedOutputs === 0) {
          readable.resume();
        }
      };

      /**
       * Write a chunk to this output, respecting its backpressure.
       */
      const onData = (chunk: Buffer): void => {
        if (output.write(chunk) || isPaused) {
          return;
        }

        isPaused = true;
        pausedOutputs += 1;
        readable.pause();
        output.once('drain', releasePause);
      };
      readable.on('data', onData);
      const cleanupFinished = stream.finished(readable, (err) => {
        if (err) {
          output.destroy(err);
        } else {
          output.end();
        }
      });

      output._destroy = (err, callback): void => {
        readable.off('data', onData);
        cleanupFinished();
        // A destroyed output will never drain, so it can't be left holding the source paused
        output.off('drain', releasePause);
        releasePause();

        liveOutputs -= 1;
        if (liveOutputs === 0) {
          readable.destroy();
        }

        callback(err);
      };
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
   * This differs from {@link stream.pipeline} in that it creates the destination stream and returns
   * it, rather than requiring one to be supplied.
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
      (err?: NodeJS.ErrnoException | null): void => {
        if (err) {
          output.destroy(err);
        }
      },
    ]);
    return output;
  },
};
