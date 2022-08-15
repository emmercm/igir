import os from 'os';

import DAT from '../../src/types/logiqx/dat.js';
import Header from '../../src/types/logiqx/header.js';
import Options from '../../src/types/options.js';

describe('getOutput', () => {
  it('should use temp dir for non-writing commands', () => {
    expect(new Options({ commands: ['test'] }).getOutput()).toContain(os.tmpdir());
    expect(new Options({ commands: ['report'] }).getOutput()).toContain(os.tmpdir());
    expect(new Options({ commands: ['zip'] }).getOutput()).toContain(os.tmpdir());
    expect(new Options({ commands: ['clean'] }).getOutput()).toContain(os.tmpdir());
  });

  it('should echo the option with no arguments', () => {
    expect(new Options({ commands: ['copy'], output: '/dev/null' }).getOutput()).toEqual('/dev/null');
    expect(new Options({ commands: ['move'], output: '/dev/null' }).getOutput()).toEqual('/dev/null');
  });

  it('should respect dir mirror', () => {
    expect(new Options({ commands: ['copy'], output: '/dev/null', dirMirror: true }).getOutput()).toEqual('/dev/null');
    expect(new Options({ commands: ['copy'], output: '/dev/null', dirMirror: true }).getOutput(undefined, undefined, 'file.rom')).toEqual('/dev/null/file.rom');
    expect(new Options({ commands: ['copy'], output: '/dev/null', dirMirror: true }).getOutput(undefined, 'file.rom', 'file.rom')).toEqual('/dev/null/file.rom');
    expect(new Options({ commands: ['copy'], output: '/dev/null', dirMirror: true }).getOutput(undefined, 'roms/file.rom', 'file.rom')).toEqual('/dev/null/file.rom');
    expect(new Options({ commands: ['copy'], output: '/dev/null', dirMirror: true }).getOutput(undefined, 'roms/subdir/file.rom', 'file.rom')).toEqual('/dev/null/subdir/file.rom');
    expect(new Options({ commands: ['copy'], output: '/dev/null', dirMirror: false }).getOutput(undefined, 'roms/subdir/file.rom', 'file.rom')).toEqual('/dev/null/file.rom');
  });

  it('should respect dir dat name', () => {
    expect(new Options({ commands: ['copy'], output: '/dev/null', dirDatName: true }).getOutput()).toEqual('/dev/null');
    expect(new Options({ commands: ['copy'], output: '/dev/null', dirDatName: true }).getOutput(new DAT(new Header({ name: 'system' }), []))).toEqual('/dev/null/system');
    expect(new Options({ commands: ['copy'], output: '/dev/null', dirDatName: false }).getOutput(new DAT(new Header({ name: 'system' }), []))).toEqual('/dev/null');
  });

  it('should respect dir letter', () => {
    expect(new Options({ commands: ['copy'], output: '/dev/null', dirLetter: true }).getOutput()).toEqual('/dev/null');
    expect(new Options({ commands: ['copy'], output: '/dev/null', dirLetter: true }).getOutput(undefined, undefined, 'file.rom')).toEqual('/dev/null/F/file.rom');
    expect(new Options({ commands: ['copy'], output: '/dev/null', dirLetter: true }).getOutput(undefined, undefined, '🙂.rom')).toEqual('/dev/null/#/🙂.rom');
    expect(new Options({ commands: ['copy'], output: '/dev/null', dirLetter: false }).getOutput(undefined, undefined, '🙂.rom')).toEqual('/dev/null/🙂.rom');
  });
});
