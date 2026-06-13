import stream from 'node:stream';

import SkipBytesTransform from '../../src/streams/skipBytesTransform.js';

async function run(count: number, chunks: Buffer[]): Promise<Buffer> {
  const source = stream.Readable.from(chunks);
  const transform = source.pipe(new SkipBytesTransform(count));
  const out: Buffer[] = [];
  for await (const chunk of transform) {
    if (Buffer.isBuffer(chunk)) {
      out.push(chunk);
    }
  }
  return Buffer.concat(out);
}

describe('SkipBytesTransform', () => {
  it('passes everything through when skipping zero bytes', async () => {
    const got = await run(0, [Buffer.from('hello'), Buffer.from(' world')]);
    expect(got.toString()).toEqual('hello world');
  });

  it('drops bytes within a single chunk', async () => {
    const got = await run(3, [Buffer.from('hello world')]);
    expect(got.toString()).toEqual('lo world');
  });

  it('drops bytes spanning multiple chunks', async () => {
    const got = await run(7, [Buffer.from('hello '), Buffer.from('world!')]);
    expect(got.toString()).toEqual('orld!');
  });

  it('drops exactly one whole chunk on a boundary', async () => {
    const got = await run(6, [Buffer.from('hello '), Buffer.from('world')]);
    expect(got.toString()).toEqual('world');
  });

  it('emits nothing when skipping at least the whole input', async () => {
    const got = await run(100, [Buffer.from('hello'), Buffer.from('world')]);
    expect(got.length).toEqual(0);
  });
});
