import path from 'node:path';

import Options from '../../src/types/options.js';

describe('getOutputDirRoot', () => {
  test.each([
    ['', ''],
    ['.', '.'],
    ['root', 'root'],
    ['foo/bar', path.join('foo', 'bar')],
    ['Assets/{pocket}/common/', 'Assets'],
    ['games/{mister}/', 'games'],
    ['Roms/{onion}/', 'Roms'],
    ['roms/{batocera}/', 'roms'],
    ['{datName}', ''],
    ['{datDescription}', ''],
  ])('should find the root dir: %s', (output, expectedPath) => {
    expect(new Options({ commands: ['copy'], output }).getOutputDirRoot()).toEqual(expectedPath);
  });
});

describe('canRemoveHeader', () => {
  test.each(['.a78', '.lnx', '.nes', '.fds', '.smc'])(
    'should not remove header when option not provided: %s',
    (extension) => {
      const options = new Options();
      expect(options.canRemoveHeader(extension)).toEqual(false);
    },
  );

  test.each(['.a78', '.lnx', '.nes', '.fds', '.smc', '.someotherextension'])(
    'should remove header when no arg provided: %s',
    (extension) => {
      const options = new Options({ removeHeaders: [''] });
      expect(options.canRemoveHeader(extension)).toEqual(true);
    },
  );

  test.each(['.lnx', '.smc', '.someotherextension'])(
    'should remove header when extension matches: %s',
    (extension) => {
      const options = new Options({ removeHeaders: ['.LNX', '.smc', '.someotherextension'] });
      expect(options.canRemoveHeader(extension)).toEqual(true);
    },
  );

  test.each(['.a78', '.nes', '.fds'])(
    'should not remove header when extension does not match: %s',
    (extension) => {
      const options = new Options({ removeHeaders: ['.LNX', '.smc', '.someotherextension'] });
      expect(options.canRemoveHeader(extension)).toEqual(false);
    },
  );
});
