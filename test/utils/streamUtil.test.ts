import stream from 'node:stream';

import Defaults from '../../src/globals/defaults.js';
import BufferUtil from '../../src/utils/bufferUtil.js';
import StreamUtil from '../../src/utils/streamUtil.js';

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * A transform that uppercases every chunk it is given.
 */
function upperCase(): stream.Transform {
  return new stream.Transform({
    transform(chunk: Buffer, _encoding, callback): void {
      callback(undefined, Buffer.from(chunk.toString().toUpperCase()));
    },
  });
}

/**
 * A transform that appends an exclamation point after the last chunk.
 */
function exclaim(): stream.Transform {
  return new stream.Transform({
    transform(chunk: Buffer, _encoding, callback): void {
      callback(undefined, chunk);
    },
    flush(callback): void {
      callback(undefined, Buffer.from('!'));
    },
  });
}

/**
 * A readable that emits one chunk and then does whatever `after` says.
 */
function chunkThen(after: 'end' | 'error' | 'destroy' | 'stall'): stream.Readable {
  let isStarted = false;
  const readable = new stream.Readable({
    read(): void {
      if (isStarted) {
        return;
      }
      isStarted = true;
      setImmediate(() => {
        readable.push(Buffer.from('abc'));
        if (after === 'end') {
          // eslint-disable-next-line unicorn/no-null
          readable.push(null);
        } else if (after === 'error') {
          readable.destroy(new Error('source failed'));
        } else if (after === 'destroy') {
          readable.destroy();
        }
      });
    },
  });
  return readable;
}

/**
 * A readable whose own teardown fails, the way a subprocess exiting non-zero on close does.
 */
function failingTeardown(): stream.Readable {
  let isStarted = false;
  const readable = new stream.Readable({
    read(): void {
      if (isStarted) {
        return;
      }
      isStarted = true;
      setImmediate(() => readable.push(Buffer.from('abc')));
    },
    destroy(err, callback): void {
      setImmediate(() => {
        callback(err ?? new Error('teardown failed'));
      });
    },
  });
  return readable;
}

describe('pipelineSafe', () => {
  const readAll = async (readable: stream.Readable): Promise<string> =>
    (await BufferUtil.fromReadable(readable)).toString();
  const readOne = async (readable: stream.Readable): Promise<string> => {
    for await (const chunk of readable) {
      return Buffer.isBuffer(chunk) ? `bailed after ${chunk.length}` : 'bailed';
    }
    return 'empty';
  };

  it('invokes the callback with the source when there is no transform', async () => {
    const source = chunkThen('end');

    await expect(
      StreamUtil.pipelineSafe(source, undefined, async (readable) => {
        expect(readable).toStrictEqual(source);
        return await readAll(readable);
      }),
    ).resolves.toEqual('abc');
  });

  it('invokes the callback with the transformed stream', async () => {
    await expect(
      StreamUtil.pipelineSafe(
        chunkThen('end'),
        upperCase(),
        async (readable) => await readAll(readable),
      ),
    ).resolves.toEqual('ABC');
  });

  it('returns the value the callback returns', async () => {
    await expect(StreamUtil.pipelineSafe(chunkThen('end'), upperCase(), () => 42)).resolves.toEqual(
      42,
    );
  });

  it('destroys both streams after the callback reads to the end', async () => {
    const source = chunkThen('end');
    const transform = upperCase();

    await StreamUtil.pipelineSafe(source, transform, async (readable) => await readAll(readable));

    expect(source.destroyed).toEqual(true);
    expect(transform.destroyed).toEqual(true);
  });

  it('destroys both streams when the callback stops short of the end', async () => {
    const source = chunkThen('stall');
    const transform = upperCase();

    await StreamUtil.pipelineSafe(source, transform, readOne);

    expect(source.destroyed).toEqual(true);
    expect(transform.destroyed).toEqual(true);
  });

  it('destroys both streams when the callback throws', async () => {
    const source = chunkThen('stall');
    const transform = upperCase();

    await expect(
      StreamUtil.pipelineSafe(source, transform, () => {
        throw new Error('callback failed');
      }),
    ).rejects.toThrow('callback failed');

    expect(source.destroyed).toEqual(true);
    expect(transform.destroyed).toEqual(true);
  });

  it('destroys the source when there is no transform', async () => {
    const source = chunkThen('stall');

    await StreamUtil.pipelineSafe(source, undefined, readOne);

    expect(source.destroyed).toEqual(true);
  });

  it('rejects when the source errors while the callback is reading', async () => {
    // A bare pipe() attaches no error listener to the source, so this both crashes the process
    // with an uncaught 'error' and leaves the callback awaiting a stream that never ends
    await expect(
      StreamUtil.pipelineSafe(
        chunkThen('error'),
        upperCase(),
        async (readable) => await readAll(readable),
      ),
    ).rejects.toThrow('source failed');
  });

  it('rejects when the source is destroyed without an error', async () => {
    // A source destroyed with no error emits neither 'end' nor 'error', so a bare pipe() leaves
    // the callback waiting forever for data that will never arrive
    await expect(
      StreamUtil.pipelineSafe(
        chunkThen('destroy'),
        upperCase(),
        async (readable) => await readAll(readable),
      ),
    ).rejects.toThrow();
  });

  it('rejects when the transform errors', async () => {
    const transform = new stream.Transform({
      transform(_chunk, _encoding, callback): void {
        callback(new Error('transform failed'));
      },
    });

    await expect(
      StreamUtil.pipelineSafe(
        chunkThen('end'),
        transform,
        async (readable) => await readAll(readable),
      ),
    ).rejects.toThrow('transform failed');
  });

  it('surfaces an error raised by the source teardown', async () => {
    // Nothing is awaiting the stream by the time this happens, so a bare pipe() turns it into an
    // uncaught exception while the caller resolves successfully
    await expect(StreamUtil.pipelineSafe(failingTeardown(), upperCase(), readOne)).rejects.toThrow(
      'teardown failed',
    );
  });

  it('does not reject merely because the callback stopped short of the end', async () => {
    // Abandoning the stream aborts the pipeline, which must not be reported as a failure
    await expect(
      StreamUtil.pipelineSafe(chunkThen('stall'), upperCase(), readOne),
    ).resolves.toEqual('bailed after 3');
  });

  it('reports the error from the callback rather than one from the pipeline', async () => {
    // The callback's own failure is the more useful one, and destroying the streams to unwind
    // will always produce an abort error that must not mask it
    await expect(
      StreamUtil.pipelineSafe(chunkThen('error'), upperCase(), async (readable) => {
        try {
          await readAll(readable);
        } catch {
          throw new Error('callback failed');
        }
      }),
    ).rejects.toThrow('callback failed');
  });

  it('destroys the source when only the transform is destroyed', async () => {
    // pipe() does not propagate destroy() upstream, which is what leaves file handles, inflaters,
    // and subprocesses running when a consumer stops early
    const source = chunkThen('stall');
    const transform = upperCase();

    await StreamUtil.pipelineSafe(source, transform, async (readable) => {
      for await (const chunk of readable) {
        expect(Buffer.isBuffer(chunk)).toEqual(true);
        break;
      }
      transform.destroy();
      await tick();
      expect(source.destroyed).toEqual(true);
    });
  });

  it('attaches an error listener to the source', async () => {
    // This is the root defect in pipe(): it attaches an 'error' listener to the destination only,
    // never to the source, so a source failure has nowhere to go but process-level uncaught
    const source = chunkThen('stall');

    await StreamUtil.pipelineSafe(source, upperCase(), async (readable) => {
      expect(source.listenerCount('error')).toBeGreaterThan(0);
      return await readOne(readable);
    });
  });

  it('tears down every source when used repeatedly', async () => {
    // pipeline() deliberately leaves its own listeners on a stream it has destroyed, so the
    // property that matters is not the listener count but that every source is actually closed
    const sources: stream.Readable[] = [];

    for (let i = 0; i < 50; i++) {
      const source = chunkThen('stall');
      sources.push(source);
      await StreamUtil.pipelineSafe(source, upperCase(), readOne);
    }

    expect(sources).toHaveLength(50);
    expect(sources.every((source) => source.destroyed)).toEqual(true);
  });
});

describe('split', () => {
  it('returns no streams for a count of zero', () => {
    const source = stream.Readable.from([Buffer.from('abc')]);
    expect(StreamUtil.split(source, 0)).toHaveLength(0);
    source.destroy();
  });

  it('returns the source stream for a count of one', () => {
    const source = stream.Readable.from([Buffer.from('abc')]);
    expect(StreamUtil.split(source, 1)).toEqual([source]);
    source.destroy();
  });

  it('gives every output the full contents of the source', async () => {
    const source = stream.Readable.from([Buffer.from('abc'), Buffer.from('def')]);
    const outputs = StreamUtil.split(source, 3);

    const results = await Promise.all(
      outputs.map(async (output) => await BufferUtil.fromReadable(output)),
    );

    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.toString()).toEqual('abcdef');
    }
  });

  it('gives every output the full contents of a source larger than one chunk', async () => {
    const chunk = Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE, 0x01);
    const source = stream.Readable.from([chunk, chunk, chunk, chunk]);
    const outputs = StreamUtil.split(source, 2);

    const results = await Promise.all(
      outputs.map(async (output) => await BufferUtil.fromReadable(output)),
    );

    for (const result of results) {
      expect(result.length).toEqual(chunk.length * 4);
      expect(result.every((byte) => byte === 0x01)).toEqual(true);
    }
  });

  it('pauses the source while an output is not being read', async () => {
    const chunk = Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE, 0x01);
    const source = stream.Readable.from([chunk, chunk, chunk, chunk]);
    const outputs = StreamUtil.split(source, 2);

    // Neither output is being read, so the source shouldn't be buffered without bound
    await tick();
    await tick();
    expect(source.isPaused()).toEqual(true);
    expect(source.readableEnded).toEqual(false);

    for (const output of outputs) {
      output.destroy();
    }
  });

  it('destroys the source only after every output has been destroyed', async () => {
    // Large enough that the source is still mid-stream, and therefore couldn't have ended and
    // auto-destroyed itself, while the outputs are being destroyed
    const chunk = Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE, 0x01);
    const source = stream.Readable.from([chunk, chunk, chunk, chunk]);
    const outputs = StreamUtil.split(source, 2);
    await tick();

    outputs[0].destroy();
    await tick();
    expect(source.destroyed).toEqual(false);

    outputs[1].destroy();
    await tick();
    expect(source.destroyed).toEqual(true);
  });

  it('errors every output when the source errors', async () => {
    const source = new stream.PassThrough();
    source.write(Buffer.from('abc'));
    const outputs = StreamUtil.split(source, 2);
    const reads = outputs.map(async (output) => await BufferUtil.fromReadable(output));
    await tick();

    source.destroy(new Error('source failed'));

    await expect(Promise.all(reads)).rejects.toThrow('source failed');
  });

  it('errors every output when the source is destroyed before it ends', async () => {
    // A source destroyed without an error emits neither 'end' nor 'error', which would otherwise
    // leave every output waiting forever for data that will never arrive
    const source = new stream.PassThrough();
    source.write(Buffer.from('abc'));
    const outputs = StreamUtil.split(source, 2);
    const reads = outputs.map(async (output) => await BufferUtil.fromReadable(output));
    await tick();

    source.destroy();

    await expect(Promise.all(reads)).rejects.toThrow();
    for (const output of outputs) {
      expect(output.destroyed).toEqual(true);
    }
  });

  it('destroys the source after every output has been fully read', async () => {
    const source = stream.Readable.from([Buffer.from('abc'), Buffer.from('def')]);
    const outputs = StreamUtil.split(source, 2);

    await Promise.all(outputs.map(async (output) => await BufferUtil.fromReadable(output)));
    await tick();

    expect(source.destroyed).toEqual(true);
  });
});

describe('staticReadable', () => {
  it('emits nothing for a length of zero', async () => {
    const got = await BufferUtil.fromReadable(StreamUtil.staticReadable(0, 0x00));
    expect(got).toEqual(Buffer.alloc(0));
  });

  it('emits the requested number of bytes filled with a number', async () => {
    const got = await BufferUtil.fromReadable(StreamUtil.staticReadable(5, 0xff));
    expect(got).toEqual(Buffer.alloc(5, 0xff));
  });

  it('emits the requested number of bytes filled with a string', async () => {
    const got = await BufferUtil.fromReadable(StreamUtil.staticReadable(4, 'ab'));
    expect(got).toEqual(Buffer.from('abab'));
  });

  it('emits a length larger than one chunk', async () => {
    const length = 3 * Defaults.FILE_READING_CHUNK_SIZE + 7;
    const got = await BufferUtil.fromReadable(StreamUtil.staticReadable(length, 0x00));
    expect(got).toEqual(Buffer.alloc(length, 0x00));
  });
});

describe('withTransforms', () => {
  it('returns the source stream when given no transforms', () => {
    const source = stream.Readable.from([Buffer.from('abc')]);
    expect(StreamUtil.withTransforms(source)).toStrictEqual(source);
  });

  it('applies a single transform', async () => {
    const source = stream.Readable.from([Buffer.from('abc'), Buffer.from('def')]);
    const got = await BufferUtil.fromReadable(StreamUtil.withTransforms(source, upperCase()));
    expect(got.toString()).toEqual('ABCDEF');
  });

  it('applies multiple transforms in order', async () => {
    const source = stream.Readable.from([Buffer.from('abc')]);
    const got = await BufferUtil.fromReadable(
      StreamUtil.withTransforms(source, upperCase(), exclaim()),
    );
    expect(got.toString()).toEqual('ABC!');
  });

  it('errors the output when the source errors', async () => {
    const source = new stream.PassThrough();
    source.write(Buffer.from('abc'));
    const output = StreamUtil.withTransforms(source, upperCase());
    const read = BufferUtil.fromReadable(output);
    await tick();

    source.destroy(new Error('source failed'));

    await expect(read).rejects.toThrow('source failed');
  });

  it('errors the output when a transform errors', async () => {
    const source = stream.Readable.from([Buffer.from('abc')]);
    const transform = new stream.Transform({
      transform(_chunk, _encoding, callback): void {
        callback(new Error('transform failed'));
      },
    });

    await expect(
      BufferUtil.fromReadable(StreamUtil.withTransforms(source, transform)),
    ).rejects.toThrow('transform failed');
  });

  it('destroys the source when the output is destroyed', async () => {
    const source = new stream.PassThrough();
    const output = StreamUtil.withTransforms(source, upperCase());
    await tick();

    output.destroy();
    await tick();

    expect(source.destroyed).toEqual(true);
  });
});
