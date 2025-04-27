import zlib, { ZlibCompressionLevel, ZlibFlush } from './index.js';

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
    const compressed = deflater.compressChunk(input, ZlibFlush.Z_FINISH);
    deflater.end();

    expect(compressed.toString('hex')).toEqual(expectedOutput.toString('hex'));
  });
});
