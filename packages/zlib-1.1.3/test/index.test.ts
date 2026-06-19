import crypto from 'node:crypto';
import nodeZlib from 'node:zlib';

import zlib, { ZlibCompressionLevel } from '../index.js';

const ONE_MIB = 1024 * 1024;

describe('getZlibVersion', () => {
  it('should be the right zlib version', () => {
    expect(zlib.getZlibVersion()).toEqual('1.1.3');
  });
});

describe('Deflater', () => {
  test.each([
    [Buffer.from('foo'), Buffer.from('4bcbcf0700', 'hex')],
    [Buffer.from('bar'), Buffer.from('4b4a2c0200', 'hex')],
    [Buffer.from('lorem ipsum'), Buffer.from('cbc92f4acd55c82c282ecd0500', 'hex')],
    [Buffer.from('smörgås'), Buffer.from('2bce3dbcad28fdf0d26200', 'hex')],
    [Buffer.from('🍣🍜'), Buffer.from('fb30bf77f187f9bd7300', 'hex')],
  ])('should compress data deterministically: %s', (input, expectedOutput) => {
    const deflater = new zlib.Deflater(ZlibCompressionLevel.Z_BEST_COMPRESSION);
    const compressedChunk = deflater.compressChunk(input);
    const finalChunk = deflater.end();

    expect(Buffer.concat([compressedChunk, finalChunk]).toString('hex')).toEqual(
      expectedOutput.toString('hex'),
    );
  });

  // This package only exposes compression, not decompression. The Deflater emits a raw
  // DEFLATE stream (no zlib/gzip header or trailing checksum, i.e. negative windowBits), so
  // round-trips are verified by decompressing with Node.js's matching raw variant,
  // `inflateRawSync` (the plain `inflateSync` would reject the missing header).
  test.each<[string, Buffer]>([
    ['empty', Buffer.alloc(0)],
    ['ascii', Buffer.from('foo')],
    ['unicode', Buffer.from('smörgås')],
    ['emoji', Buffer.from('🍣🍜')],
    ['large incompressible', crypto.randomBytes(ONE_MIB)],
    ['large repetitive', Buffer.alloc(ONE_MIB, 0x61)],
  ])('should round-trip: %s', (_name, input) => {
    const deflater = new zlib.Deflater(ZlibCompressionLevel.Z_BEST_COMPRESSION);
    expect(
      nodeZlib.inflateRawSync(Buffer.concat([deflater.compressChunk(input), deflater.end()])),
    ).toEqual(input);
  });

  test.each(Object.entries(ZlibCompressionLevel))(
    'should round-trip at every compression level: %s',
    (_name, level) => {
      const input = Buffer.from('lorem ipsum dolor sit amet '.repeat(32));
      const deflater = new zlib.Deflater(level);
      expect(
        nodeZlib.inflateRawSync(Buffer.concat([deflater.compressChunk(input), deflater.end()])),
      ).toEqual(input);
    },
  );

  it('should round-trip with the default compression level', () => {
    const input = Buffer.from('lorem ipsum');
    const deflater = new zlib.Deflater();
    expect(
      nodeZlib.inflateRawSync(Buffer.concat([deflater.compressChunk(input), deflater.end()])),
    ).toEqual(input);
  });

  it('should round-trip data fed across multiple chunks', () => {
    const parts = [Buffer.from('lorem '), Buffer.from('ipsum '), Buffer.from('dolor')];
    const deflater = new zlib.Deflater();
    const outputs = parts.map((part) => deflater.compressChunk(part));
    outputs.push(deflater.end());
    expect(nodeZlib.inflateRawSync(Buffer.concat(outputs))).toEqual(Buffer.concat(parts));
  });

  test.each([
    ['Z_SYNC_FLUSH', zlib.Z_SYNC_FLUSH],
    ['Z_FULL_FLUSH', zlib.Z_FULL_FLUSH],
  ])('should emit flushable data mid-stream: %s', (_name, flush) => {
    const deflater = new zlib.Deflater(ZlibCompressionLevel.Z_BEST_COMPRESSION);
    const flushedChunk = deflater.compressChunk(Buffer.from('hello world'), flush);
    expect(flushedChunk.length).toBeGreaterThan(0);

    expect(
      nodeZlib.inflateRawSync(
        Buffer.concat([
          flushedChunk,
          deflater.compressChunk(Buffer.from(' again')),
          deflater.end(),
        ]),
      ),
    ).toEqual(Buffer.from('hello world again'));
  });

  it('should produce a valid empty stream when ended without any data', () => {
    expect(nodeZlib.inflateRawSync(new zlib.Deflater().end())).toEqual(Buffer.alloc(0));
  });

  it('should reject invalid flush modes', () => {
    expect(() => new zlib.Deflater().compressChunk(Buffer.from('foo'), 9999)).toThrow(
      'Invalid flush mode',
    );
  });

  it('should reject out-of-range compression levels', () => {
    expect(() => new zlib.Deflater(10)).toThrow('Compression level must be between -1 and 9');
    expect(() => new zlib.Deflater(-2)).toThrow(RangeError);
  });

  it('should release resources on dispose without retrieving final data', () => {
    const deflater = new zlib.Deflater();
    deflater.compressChunk(Buffer.from('foo'));
    expect(() => {
      deflater.dispose();
    }).not.toThrow();
    expect(() => deflater.compressChunk(Buffer.from('bar'))).toThrow('Deflater has been finalized');
    expect(deflater.end()).toEqual(Buffer.alloc(0));
  });

  it('should throw when compressing after the stream has been ended', () => {
    const deflater = new zlib.Deflater();
    deflater.compressChunk(Buffer.from('foo'));
    deflater.end();
    expect(() => deflater.compressChunk(Buffer.from('bar'))).toThrow('Deflater has been finalized');
  });
});
