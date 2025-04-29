import zstd from './index.js';

describe('getZstdVersion', () => {
  it('should be the right zlib version', () => {
    expect(zstd.getZstdVersion()).toEqual('1.5.5');
  });
});

describe('Compressor', () => {
  test.each([
    [Buffer.from('foo'), Buffer.from('28b52ffd0068180000666f6f010000', 'hex')],
    [Buffer.from('bar'), Buffer.from('28b52ffd0068180000626172010000', 'hex')],
    [
      Buffer.from('lorem ipsum'),
      Buffer.from('28b52ffd00685800006c6f72656d20697073756d010000', 'hex'),
    ],
    [Buffer.from('smörgås'), Buffer.from('28b52ffd0068480000736dc3b67267c3a573010000', 'hex')],
    [Buffer.from('🍣🍜'), Buffer.from('28b52ffd0068400000f09f8da3f09f8d9c010000', 'hex')],
  ])('should compress data deterministically: %s', (input, expectedOutput) => {
    const compressor = new zstd.Compressor(19);
    const compressedChunk = compressor.compressChunk(input);
    const finalChunk = compressor.end();

    expect(Buffer.concat([compressedChunk, finalChunk]).toString('hex')).toEqual(
      expectedOutput.toString('hex'),
    );
  });
});
