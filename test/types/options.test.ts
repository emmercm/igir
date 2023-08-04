import os from 'os';
import path from 'path';

import Constants from '../../src/constants.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import Release from '../../src/types/logiqx/release.js';
import ROM from '../../src/types/logiqx/rom.js';
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
    ['{datName}', '.'],
    ['{datDescription}', '.'],
  ])('should find the root dir: %s', (output, expectedPath) => {
    expect(new Options({ commands: ['copy'], output }).getOutputDirRoot()).toEqual(expectedPath);
  });
});

describe('getOutputFileParsed', () => {
  const dummyDat = new DAT(new Header(), []);
  const dummyInputRomPath = '';
  const dummyGame = new Game();
  const dummyRelease = undefined;
  const dummyRomFilename = '';

  it('should use temp dir for non-writing commands', () => {
    expect(new Options({ commands: ['test'] }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, dummyRomFilename)).toContain(Constants.GLOBAL_TEMP_DIR);
    expect(new Options({ commands: ['report'] }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, dummyRomFilename)).toContain(Constants.GLOBAL_TEMP_DIR);
    expect(new Options({ commands: ['zip'] }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, dummyRomFilename)).toContain(Constants.GLOBAL_TEMP_DIR);
    expect(new Options({ commands: ['clean'] }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, dummyRomFilename)).toContain(Constants.GLOBAL_TEMP_DIR);
  });

  it('should echo the option with no arguments', () => {
    expect(new Options({ commands: ['copy'], output: os.devNull }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, dummyRomFilename)).toEqual(os.devNull);
    expect(new Options({ commands: ['move'], output: os.devNull }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, dummyRomFilename)).toEqual(os.devNull);
  });

  describe('token replacement', () => {
    test.each([
      ['foo/{datName}/bar', path.join('foo', 'DAT _ Name', 'bar', 'game.rom')],
      ['foo/{datDescription}/bar', path.join('foo', 'DAT _ Description', 'bar', 'game.rom')],
      ['root/{datReleaseRegion}', path.join('root', 'USA', 'game.rom')],
      ['root/{datReleaseLanguage}', path.join('root', 'En', 'game.rom')],
    ])('should replace {dat*}: %s', (output, expectedPath) => {
      const dat = new DAT(new Header({ name: 'DAT / Name', description: 'DAT \\ Description' }), []);
      const release = new Release('Game Name', 'USA', 'En');
      expect(new Options({ commands: ['copy'], output }).getOutputFileParsed(dat, dummyInputRomPath, dummyGame, release, 'game.rom')).toEqual(expectedPath);
    });

    test.each([
      // Highest priority
      ['Game [BIOS]', 'BIOS'],
      ['Game [!]', 'Retail'],
      // No particular priority
      ['Game (Aftermarket)', 'Aftermarket'],
      ['Game (Alpha)', 'Alpha'],
      ['Game [b]', 'Bad'],
      ['Game (Beta)', 'Beta'],
      ['Game (Demo)', 'Demo'],
      ['Game [f]', 'Fixed'],
      ['Game (Hack)', 'Hacked'],
      ['Game [h]', 'Hacked'],
      ['Game (Homebrew)', 'Homebrew'],
      ['Game [o]', 'Overdump'],
      ['Game [!p]', 'Pending Dump'],
      ['Game [p]', 'Pirated'],
      ['Game (Pirate)', 'Pirated'],
      ['Game (Proto)', 'Prototype'],
      ['Game (Sample)', 'Sample'],
      ['Game (Test)', 'Test'],
      ['Game [t]', 'Trained'],
      ['Game [T+Eng]', 'Translated'],
      ['Game (Unl)', 'Unlicensed'],
      // Default
      ['Game', 'Retail'],
    ])('should replace {gameType}: %s', (gameName, expectedPath) => {
      const game = new Game({ name: gameName });
      const outputFileParsed = new Options({ commands: ['copy'], output: '{gameType}' }).getOutputFileParsed(dummyDat, dummyInputRomPath, game, dummyRelease, 'dummy.rom');
      const outputDirname = path.dirname(outputFileParsed);
      expect(outputDirname).toEqual(expectedPath);
    });

    test.each([
      ['{inputDirname}', path.join('path', 'to', 'game.rom')],
    ])('should replace {input*}: %s', (output, expectedPath) => {
      expect(new Options({ commands: ['copy'], output }).getOutputFileParsed(dummyDat, 'path/to/game.bin', dummyGame, dummyRelease, 'game.rom')).toEqual(expectedPath);
    });

    test.each([
      ['root/{outputBasename}', path.join('root', 'game.rom', 'game.rom')],
      ['root/{outputName}.{outputExt}', path.join('root', 'game.rom', 'game.rom')],
    ])('should replace {output*}: %s', (output, expectedPath) => {
      expect(new Options({ commands: ['copy'], output }).getOutputFileParsed(dummyDat, 'path/to/game.bin', dummyGame, dummyRelease, 'game.rom')).toEqual(expectedPath);
    });

    test.each([
      ['game.a78', path.join('Assets', '7800', 'common', 'game.a78')],
      ['game.gb', path.join('Assets', 'gb', 'common', 'game.gb')],
      ['game.nes', path.join('Assets', 'nes', 'common', 'game.nes')],
      ['game.sv', path.join('Assets', 'supervision', 'common', 'game.sv')],
    ])('should replace {pocket} for known extension: %s', (outputRomFilename, expectedPath) => {
      expect(new Options({ commands: ['copy'], output: 'Assets/{pocket}/common' }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, outputRomFilename)).toEqual(expectedPath);
    });

    test.each([
      'game.bin',
      'game.ngp',
      'game.rom',
    ])('should throw on {pocket} for unknown extension: %s', (outputRomFilename) => {
      expect(() => new Options({ commands: ['copy'], output: 'Assets/{pocket}/common' }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, outputRomFilename)).toThrow(/failed to replace/);
    });

    test.each([
      // No unique extensions defined
      ['Bit Corporation - Gamate', path.join('Assets', 'gamate', 'common', 'game.rom')],
      ['Emerson - Arcadia', path.join('Assets', 'arcadia', 'common', 'game.rom')],
      ['Entex - Adventure Vision', path.join('Assets', 'avision', 'common', 'game.rom')],
      // Unique extensions defined
      ['Atari - 2600', path.join('Assets', '2600', 'common', 'game.rom')],
      ['Nintendo - Game Boy', path.join('Assets', 'gb', 'common', 'game.rom')],
      ['Nintendo - Game Boy Advance', path.join('Assets', 'gba', 'common', 'game.rom')],
      ['Nintendo - Game Boy Color', path.join('Assets', 'gbc', 'common', 'game.rom')],
    ])('should replace {pocket} for known DAT name: %s', (datName, expectedPath) => {
      expect(new Options({ commands: ['copy'], output: 'Assets/{pocket}/common' }).getOutputFileParsed(
        new DAT(new Header({ name: datName }), []),
        dummyInputRomPath,
        dummyGame,
        dummyRelease,
        'game.rom',
      )).toEqual(expectedPath);
    });

    test.each([
      ['game.a78', path.join('games', 'Atari7800', 'game.a78')],
      ['game.gb', path.join('games', 'Gameboy', 'game.gb')],
      ['game.nes', path.join('games', 'NES', 'game.nes')],
    ])('should replace {mister} for known extension: %s', (outputRomFilename, expectedPath) => {
      expect(new Options({ commands: ['copy'], output: 'games/{mister}' }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, outputRomFilename)).toEqual(expectedPath);
    });

    test.each([
      'game.bin',
      'game.ngc',
      'game.ngp',
      'game.rom',
    ])('should throw on {mister} for unknown extension: %s', (outputRomFilename) => {
      expect(() => new Options({ commands: ['copy'], output: 'games/{mister}' }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, outputRomFilename)).toThrow(/failed to replace/);
    });

    test.each([
      ['game.a78', path.join('Roms', 'SEVENTYEIGHTHUNDRED', 'game.a78')],
      ['game.gb', path.join('Roms', 'GB', 'game.gb')],
      ['game.nes', path.join('Roms', 'FC', 'game.nes')],
    ])('should replace {onion} for known extension: %s', (outputRomFilename, expectedPath) => {
      expect(new Options({ commands: ['copy'], output: 'Roms/{onion}' }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, outputRomFilename)).toEqual(expectedPath);
    });

    test.each([
      'game.arduboy',
      'game.bin',
      'game.rom',
    ])('should throw on {onion} for unknown extension: %s', (outputRomFilename) => {
      expect(() => new Options({ commands: ['copy'], output: 'Roms/{onion}' }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, outputRomFilename)).toThrow(/failed to replace/);
    });
  });

  it('should respect "--dir-mirror"', () => {
    const game = new Game();
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutputFileParsed(dummyDat, dummyInputRomPath, game, dummyRelease, dummyRomFilename)).toEqual(os.devNull);
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutputFileParsed(dummyDat, dummyInputRomPath, game, dummyRelease, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutputFileParsed(dummyDat, 'file.rom', game, dummyRelease, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutputFileParsed(dummyDat, 'roms/file.rom', game, dummyRelease, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: true }).getOutputFileParsed(dummyDat, 'roms/subdir/file.rom', game, dummyRelease, 'file.rom')).toEqual(path.join(os.devNull, 'subdir', 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirMirror: false }).getOutputFileParsed(dummyDat, 'roms/subdir/file.rom', game, dummyRelease, 'file.rom')).toEqual(path.join(os.devNull, 'file.rom'));
  });

  it('should respect "--dir-dat-name"', () => {
    const dat = new DAT(new Header({ name: 'name', description: 'description' }), []);
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatName: true }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, dummyRomFilename)).toEqual(os.devNull);
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatName: true }).getOutputFileParsed(dat, dummyInputRomPath, dummyGame, dummyRelease, dummyRomFilename)).toEqual(path.join(os.devNull, 'name'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatName: false }).getOutputFileParsed(dat, dummyInputRomPath, dummyGame, dummyRelease, dummyRomFilename)).toEqual(os.devNull);
  });

  it('should respect "--dir-dat-description"', () => {
    const dat = new DAT(new Header({ name: 'name', description: 'description' }), []);
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatDescription: true }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, dummyRomFilename)).toEqual(os.devNull);
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatDescription: true }).getOutputFileParsed(dat, dummyInputRomPath, dummyGame, dummyRelease, dummyRomFilename)).toEqual(path.join(os.devNull, 'description'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirDatDescription: false }).getOutputFileParsed(dat, dummyInputRomPath, dummyGame, dummyRelease, dummyRomFilename)).toEqual(os.devNull);
  });

  it('should respect "--dir-letter"', () => {
    expect(new Options({ commands: ['copy'], output: os.devNull, dirLetter: true }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, dummyRomFilename)).toEqual(os.devNull);
    expect(new Options({ commands: ['copy'], output: os.devNull, dirLetter: true }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, 'file.rom')).toEqual(path.join(os.devNull, 'F', 'file.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirLetter: true }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, '🙂.rom')).toEqual(path.join(os.devNull, '#', '🙂.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull, dirLetter: false }).getOutputFileParsed(dummyDat, dummyInputRomPath, dummyGame, dummyRelease, '🙂.rom')).toEqual(path.join(os.devNull, '🙂.rom'));
  });

  it('should respect game name', () => {
    expect(new Options({ commands: ['copy'], output: os.devNull }).getOutputFileParsed(dummyDat, dummyInputRomPath, new Game({
      name: 'game',
    }), undefined, 'one.rom')).toEqual(path.join(os.devNull, 'one.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull }).getOutputFileParsed(dummyDat, dummyInputRomPath, new Game({
      name: 'game',
      rom: new ROM('one.rom', 0, '00000000'),
    }), undefined, 'one.rom')).toEqual(path.join(os.devNull, 'one.rom'));
    expect(new Options({ commands: ['copy'], output: os.devNull }).getOutputFileParsed(dummyDat, dummyInputRomPath, new Game({
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
