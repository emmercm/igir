import crypto from 'node:crypto';
import events from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';
import worker_threads from 'node:worker_threads';

import BufferUtil from '../../../src/utils/bufferUtil.js';
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

describe('info', () => {
  it.each(cases)(
    'should read the $format header without decompressing ($file)',
    async ({ format, file, size }) => {
      const info = await dolphin.info({ inputFilename: path.join(FIXTURES, file) });
      expect(info.format).toEqual(format);
      expect(info.decompressedSize).toEqual(size);
      expect(Object.values(ContainerFormat)).toContain(info.format);
    },
  );

  it('should reject a missing file', async () => {
    await expect(
      dolphin.info({
        inputFilename: `${path.join(FIXTURES, '240pSuite-GameCube-1.20.gcz')}.missing`,
      }),
    ).rejects.toThrow('failed to open blob');
  });

  it('should reject a non-Dolphin file', async () => {
    // Dolphin opens any file it does not recognize as a plain disc image, which
    // is not a container format this package reports
    await expect(dolphin.info({ inputFilename: path.join(FIXTURES, 'README.md') })).rejects.toThrow(
      'unexpected Dolphin container format',
    );
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
    'should stream $format to the exact decoded ISO ($file)',
    async ({ file, size, sha1 }) => {
      const readable = dolphin.openReader({ inputFilename: path.join(FIXTURES, file) });
      const hash = crypto.createHash('sha1');
      let total = 0;
      for await (const chunk of readable) {
        total += (chunk as Buffer).length;
        hash.update(chunk as Buffer);
      }
      expect(total).toEqual(size);
      expect(hash.digest('hex')).toEqual(sha1);
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

  it('should reject on a missing file', async () => {
    const readable = dolphin.openReader({
      inputFilename: `${path.join(FIXTURES, '240pSuite-GameCube-1.20.gcz')}.missing`,
    });
    await expect(readable.toArray()).rejects.toThrow('failed to open blob');
  });

  it('should pass a non-Dolphin file through unchanged', async () => {
    // Dolphin opens any file it does not recognize as a plain disc image
    const filePath = path.join(FIXTURES, 'README.md');
    const output = await BufferUtil.fromReadable(dolphin.openReader({ inputFilename: filePath }));
    expect(output.equals(await fs.promises.readFile(filePath))).toEqual(true);
  });

  it('should close cleanly when destroyed before the first read settles', async () => {
    const readable = dolphin.openReader({
      inputFilename: path.join(FIXTURES, '240pSuite-Wii-1.20.lzma.wia'),
    });
    readable.resume();
    readable.destroy();
    await events.once(readable, 'close');
    expect(readable.destroyed).toEqual(true);
  });

  it('should not leak a handle when destroyed mid-stream', async () => {
    const readable = dolphin.openReader({
      inputFilename: path.join(FIXTURES, '240pSuite-GameCube-1.20.bzip2.rvz'),
    });
    await new Promise<void>((resolve) =>
      readable.once('readable', () => {
        resolve();
      }),
    );
    readable.destroy();
    await new Promise<void>((resolve) =>
      readable.once('close', () => {
        resolve();
      }),
    );
    // A second independent reader must still open the same file (handle was released).
    const again = dolphin.openReader({
      inputFilename: path.join(FIXTURES, '240pSuite-GameCube-1.20.bzip2.rvz'),
    });
    again.destroy();
    expect(again).toBeInstanceOf(stream.Readable);
  });

  it('should reject a high-water mark of zero instead of ending early', async () => {
    const readable = dolphin.openReader({
      inputFilename: path.join(FIXTURES, '240pSuite-GameCube-1.20.gcz'),
      highWaterMark: 0,
    });
    await expect(readable.toArray()).rejects.toThrow('maxBytes must be a positive number');
  });

  it('should reject a high-water mark past 64 MiB', async () => {
    const readable = dolphin.openReader({
      inputFilename: path.join(FIXTURES, '240pSuite-GameCube-1.20.gcz'),
      highWaterMark: 64 * 1024 * 1024 + 1,
    });
    await expect(readable.toArray()).rejects.toThrow('maxBytes is too large');
  });

  it('should reject a high-water mark past the largest request', async () => {
    const readable = dolphin.openReader({
      inputFilename: path.join(FIXTURES, '240pSuite-GameCube-1.20.gcz'),
      highWaterMark: Number.MAX_SAFE_INTEGER * 2,
    });
    await expect(readable.toArray()).rejects.toThrow('maxBytes is too large');
  });

  // TODO(cemmer): Bun, unlike Node.js, reports a terminating Worker's termination as a pending
  // N-API exception, which node-addon-api cannot clear, so it aborts the process instead of
  // dropping the error. igir never terminates a Worker, so only this test is affected. Expected
  // to be fixed by https://github.com/oven-sh/bun/pull/40249
  it.skipIf(process.versions.bun)(
    'should terminate workers with pending native reads',
    async () => {
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
              imagePath: path.join(FIXTURES, '240pSuite-GameCube-1.20.zstd.rvz'),
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
      }
    },
    30_000,
  );
});
