import path from 'path';

import DAT from '../../src/types/logiqx/dat.js';
import Header from '../../src/types/logiqx/header.js';
import Options from '../../src/types/options.js';

describe('getOutputDirRoot', () => {
  test.each([
    ['', '.'],
    ['.', '.'],
    ['root', 'root'],
    ['foo/bar', path.join('foo', 'bar')],
    ['Assets/{pocket}/common/', 'Assets'],
    ['games/{mister}/', 'games'],
    ['Roms/{onion}/', 'Roms'],
    ['roms/{batocera}/', 'roms'],
    ['{datName}', '.'],
    ['{datDescription}', '.'],
  ])('should find the root dir: %s', (output, expectedPath) => {
    expect(new Options({ commands: ['copy'], output }).getOutputDirRoot()).toEqual(expectedPath);
  });
});

describe('canRemoveHeader', () => {
  test.each([
    'Nintendo - Nintendo Entertainment System (Headered) (Parent-Clone)',
  ])('should not remove header for headered DATs: %s', (datName) => {
    const dat = new DAT(new Header({ name: datName }), []);
    const options = new Options({ removeHeaders: [''] });
    expect(options.canRemoveHeader(dat, '.smc')).toEqual(false);
  });

  test.each([
    'Nintendo - Nintendo Entertainment System (Headerless) (Parent-Clone)',
  ])('should remove header for headerless DATs: %s', (datName) => {
    const dat = new DAT(new Header({ name: datName }), []);
    const options = new Options({ removeHeaders: [''] });
    expect(options.canRemoveHeader(dat, '.smc')).toEqual(true);
  });

  test.each(
    ['.a78', '.lnx', '.nes', '.fds', '.smc'],
  )('should not remove header when option not provided: %s', (extension) => {
    const dat = new DAT(new Header(), []);
    const options = new Options();
    expect(options.canRemoveHeader(dat, extension)).toEqual(false);
  });

  test.each(
    ['.a78', '.lnx', '.nes', '.fds', '.smc', '.someotherextension'],
  )('should remove header when no arg provided: %s', (extension) => {
    const dat = new DAT(new Header(), []);
    const options = new Options({ removeHeaders: [''] });
    expect(options.canRemoveHeader(dat, extension)).toEqual(true);
  });

  test.each(
    ['.lnx', '.smc', '.someotherextension'],
  )('should remove header when extension matches: %s', (extension) => {
    const dat = new DAT(new Header(), []);
    const options = new Options({ removeHeaders: ['.LNX', '.smc', '.someotherextension'] });
    expect(options.canRemoveHeader(dat, extension)).toEqual(true);
  });

  test.each(
    ['.a78', '.nes', '.fds'],
  )('should not remove header when extension does not match: %s', (extension) => {
    const dat = new DAT(new Header(), []);
    const options = new Options({ removeHeaders: ['.LNX', '.smc', '.someotherextension'] });
    expect(options.canRemoveHeader(dat, extension)).toEqual(false);
  });
});
