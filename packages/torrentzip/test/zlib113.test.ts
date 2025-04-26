import zlib113 from '../src/zlib113.js';

it('should be the right zlib version', () => {
  expect(zlib113.getZlibVersion()).toEqual('1.1.3');
});
