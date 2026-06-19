import crypto from 'node:crypto';
import stream from 'node:stream';

import BufferUtil from '../../../src/utils/bufferUtil.js';
import zstd, { type ZstdThreadedCompressorInstance } from '../index.js';

const ONE_MIB = 1024 * 1024;

const roundTripInputs: [string, Buffer][] = [
  ['empty', Buffer.alloc(0)],
  ['ascii', Buffer.from('foo')],
  ['emoji', Buffer.from('🍣🍜')],
  ['large incompressible', crypto.randomBytes(ONE_MIB)],
  ['large repetitive', Buffer.alloc(ONE_MIB, 0x61)],
];

const compressWith = async (
  compressor: ZstdThreadedCompressorInstance,
  input: Buffer,
): Promise<Buffer> =>
  Buffer.concat([await compressor.compressChunk(input), await compressor.end()]);

const decompress = async (compressed: Buffer): Promise<Buffer> => {
  const decompressor = new zstd.Decompressor();
  return Buffer.concat([await decompressor.decompressChunk(compressed), await decompressor.end()]);
};

describe('getZstdVersion', () => {
  it('should be the right zstd version', () => {
    expect(zstd.getZstdVersion()).toEqual('1.5.5');
  });
});

describe('ThreadedCompressor', () => {
  test.each([
    [Buffer.from('foo'), Buffer.from('28b52ffd0068180000666f6f010000', 'hex')],
    [Buffer.from('bar'), Buffer.from('28b52ffd0068180000626172010000', 'hex')],
    [
      Buffer.from('lorem ipsum'),
      Buffer.from('28b52ffd00685800006c6f72656d20697073756d010000', 'hex'),
    ],
    [Buffer.from('smörgås'), Buffer.from('28b52ffd0068480000736dc3b67267c3a573010000', 'hex')],
    [Buffer.from('🍣🍜'), Buffer.from('28b52ffd0068400000f09f8da3f09f8d9c010000', 'hex')],
  ])('should compress data deterministically: %s', async (input, expectedOutput) => {
    const compressor = new zstd.ThreadedCompressor(19);
    expect(
      Buffer.concat([await compressor.compressChunk(input), await compressor.end()]).toString(
        'hex',
      ),
    ).toEqual(expectedOutput.toString('hex'));
  });

  test.each(roundTripInputs)('should round-trip different inputs: %s', async (_name, input) => {
    expect(await decompress(await compressWith(new zstd.ThreadedCompressor(3), input))).toEqual(
      input,
    );
  });

  test.each(Array.from({ length: 22 }, (_, index) => index + 1))(
    'should round-trip at every compression level: %s',
    async (level) => {
      const input = Buffer.from('lorem ipsum dolor sit amet '.repeat(32));
      expect(
        await decompress(await compressWith(new zstd.ThreadedCompressor(level), input)),
      ).toEqual(input);
    },
  );

  it('should round-trip with the default compression level', async () => {
    const input = Buffer.from('lorem ipsum');
    expect(await decompress(await compressWith(new zstd.ThreadedCompressor(), input))).toEqual(
      input,
    );
  });

  it('should round-trip data fed across multiple chunks', async () => {
    const parts = [Buffer.from('lorem '), Buffer.from('ipsum '), Buffer.from('dolor')];
    const compressor = new zstd.ThreadedCompressor(3);
    const outputs: Buffer[] = [];
    for (const part of parts) {
      outputs.push(await compressor.compressChunk(part));
    }
    outputs.push(await compressor.end());

    expect(await decompress(Buffer.concat(outputs))).toEqual(Buffer.concat(parts));
  });

  it('should round-trip an empty stream', async () => {
    expect(await decompress(await new zstd.ThreadedCompressor(3).end())).toEqual(Buffer.alloc(0));
  });

  it('should safely compress with many concurrent compressors', async () => {
    const inputs = Array.from({ length: 16 }, (_, index) => crypto.randomBytes(1024 + index * 97));
    expect(
      await Promise.all(
        inputs.map(
          async (input) =>
            await decompress(await compressWith(new zstd.ThreadedCompressor(3), input)),
        ),
      ),
    ).toEqual(inputs);
  });

  test.each([
    ['too low', 0],
    ['too high', 23],
  ])('should reject out-of-range compression levels: %s', (_name, level) => {
    expect(() => new zstd.ThreadedCompressor(level)).toThrow(
      'Compression level must be between 1 and 22',
    );
  });

  it('should reject a negative thread count', () => {
    expect(() => new zstd.ThreadedCompressor({ threads: -1 })).toThrow(
      'Thread count must be non-negative',
    );
  });

  it('should throw when compressing after the stream has been ended', async () => {
    const compressor = new zstd.ThreadedCompressor(3);
    await compressor.compressChunk(Buffer.from('foo'));
    await compressor.end();
    expect(() => {
      void compressor.compressChunk(Buffer.from('bar'));
    }).toThrow('Compressor has been finalized');
  });
});

describe('Decompressor', () => {
  test.each([
    [Buffer.from('28b52ffd0068180000666f6f010000', 'hex'), Buffer.from('foo')],
    [Buffer.from('28b52ffd0068180000626172010000', 'hex'), Buffer.from('bar')],
    [
      Buffer.from('28b52ffd00685800006c6f72656d20697073756d010000', 'hex'),
      Buffer.from('lorem ipsum'),
    ],
  ])('should decompress known frames: %s', async (input, expectedOutput) => {
    expect(await decompress(input)).toEqual(expectedOutput);
  });

  test.each(roundTripInputs)(
    'should round-trip output from compressNonThreaded: %s',
    async (_name, input) => {
      expect(await decompress(zstd.compressNonThreaded(input, 3))).toEqual(input);
    },
  );

  it('should reassemble a frame fed one byte at a time', async () => {
    const input = Buffer.from('lorem ipsum dolor sit amet');
    const decompressor = new zstd.Decompressor();
    const outputs: Buffer[] = [];
    for (const byte of zstd.compressNonThreaded(input, 19)) {
      outputs.push(await decompressor.decompressChunk(Buffer.from([byte])));
    }
    outputs.push(await decompressor.end());

    expect(Buffer.concat(outputs)).toEqual(input);
  });

  it('should safely decompress with many concurrent decompressors', async () => {
    const inputs = Array.from({ length: 16 }, (_, index) => crypto.randomBytes(1024 + index * 97));
    expect(
      await Promise.all(
        inputs.map(async (input) => await decompress(zstd.compressNonThreaded(input, 3))),
      ),
    ).toEqual(inputs);
  });

  it('should throw when decompressing after the stream has been ended', async () => {
    const decompressor = new zstd.Decompressor();
    await decompressor.decompressChunk(zstd.compressNonThreaded(Buffer.from('foo'), 3));
    await decompressor.end();
    expect(() => {
      void decompressor.decompressChunk(Buffer.from('foo'));
    }).toThrow('Decompressor finalized');
  });
});

describe('compressNonThreaded', () => {
  test.each(roundTripInputs)('should round-trip: %s', async (_name, input) => {
    expect(await decompress(zstd.compressNonThreaded(input, 3))).toEqual(input);
  });

  it('should produce output equivalent to the threaded compressor', async () => {
    const input = Buffer.from('the quick brown fox jumps over the lazy dog');
    expect(await decompress(zstd.compressNonThreaded(input, 19))).toEqual(input);
    expect(await decompress(await compressWith(new zstd.ThreadedCompressor(19), input))).toEqual(
      input,
    );
  });

  test.each([
    ['too low', 0],
    ['too high', 23],
  ])('should reject out-of-range compression levels: %s', (_name, level) => {
    expect(() => zstd.compressNonThreaded(Buffer.from('foo'), level)).toThrow(
      'Compression level must be between 1 and 22',
    );
  });
});

describe('ZstdDecompressStream', () => {
  it.each(roundTripInputs)('should round-trip through a pipeline: %s', async (_name, input) => {
    expect(
      await BufferUtil.fromReadable(
        stream.Readable.from([zstd.compressNonThreaded(input, 3)]).pipe(
          new zstd.DecompressStream(),
        ),
      ),
    ).toEqual(input);
  });

  it('should round-trip a frame split across multiple stream chunks', async () => {
    const input = Buffer.from('lorem ipsum dolor sit amet'.repeat(1024));
    const compressed = zstd.compressNonThreaded(input, 3);
    expect(
      await BufferUtil.fromReadable(
        stream.Readable.from([
          compressed.subarray(0, 1),
          compressed.subarray(1, 10),
          compressed.subarray(10),
        ]).pipe(new zstd.DecompressStream()),
      ),
    ).toEqual(input);
  });

  it('should produce no output for an empty stream', async () => {
    expect(
      await BufferUtil.fromReadable(stream.Readable.from([]).pipe(new zstd.DecompressStream())),
    ).toEqual(Buffer.alloc(0));
  });

  it('should error when transforming after the decompressor has been ended', async () => {
    const decompressStream = new zstd.DecompressStream();
    await BufferUtil.fromReadable(
      stream.Readable.from([zstd.compressNonThreaded(Buffer.from('foo'), 3)]).pipe(
        decompressStream,
      ),
    );

    const transformError = await new Promise<Error | undefined>((resolve) => {
      decompressStream._transform(Buffer.from('foo'), 'binary', (error) => {
        resolve(error ?? undefined);
      });
    });
    expect(transformError?.message).toContain(
      'cannot decompress after the compressor has been ended',
    );
  });

  it('should clean up when destroyed before the end of input', async () => {
    const decompressStream = new zstd.DecompressStream();
    const closed = new Promise<void>((resolve) => {
      decompressStream.once('close', resolve);
    });
    decompressStream.destroy();
    await expect(closed).resolves.toBeUndefined();
  });
});
