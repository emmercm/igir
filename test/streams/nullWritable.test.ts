import NullWritable from '../../src/streams/nullWritable.js';

describe('NullWritable', () => {
  it('should discard written data and finish', async () => {
    const writable = new NullWritable();

    await new Promise<void>((resolve, reject) => {
      writable.on('finish', resolve);
      writable.on('error', reject);
      writable.write('some data');
      writable.write(Buffer.from('more data'));
      writable.end();
    });

    expect(writable.writableEnded).toEqual(true);
  });

  it('should not buffer written data', () => {
    const writable = new NullWritable();
    // A discarding sink always accepts more data, so write() should never signal backpressure.
    expect(writable.write('anything')).toEqual(true);
    expect(writable.writableLength).toEqual(0);
  });
});
