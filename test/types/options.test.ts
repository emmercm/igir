import os from 'os';
import path from 'path';

import Constants from '../../src/constants.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import ROM from '../../src/types/logiqx/rom.js';
import Options from '../../src/types/options.js';

describe('getOutput', () => {
  it('should use temp dir for non-writing commands', () => {
    expect(new Options({ commands: ['test'] }).getOutput()).toContain(Constants.GLOBAL_TEMP_DIR);
    expect(new Options({ commands: ['report'] }).getOutput()).toContain(Constants.GLOBAL_TEMP_DIR);
    expect(new Options({ commands: ['zip'] }).getOutput()).toContain(Constants.GLOBAL_TEMP_DIR);
    expect(new Options({ commands: ['clean'] }).getOutput()).toContain(Constants.GLOBAL_TEMP_DIR);
  });

  it('should echo the option with no arguments', () => {
    expect(new Options({ commands: ['copy'], output: os.devNull }).getOutput()).toEqual(os.devNull);
    expect(new Options({ commands: ['move'], output: os.devNull }).getOutput()).toEqual(os.devNull);
  });

  it('should respect dir mirror', () => {
    const game = new Game();
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput()).toEqual(os.devNull);
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput(undefined, undefined, game, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput(undefined, 'file.rom', game, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput(undefined, 'roms/file.rom', game, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput(undefined, 'roms/subdir/file.rom', game, 'file.rom')).toEqual(path.join(os.devNull, 'subdir', 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: false }).getOutput(undefined, 'roms/subdir/file.rom', game, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
  });

  it('should respect dir dat name', () => {
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatName: true }).getOutput()).toEqual(os.devNull);
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatName: true }).getOutput(new DAT(new Header({ name: 'system' }), []))).toEqual(path.join(os.devNull, 'system'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatName: false }).getOutput(new DAT(new Header({ name: 'system' }), []))).toEqual(os.devNull);
  });

  it('should respect dir letter', () => {
    const game = new Game();
    expect(new Options({ commands: ['copy'], output: os.devNull, dirLetter: true }).getOutput()).toEqual(os.devNull);
    expect(new Options({ commands: ['copy'], output: os.devNull, dirLetter: true }).getOutput(undefined, undefined, game, 'file.rom')).toEqual(path.join(os.devNull, 'F', 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirLetter: true }).getOutput(undefined, undefined, game, '🙂.rom')).toEqual(path.join(os.devNull, '#', '🙂.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirLetter: false }).getOutput(undefined, undefined, game, '🙂.rom')).toEqual(path.join(os.devNull, '🙂.rom'));
  });

  it('should respect game name', () => {
    expect(new Options({ commands: ['copy'], output: os.devNull }).getOutput(undefined, undefined, new Game({
      name: 'game',
    }), 'one.rom')).toEqual(path.join(os.devNull, 'one.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull }).getOutput(undefined, undefined, new Game({
      name: 'game',
      rom: new ROM('one.rom', 0, '00000000'),
    }), 'one.rom')).toEqual(path.join(os.devNull, 'one.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull }).getOutput(undefined, undefined, new Game({
      name: 'game',
      rom: [new ROM('one.rom', 0, '00000000'), new ROM('two.rom', 0, '00000000')],
    }), 'one.rom')).toEqual(path.join(os.devNull, 'game', 'one.rom'));
  });
});
