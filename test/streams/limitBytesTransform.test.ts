import stream from 'node:stream';
import zlib from 'node:zlib';

import LimitBytesTransform from '../../src/streams/limitBytesTransform.js';
import StreamUtil from '../../src/utils/streamUtil.js';

async function run(count: number, chunks: Buffer[]): Promise<Buffer> {
  return await StreamUtil.pipelineSafe(
    stream.Readable.from(chunks),
    new LimitBytesTransform(count),
    async (readable) => {
      const out: Buffer[] = [];
      for await (const chunk of readable) {
        if (Buffer.isBuffer(chunk)) {
          out.push(chunk);
        }
      }
      return Buffer.concat(out);
    },
  );
}

/**
 * A source of {@link chunkCount} chunks of {@link chunkSize} bytes that counts how many it made.
 */
function countingSource(
  chunkCount: number,
  chunkSize: number,
): { source: stream.Readable; getChunksRead: () => number } {
  let chunksRead = 0;
  const source = new stream.Readable({
    read(): void {
      if (chunksRead >= chunkCount) {
        // End the stream
        // eslint-disable-next-line unicorn/no-null
        this.push(null);
        return;
      }
      chunksRead += 1;
      this.push(Buffer.alloc(chunkSize, chunksRead % 256));
    },
  });
  return { source, getChunksRead: () => chunksRead };
}

describe('LimitBytesTransform', () => {
  it('passes everything through when the input is shorter than the limit', async () => {
    const got = await run(100, [Buffer.from('hello'), Buffer.from(' world')]);
    expect(got.toString()).toEqual('hello world');
  });

  it('passes everything through when the input is exactly the limit', async () => {
    const got = await run(11, [Buffer.from('hello'), Buffer.from(' world')]);
    expect(got.toString()).toEqual('hello world');
  });

  it('truncates within a single chunk', async () => {
    const got = await run(4, [Buffer.from('hello world')]);
    expect(got.toString()).toEqual('hell');
  });

  it('truncates spanning multiple chunks', async () => {
    const got = await run(8, [Buffer.from('hello '), Buffer.from('world!')]);
    expect(got.toString()).toEqual('hello wo');
  });

  it('truncates exactly on a chunk boundary', async () => {
    const got = await run(6, [Buffer.from('hello '), Buffer.from('world')]);
    expect(got.toString()).toEqual('hello ');
  });

  it('emits nothing with a zero limit', async () => {
    const got = await run(0, [Buffer.from('hello'), Buffer.from('world')]);
    expect(got.length).toEqual(0);
  });

  it('stops and destroys its source once the limit is reached', async () => {
    const { source, getChunksRead } = countingSource(10_000, 1024);

    const got = await StreamUtil.pipelineSafe(
      source,
      undefined,
      async (readable) =>
        await StreamUtil.pipelineSafe(
          readable,
          new LimitBytesTransform(2048 + 10),
          async (limited) => {
            const out: Buffer[] = [];
            for await (const chunk of limited) {
              if (Buffer.isBuffer(chunk)) {
                out.push(chunk);
              }
            }
            // Give a source that wasn't stopped a chance to keep reading
            await new Promise((resolve) => setTimeout(resolve, 50));
            return Buffer.concat(out);
          },
        ),
    );

    expect(got).toEqual(
      Buffer.concat([Buffer.alloc(1024, 1), Buffer.alloc(1024, 2), Buffer.alloc(10, 3)]),
    );
    expect(source.destroyed).toEqual(true);
    // Only what fits in the streams' buffers may have been read past the limit
    expect(getChunksRead()).toBeLessThan(100);
  });

  it('stops a decompressor once the limit is reached', async () => {
    const uncompressed = Buffer.alloc(64 * 1024 * 1024, 0x42);
    const compressed = zlib.gzipSync(uncompressed);
    const gunzip = zlib.createGunzip({ chunkSize: 4096 });
    let decompressedBytes = 0;
    gunzip.on('data', (chunk: Buffer) => {
      decompressedBytes += chunk.length;
    });
    gunzip.pause();

    const got = await StreamUtil.pipelineSafe(
      stream.Readable.from([compressed]),
      gunzip,
      async (readable) =>
        await StreamUtil.pipelineSafe(readable, new LimitBytesTransform(512), async (limited) => {
          const out: Buffer[] = [];
          for await (const chunk of limited) {
            if (Buffer.isBuffer(chunk)) {
              out.push(chunk);
            }
          }
          return Buffer.concat(out);
        }),
    );

    expect(got).toEqual(uncompressed.subarray(0, 512));
    expect(gunzip.destroyed).toEqual(true);
    expect(decompressedBytes).toBeLessThan(1024 * 1024);
  });

  it('propagates errors from its source', async () => {
    const compressed = zlib.gzipSync(Buffer.alloc(1024 * 1024, 0x42));
    const truncated = compressed.subarray(0, -100);

    await expect(
      StreamUtil.pipelineSafe(
        stream.Readable.from([truncated]),
        zlib.createGunzip(),
        async (readable) => {
          await StreamUtil.pipelineSafe(
            readable,
            new LimitBytesTransform(2 * 1024 * 1024),
            async (limited) => {
              for await (const chunk of limited) {
                expect(chunk).toBeDefined();
              }
            },
          );
        },
      ),
    ).rejects.toThrow('unexpected end of file');
  });
});
