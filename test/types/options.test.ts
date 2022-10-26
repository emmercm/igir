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

  describe('token replacement', () => {
    it('should not replace tokens with no arguments', () => {
      const output = '/{datName}/{pocket}/{mister}/{romBasename}/{romName}{romExt}';
      expect(new Options({
        commands: ['copy'],
        output,
      }).getOutput()).toEqual(output);
    });

    it('should replace {datName}', () => {
      const dat = new DAT(new Header({ name: 'DAT / Name' }), []);
      expect(new Options({ commands: ['copy'], output: '/foo/{datName}/bar' }).getOutput(dat)).toEqual('/foo/DAT _ Name/bar');
    });

    test.each([
      ['game.a78', '/Assets/{pocket}/common/game.a78'],
      ['game.gb', '/Assets/gb/common/game.gb'],
      ['game.nes', '/Assets/nes/common/game.nes'],
      ['game.sv', '/Assets/supervision/common/game.sv'],
    ])('should replace {pocket}: %s', (outputRomFilename, expectedPath) => {
      expect(new Options({ commands: ['copy'], output: '/Assets/{pocket}/common' }).getOutput(undefined, undefined, undefined, outputRomFilename)).toEqual(expectedPath);
    });

    test.each([
      ['game.a78', '/games/Atari7800/game.a78'],
      ['game.gb', '/games/Gameboy/game.gb'],
      ['game.nes', '/games/NES/game.nes'],
      ['game.sv', '/games/{mister}/game.sv'],
    ])('should replace {mister}: %s', (outputRomFilename, expectedPath) => {
      expect(new Options({ commands: ['copy'], output: '/games/{mister}' }).getOutput(undefined, undefined, undefined, outputRomFilename)).toEqual(expectedPath);
    });
  });

  it('should respect "--dir-mirror"', () => {
    const game = new Game();
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput()).toEqual(os.devNull);
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput(undefined, undefined, game, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput(undefined, 'file.rom', game, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput(undefined, 'roms/file.rom', game, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput(undefined, 'roms/subdir/file.rom', game, 'file.rom')).toEqual(path.join(os.devNull, 'subdir', 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: false }).getOutput(undefined, 'roms/subdir/file.rom', game, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
  });

  it('should respect "--dir-dat-name"', () => {
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatName: true }).getOutput()).toEqual(os.devNull);
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatName: true }).getOutput(new DAT(new Header({ name: 'system' }), []))).toEqual(path.join(os.devNull, 'system'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatName: false }).getOutput(new DAT(new Header({ name: 'system' }), []))).toEqual(os.devNull);
  });

  it('should respect "--dir-letter"', () => {
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
