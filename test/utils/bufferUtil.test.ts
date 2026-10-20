import stream from 'node:stream';

import BufferUtil from '../../src/utils/bufferUtil.js';

describe('fromReadable', () => {
  it('should read every chunk', async () => {
    const readable = stream.Readable.from([Buffer.from('foo'), Buffer.from('bar')]);

    await expect(BufferUtil.fromReadable(readable)).resolves.toEqual(Buffer.from('foobar'));
  });
});

describe('fromReadableFirstBytes', () => {
  test.each([
    [0, ''],
    [1, 'f'],
    [3, 'foo'],
    [4, 'foob'],
    [9, 'foobarbaz'],
    [100, 'foobarbaz'],
  ])('should read the leading %s bytes', async (byteCount, expected) => {
    const readable = stream.Readable.from([
      Buffer.from('foo'),
      Buffer.from('bar'),
      Buffer.from('baz'),
    ]);

    await expect(BufferUtil.fromReadableFirstBytes(readable, byteCount)).resolves.toEqual(
      Buffer.from(expected),
    );
  });

  it('should destroy the readable once it has enough bytes', async () => {
    const readable = stream.Readable.from([
      Buffer.from('foo'),
      Buffer.from('bar'),
      Buffer.from('baz'),
    ]);

    const firstBytes = await BufferUtil.fromReadableFirstBytes(readable, 4);

    expect({ firstBytes, destroyed: readable.destroyed }).toEqual({
      firstBytes: Buffer.from('foob'),
      destroyed: true,
    });
  });

  it('should throw on non-binary readables', async () => {
    const readable = stream.Readable.from(['foo']);

    await expect(BufferUtil.fromReadableFirstBytes(readable, 3)).rejects.toThrow(TypeError);
  });
});
