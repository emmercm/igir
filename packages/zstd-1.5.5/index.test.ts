import zstd from './index.js';

describe('getZstdVersion', () => {
  it('should be the right zlib version', () => {
    expect(zstd.getZstdVersion()).toEqual('1.5.5');
  });
});

describe('Compressor', () => {
  test.each([
    [Buffer.from('foo'), Buffer.from('28b52ffd0068190000666f6f', 'hex')],
    [Buffer.from('bar'), Buffer.from('28b52ffd0068190000626172', 'hex')],
    [Buffer.from('lorem ipsum'), Buffer.from('28b52ffd00685900006c6f72656d20697073756d', 'hex')],
    [Buffer.from('smörgås'), Buffer.from('28b52ffd0068490000736dc3b67267c3a573', 'hex')],
    [Buffer.from('🍣🍜'), Buffer.from('28b52ffd0068410000f09f8da3f09f8d9c', 'hex')],
  ])('should compress data deterministically: %s', (input, expectedOutput) => {
    const compressor = new zstd.Compressor(19);
    compressor.compressChunk(input);
    const compressed = compressor.end();

    expect(compressed.toString('hex')).toEqual(expectedOutput.toString('hex'));
  });
});
