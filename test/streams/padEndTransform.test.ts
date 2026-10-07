import stream from 'node:stream';

import Defaults from '../../src/globals/defaults.js';
import PadEndTransform from '../../src/streams/padEndTransform.js';

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

async function run(
  maxLength: number,
  fillString: string | number,
  chunks: Buffer[],
): Promise<Buffer> {
  const source = stream.Readable.from(chunks);
  const transform = source.pipe(new PadEndTransform(maxLength, fillString));
  const out: Buffer[] = [];
  for await (const chunk of transform) {
    if (Buffer.isBuffer(chunk)) {
      out.push(chunk);
    }
  }
  return Buffer.concat(out);
}

describe('PadEndTransform', () => {
  it('appends fill bytes up to the padded length', async () => {
    const got = await run(8, 0x00, [Buffer.from('abc')]);
    expect(got).toEqual(Buffer.concat([Buffer.from('abc'), Buffer.alloc(5, 0x00)]));
  });

  it('pads with a non-zero fill byte', async () => {
    const got = await run(6, 0xff, [Buffer.from('ab'), Buffer.from('cd')]);
    expect(got).toEqual(Buffer.concat([Buffer.from('abcd'), Buffer.alloc(2, 0xff)]));
  });

  it('pads with a fill string', async () => {
    const got = await run(5, 'z', [Buffer.from('ab')]);
    expect(got.toString()).toEqual('abzzz');
  });

  it('passes input through unchanged when it is already the padded length', async () => {
    const got = await run(4, 0x00, [Buffer.from('abcd')]);
    expect(got.toString()).toEqual('abcd');
  });

  it('emits nothing extra when the input is longer than the padded length', async () => {
    const got = await run(2, 0x00, [Buffer.from('abcdef')]);
    expect(got.toString()).toEqual('abcdef');
  });

  it('pads an empty input to the full padded length', async () => {
    const got = await run(4, 0x00, []);
    expect(got).toEqual(Buffer.alloc(4, 0x00));
  });

  it('does not buffer the whole padding while nothing is reading it', async () => {
    // The padded size can be many times the high watermark, so emitting all the padding at once
    // would hold it in memory without bound
    const paddedSize = 64 * Defaults.FILE_READING_CHUNK_SIZE;
    const transform = new PadEndTransform(paddedSize, 0x00);
    transform.end(Buffer.from('ab'));

    // Give _flush() every opportunity to emit
    await tick();
    await tick();
    await tick();

    // push() only reports a full buffer after the chunk that filled it, so the buffer can overshoot
    // the high watermark by up to one chunk, but it must not grow with the padded size
    expect(transform.readableLength).toBeLessThanOrEqual(
      transform.readableHighWaterMark + Defaults.FILE_READING_CHUNK_SIZE,
    );
    expect(transform.readableLength).toBeLessThan(paddedSize);

    transform.destroy();
  });

  it('emits the full padding to a consumer that reads it slowly', async () => {
    const paddedSize = 16 * Defaults.FILE_READING_CHUNK_SIZE + 3;
    const transform = new PadEndTransform(paddedSize, 0xff);
    transform.end(Buffer.from('ab'));

    let total = 0;
    for await (const chunk of transform) {
      if (Buffer.isBuffer(chunk)) {
        total += chunk.length;
      }
      await tick();
    }

    expect(total).toEqual(paddedSize);
  });

  it('emits padding larger than one chunk', async () => {
    const paddedSize = 64 * 1024 * 2 + 5;
    const got = await run(paddedSize, 0x00, [Buffer.from('ab')]);
    expect(got.length).toEqual(paddedSize);
    expect(got.subarray(0, 2).toString()).toEqual('ab');
    expect(got.subarray(2).every((byte) => byte === 0x00)).toEqual(true);
  });
});
