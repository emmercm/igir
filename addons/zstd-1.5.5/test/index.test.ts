import crypto from 'node:crypto';
import events from 'node:events';
import worker_threads from 'node:worker_threads';
import zlib from 'node:zlib';

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

const decompress = async (compressed: Buffer): Promise<Buffer> =>
  await new Promise((resolve, reject) => {
    zlib.zstdDecompress(compressed, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });

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
    expect(
      (await decompress(await compressWith(new zstd.ThreadedCompressor(3), input))).equals(input),
    ).toEqual(true);
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

  it('should round-trip chunks compressed without awaiting each other', async () => {
    const parts = Array.from({ length: 8 }, () => crypto.randomBytes(ONE_MIB));
    const compressor = new zstd.ThreadedCompressor({ level: 3, threads: 2 });
    const outputs = await Promise.all([
      ...parts.map(async (part) => await compressor.compressChunk(part)),
      compressor.end(),
    ]);

    expect((await decompress(Buffer.concat(outputs))).equals(Buffer.concat(parts))).toEqual(true);
  });

  // TODO(cemmer): Bun, unlike Node.js, reports a terminating Worker's termination as a pending
  // N-API exception, which node-addon-api cannot clear, so it aborts the process instead of
  // dropping the error. igir never terminates a Worker, so only this test is affected. Expected
  // to be fixed by https://github.com/oven-sh/bun/pull/40249
  it.skipIf(process.versions.bun)(
    'should terminate workers with pending compressions',
    async () => {
      for (let i = 0; i < 20; i++) {
        const worker = new worker_threads.Worker(
          `const crypto = require('node:crypto');
         const { parentPort, workerData } = require('node:worker_threads');
         import(workerData.indexUrl).then(({ default: zstd }) => {
           for (let j = 0; j < 8; j++) {
             const compressor = new zstd.ThreadedCompressor({ level: 19, threads: 2 });
             compressor.compressChunk(crypto.randomBytes(1024 * 1024)).catch(() => {});
             compressor.end().catch(() => {});
           }
           parentPort.postMessage('ready');
           setInterval(() => {}, 1000);
         });`,
          {
            eval: true,
            workerData: { indexUrl: new URL('../index.ts', import.meta.url).href },
          },
        );
        try {
          await events.once(worker, 'message');
        } finally {
          await worker.terminate();
        }
      }
    },
    30_000,
  );

  it('should throw when compressing after the stream has been ended', async () => {
    const compressor = new zstd.ThreadedCompressor(3);
    await compressor.compressChunk(Buffer.from('foo'));
    await compressor.end();
    expect(() => {
      void compressor.compressChunk(Buffer.from('bar'));
    }).toThrow('Compressor has been finalized');
  });
});

describe('compressNonThreaded', () => {
  test.each(roundTripInputs)('should round-trip: %s', async (_name, input) => {
    expect((await decompress(zstd.compressNonThreaded(input, 3))).equals(input)).toEqual(true);
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
