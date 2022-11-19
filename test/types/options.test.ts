import os from 'os';
import path from 'path';

import Constants from '../../src/constants.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import Release from '../../src/types/logiqx/release.js';
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

    test.each([
      ['/foo/{datName}/bar', '/foo/DAT _ Name/bar/game.rom'],
      ['/root/{datReleaseRegion}', '/root/DAT _ Name/bar/game.rom'],
      ['/root/{datReleaseLanguage}', '/root/DAT _ Name/bar/game.rom'],
    ])('should replace {dat*}: %s', (output, expectedPath) => {
      const dat = new DAT(new Header({ name: 'DAT / Name' }), []);
      const release = new Release('Game Name', 'USA', 'En');
      expect(new Options({ commands: ['copy'], output }).getOutput(dat, undefined, undefined, release, 'game.rom')).toEqual(expectedPath);
    });

    test.each([
      ['{inputDirname}', '/path/to/game.rom'],
    ])('should replace {input*}: %s', (output, expectedPath) => {
      expect(new Options({ commands: ['copy'], output }).getOutput(undefined, '/path/to/game.bin', undefined, undefined, 'game.rom')).toEqual(expectedPath);
    });

    test.each([
      ['/root/{outputBasename}', '/root/game.rom/game.rom'],
      ['/root/{outputName}.{outputExt}', '/root/game.rom/game.rom'],
    ])('should replace {output*}: %s', (output, expectedPath) => {
      expect(new Options({ commands: ['copy'], output }).getOutput(undefined, '/path/to/game.bin', undefined, undefined, 'game.rom')).toEqual(expectedPath);
    });

    test.each([
      ['game.a78', '/Assets/{pocket}/common/game.a78'],
      ['game.gb', '/Assets/gb/common/game.gb'],
      ['game.nes', '/Assets/nes/common/game.nes'],
      ['game.sv', '/Assets/supervision/common/game.sv'],
    ])('should replace {pocket}: %s', (outputRomFilename, expectedPath) => {
      expect(new Options({ commands: ['copy'], output: '/Assets/{pocket}/common' }).getOutput(undefined, undefined, undefined, undefined, outputRomFilename)).toEqual(expectedPath);
    });

    test.each([
      ['game.a78', '/games/Atari7800/game.a78'],
      ['game.gb', '/games/Gameboy/game.gb'],
      ['game.nes', '/games/NES/game.nes'],
      ['game.sv', '/games/{mister}/game.sv'],
    ])('should replace {mister}: %s', (outputRomFilename, expectedPath) => {
      expect(new Options({ commands: ['copy'], output: '/games/{mister}' }).getOutput(undefined, undefined, undefined, undefined, outputRomFilename)).toEqual(expectedPath);
    });
  });

  it('should respect "--dir-mirror"', () => {
    const game = new Game();
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput()).toEqual(os.devNull);
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput(undefined, undefined, game, undefined, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput(undefined, 'file.rom', game, undefined, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput(undefined, 'roms/file.rom', game, undefined, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutput(undefined, 'roms/subdir/file.rom', game, undefined, 'file.rom')).toEqual(path.join(os.devNull, 'subdir', 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: false }).getOutput(undefined, 'roms/subdir/file.rom', game, undefined, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
  });

  it('should respect "--dir-dat-name"', () => {
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatName: true }).getOutput()).toEqual(os.devNull);
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatName: true }).getOutput(new DAT(new Header({ name: 'system' }), []))).toEqual(path.join(os.devNull, 'system'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatName: false }).getOutput(new DAT(new Header({ name: 'system' }), []))).toEqual(os.devNull);
  });

  it('should respect "--dir-letter"', () => {
    const game = new Game();
    expect(new Options({ commands: ['copy'], output: os.devNull, dirLetter: true }).getOutput()).toEqual(os.devNull);
    expect(new Options({ commands: ['copy'], output: os.devNull, dirLetter: true }).getOutput(undefined, undefined, game, undefined, 'file.rom')).toEqual(path.join(os.devNull, 'F', 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirLetter: true }).getOutput(undefined, undefined, game, undefined, '🙂.rom')).toEqual(path.join(os.devNull, '#', '🙂.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirLetter: false }).getOutput(undefined, undefined, game, undefined, '🙂.rom')).toEqual(path.join(os.devNull, '🙂.rom'));
  });

  it('should respect game name', () => {
    expect(new Options({ commands: ['copy'], output: os.devNull }).getOutput(undefined, undefined, new Game({
      name: 'game',
    }), undefined, 'one.rom')).toEqual(path.join(os.devNull, 'one.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull }).getOutput(undefined, undefined, new Game({
      name: 'game',
      rom: new ROM('one.rom', 0, '00000000'),
    }), undefined, 'one.rom')).toEqual(path.join(os.devNull, 'one.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull }).getOutput(undefined, undefined, new Game({
      name: 'game',
      rom: [new ROM('one.rom', 0, '00000000'), new ROM('two.rom', 0, '00000000')],
    }), undefined, 'one.rom')).toEqual(path.join(os.devNull, 'game', 'one.rom'));
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
