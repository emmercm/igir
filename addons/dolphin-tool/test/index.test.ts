import crypto from 'node:crypto';
import events from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type stream from 'node:stream';
import worker_threads from 'node:worker_threads';

import Temp from '../../../src/globals/temp.js';
import BufferUtil from '../../../src/utils/bufferUtil.js';
import FsUtil from '../../../src/utils/fsUtil.js';
import PathUtil from '../../../src/utils/pathUtil.js';
import isFileOpen from '../../../test/utils/isFileOpen.js';
import dolphin, { ContainerFormat } from '../index.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

const GAMECUBE_ISO_SIZE = 1_441_792;
const GAMECUBE_ISO_SHA1 = 'e3d1df9d19ecc7e8f71ac50aacb55e689f331f45';

const WII_DECOMPRESSED_SIZE = 4_699_979_776;
const WII_GCZ_SHA1 = '85581927a3f7652b2d6d06b1b90a76109eb50ca8'; // zero-padded
const WII_WIA_SHA1 = 'a9ce9b2edcdbfb525631178c2ea12d32b4994ab6'; // lagged fibonacci generator-padded

const cases = [
  {
    format: ContainerFormat.GCZ,
    file: '240pSuite-GameCube-1.20.gcz',
    size: GAMECUBE_ISO_SIZE,
    sha1: GAMECUBE_ISO_SHA1,
  },
  {
    format: ContainerFormat.RVZ,
    file: '240pSuite-GameCube-1.20.bzip2.rvz',
    size: GAMECUBE_ISO_SIZE,
    sha1: GAMECUBE_ISO_SHA1,
  },
  {
    format: ContainerFormat.RVZ,
    file: '240pSuite-GameCube-1.20.lzma.rvz',
    size: GAMECUBE_ISO_SIZE,
    sha1: GAMECUBE_ISO_SHA1,
  },
  {
    format: ContainerFormat.RVZ,
    file: '240pSuite-GameCube-1.20.lzma2.rvz',
    size: GAMECUBE_ISO_SIZE,
    sha1: GAMECUBE_ISO_SHA1,
  },
  {
    format: ContainerFormat.RVZ,
    file: '240pSuite-GameCube-1.20.zstd.rvz',
    size: GAMECUBE_ISO_SIZE,
    sha1: GAMECUBE_ISO_SHA1,
  },
  {
    format: ContainerFormat.GCZ,
    file: '240pSuite-Wii-1.20.gcz',
    size: WII_DECOMPRESSED_SIZE,
    sha1: WII_GCZ_SHA1,
  },
  {
    format: ContainerFormat.WIA,
    file: '240pSuite-Wii-1.20.bzip2.wia',
    size: WII_DECOMPRESSED_SIZE,
    sha1: WII_WIA_SHA1,
  },
  {
    format: ContainerFormat.WIA,
    file: '240pSuite-Wii-1.20.lzma.wia',
    size: WII_DECOMPRESSED_SIZE,
    sha1: WII_WIA_SHA1,
  },
  {
    format: ContainerFormat.WIA,
    file: '240pSuite-Wii-1.20.lzma2.wia',
    size: WII_DECOMPRESSED_SIZE,
    sha1: WII_WIA_SHA1,
  },
  {
    format: ContainerFormat.WIA,
    file: '240pSuite-Wii-1.20.purge.wia',
    size: WII_DECOMPRESSED_SIZE,
    sha1: WII_WIA_SHA1,
  },
];

/**
 * Run `callback` against a temporary directory that is removed afterwards, however it finishes.
 */
async function withTempDir<T>(callback: (directory: string) => Promise<T> | T): Promise<T> {
  if (!(await FsUtil.exists(Temp.getTempDir()))) {
    await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
  }
  const directory = await FsUtil.mkdtemp(Temp.getTempDir());
  try {
    return await callback(directory);
  } finally {
    await FsUtil.rm(directory, { recursive: true, force: true });
  }
}

/**
 * Copy the fixture `file` into `directory`, so that a test checks the handles of a file that no
 * other test, and no other process, has open.
 * @returns the path of the copy
 */
async function copyInto(directory: string, file: string): Promise<string> {
  const copy = path.join(directory, file);
  await fs.promises.copyFile(path.join(FIXTURES, file), copy);
  return copy;
}

/**
 * Destroy {@link readable}, with {@link error} if one is given, and record the events it emits from
 * then on, until it closes.
 * @returns the names of the events, in the order they were emitted
 */
async function eventsAfterDestroy(readable: stream.Readable, error?: Error): Promise<string[]> {
  const emitted: string[] = [];
  const closed = new Promise<void>((resolve) => {
    for (const name of ['data', 'end', 'error', 'close']) {
      readable.on(name, () => {
        emitted.push(name);
        if (name === 'close') {
          resolve();
        }
      });
    }
  });
  readable.destroy(error);
  await closed;
  return emitted;
}

describe('info', () => {
  it.each(cases)(
    'should read the $format header without decompressing, then release the file ($file)',
    async ({ format, file, size }) => {
      await withTempDir(async (directory) => {
        const inputFilename = await copyInto(directory, file);
        const info = await dolphin.info({ inputFilename });
        expect(info.format).toEqual(format);
        expect(info.decompressedSize).toEqual(size);
        expect(Object.values(ContainerFormat)).toContain(info.format);
        expect(await isFileOpen(inputFilename)).toEqual(false);
      });
    },
  );

  it('should reject a missing file', async () => {
    await expect(
      dolphin.info({
        inputFilename: `${path.join(FIXTURES, '240pSuite-GameCube-1.20.gcz')}.missing`,
      }),
    ).rejects.toThrow('failed to open blob');
  });

  it('should reject a non-Dolphin file, then release it', async () => {
    await withTempDir(async (directory) => {
      const inputFilename = await copyInto(directory, 'README.md');
      // Dolphin opens any file it does not recognize as a plain disc image, which
      // is not a container format this package reports
      await expect(dolphin.info({ inputFilename })).rejects.toThrow(
        'unexpected Dolphin container format',
      );
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  it('should read many headers concurrently', async () => {
    const infos = await Promise.all(
      Array.from(
        { length: 16 },
        async () =>
          await dolphin.info({ inputFilename: path.join(FIXTURES, '240pSuite-Wii-1.20.lzma.wia') }),
      ),
    );
    expect(new Set(infos.map((info) => info.decompressedSize))).toEqual(
      new Set([WII_DECOMPRESSED_SIZE]),
    );
  });
});

describe('openReader', () => {
  it.each(cases)(
    'should stream $format to the exact decoded ISO, then release the file ($file)',
    async ({ file, size, sha1 }) => {
      await withTempDir(async (directory) => {
        const inputFilename = await copyInto(directory, file);
        const readable = dolphin.openReader({ inputFilename });
        const hash = crypto.createHash('sha1');
        let total = 0;
        for await (const chunk of readable) {
          total += (chunk as Buffer).length;
          hash.update(chunk as Buffer);
        }
        expect(total).toEqual(size);
        expect(hash.digest('hex')).toEqual(sha1);
        expect(await isFileOpen(inputFilename)).toEqual(false);
      });
    },
  );

  it('should keep every chunk intact after later reads, including a short final chunk', async () => {
    const readable = dolphin.openReader({
      inputFilename: path.join(FIXTURES, '240pSuite-GameCube-1.20.gcz'),
      highWaterMark: 100_000,
    });
    const chunks: Buffer[] = [];
    for await (const chunk of readable) {
      if (!Buffer.isBuffer(chunk)) {
        throw new TypeError('expected a Buffer chunk');
      }
      chunks.push(chunk);
    }
    expect(new Set(chunks.slice(0, -1).map((chunk) => chunk.length))).toEqual(new Set([100_000]));
    expect(chunks.at(-1)?.length).toEqual(GAMECUBE_ISO_SIZE % 100_000);
    expect(crypto.createHash('sha1').update(Buffer.concat(chunks)).digest('hex')).toEqual(
      GAMECUBE_ISO_SHA1,
    );
  });

  it('should allocate only the bytes left for the final chunk', async () => {
    const readable = dolphin.openReader({
      inputFilename: path.join(FIXTURES, '240pSuite-GameCube-1.20.gcz'),
      highWaterMark: 100_000,
    });
    // Only the final chunk is kept
    let finalChunk: Buffer | undefined;
    for await (const chunk of readable) {
      if (!Buffer.isBuffer(chunk)) {
        throw new TypeError('expected a Buffer chunk');
      }
      finalChunk = chunk;
    }
    expect({ length: finalChunk?.length, allocated: finalChunk?.buffer.byteLength }).toEqual({
      length: GAMECUBE_ISO_SIZE % 100_000,
      allocated: GAMECUBE_ISO_SIZE % 100_000,
    });
  });

  it('should reject on a missing file', async () => {
    const readable = dolphin.openReader({
      inputFilename: `${path.join(FIXTURES, '240pSuite-GameCube-1.20.gcz')}.missing`,
    });
    await expect(readable.toArray()).rejects.toThrow('failed to open blob');
  });

  it('should pass a non-Dolphin file through unchanged, then release it', async () => {
    await withTempDir(async (directory) => {
      // Dolphin opens any file it does not recognize as a plain disc image
      const inputFilename = await copyInto(directory, 'README.md');
      const output = await BufferUtil.fromReadable(dolphin.openReader({ inputFilename }));
      expect(output.equals(await fs.promises.readFile(inputFilename))).toEqual(true);
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  it('should close cleanly and release the file when destroyed before the first read finishes', async () => {
    await withTempDir(async (directory) => {
      const inputFilename = await copyInto(directory, '240pSuite-Wii-1.20.lzma.wia');
      await Promise.all(
        Array.from({ length: 16 }, async () => {
          const readable = dolphin.openReader({ inputFilename });
          // Starts the first read, and so the lazy open, without waiting for it
          readable.resume();
          const closed = events.once(readable, 'close');
          readable.destroy();
          await closed;
          expect(readable.destroyed).toEqual(true);
        }),
      );
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  it('should hold the file open mid-stream, and release it before emitting close when destroyed', async () => {
    await withTempDir(async (directory) => {
      const inputFilename = await copyInto(directory, '240pSuite-GameCube-1.20.bzip2.rvz');
      const readable = dolphin.openReader({ inputFilename, highWaterMark: 4096 });
      expect((await readable[Symbol.asyncIterator]().next()).done).toEqual(false);
      expect(await isFileOpen(inputFilename)).toEqual(true);

      const closed = events.once(readable, 'close');
      readable.destroy();
      await closed;
      expect(readable.destroyed).toEqual(true);
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  it('should reject a highWaterMark of zero instead of ending early', async () => {
    const readable = dolphin.openReader({
      inputFilename: path.join(FIXTURES, '240pSuite-GameCube-1.20.gcz'),
      highWaterMark: 0,
    });
    await expect(readable.toArray()).rejects.toThrow('maxBytes must be a positive number');
  });

  it('should reject a highWaterMark past 64 MiB', async () => {
    const readable = dolphin.openReader({
      inputFilename: path.join(FIXTURES, '240pSuite-GameCube-1.20.gcz'),
      highWaterMark: 64 * 1024 * 1024 + 1,
    });
    await expect(readable.toArray()).rejects.toThrow('maxBytes is too large');
  });

  it('should reject a highWaterMark past the largest request', async () => {
    const readable = dolphin.openReader({
      inputFilename: path.join(FIXTURES, '240pSuite-GameCube-1.20.gcz'),
      highWaterMark: Number.MAX_SAFE_INTEGER * 2,
    });
    await expect(readable.toArray()).rejects.toThrow('maxBytes is too large');
  });

  it('should release the file when destroyed before reading, emitting the same events as fs.ReadStream', async () => {
    await withTempDir(async (directory) => {
      const inputFilename = await copyInto(directory, '240pSuite-GameCube-1.20.gcz');
      const expected = await eventsAfterDestroy(fs.createReadStream(inputFilename));
      expect(expected).toEqual(['close']);

      const readable = dolphin.openReader({ inputFilename });
      expect(await eventsAfterDestroy(readable)).toEqual(expected);
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  it('should release the file when destroyed with a read in flight, reporting the same error as fs.ReadStream', async () => {
    await withTempDir(async (directory) => {
      const inputFilename = await copyInto(directory, '240pSuite-GameCube-1.20.bzip2.rvz');
      const error = new Error('destroyed');
      // Flowing, so each stream has its next read in flight whenever a chunk arrives
      const fileStream = fs.createReadStream(inputFilename, { highWaterMark: 1 });
      await events.once(fileStream.resume(), 'data');
      const expected = await eventsAfterDestroy(fileStream, error);
      // The chunk that the read in flight returns is dropped
      expect(expected).toEqual(['error', 'close']);

      const readable = dolphin.openReader({ inputFilename, highWaterMark: 1 });
      await events.once(readable.resume(), 'data');
      expect(await eventsAfterDestroy(readable, error)).toEqual(expected);
      expect(readable.errored).toEqual(error);
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  it('should release a truncated file once opening it rejects', async () => {
    await withTempDir(async (directory) => {
      const inputFilename = path.join(directory, 'truncated.gcz');
      const whole = await fs.promises.readFile(path.join(FIXTURES, '240pSuite-GameCube-1.20.gcz'));
      await fs.promises.writeFile(inputFilename, whole.subarray(0, Math.floor(whole.length / 2)));
      await expect(BufferUtil.fromReadable(dolphin.openReader({ inputFilename }))).rejects.toThrow(
        'failed to open blob',
      );
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  it('should release the file once many readers are abandoned at different points', async () => {
    await withTempDir(async (directory) => {
      const inputFilename = await copyInto(directory, '240pSuite-GameCube-1.20.gcz');
      await Promise.all(
        Array.from({ length: 16 }, async (_value, index) => {
          const readable = dolphin.openReader({ inputFilename, highWaterMark: 4096 });
          const iterator = readable[Symbol.asyncIterator]();
          for (let chunks = 0; chunks < 1 + (index % 4); chunks++) {
            expect((await iterator.next()).done).toEqual(false);
          }
          const closed = events.once(readable, 'close');
          readable.destroy();
          await closed;
        }),
      );
      expect(await isFileOpen(inputFilename)).toEqual(false);
    });
  });

  // TODO(cemmer): Bun, unlike Node.js, reports a terminating Worker's termination as a pending
  // N-API exception, which node-addon-api cannot clear, so it aborts the process instead of
  // dropping the error. igir never terminates a Worker, so only this test is affected. Expected
  // to be fixed by https://github.com/oven-sh/bun/pull/40249
  it.skipIf(process.versions.bun)(
    'should terminate workers with pending native reads, releasing the file',
    async () => {
      await withTempDir(async (directory) => {
        const imagePath = PathUtil.resolve(
          await copyInto(directory, '240pSuite-GameCube-1.20.zstd.rvz'),
        );
        for (let i = 0; i < 20; i++) {
          const worker = new worker_threads.Worker(
            `const { parentPort, workerData } = require('node:worker_threads');
         import(workerData.indexUrl).then(({ default: dolphin }) => {
           for (let j = 0; j < 32; j++) {
             dolphin
               .openReader({ inputFilename: workerData.imagePath, highWaterMark: 2048 })
               .on('error', () => {})
               .resume();
           }
           parentPort.postMessage('ready');
           setInterval(() => {}, 1000);
         });`,
            {
              eval: true,
              workerData: {
                indexUrl: new URL('../index.ts', import.meta.url).href,
                imagePath,
              },
            },
          );
          try {
            await events.once(worker, 'message');
            // Vary when the worker terminates relative to its reads
            await new Promise((resolve) => setTimeout(resolve, i % 5));
          } finally {
            await worker.terminate();
          }
          // Terminating waits for the worker's environment to tear down, which frees every reader
          expect(await isFileOpen(imagePath)).toEqual(false);
        }
      });
    },
    30_000,
  );
});
