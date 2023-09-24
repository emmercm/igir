import os from 'node:os';
import path from 'node:path';

import Constants from '../src/constants.js';
import Game from '../src/types/dats/game.js';
import Header from '../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../src/types/dats/logiqx/logiqxDat.js';
import Release from '../src/types/dats/release.js';
import ROM from '../src/types/dats/rom.js';
import Options from '../src/types/options.js';
import OutputFactory from '../src/types/outputFactory.js';

const dummyDat = new LogiqxDAT(new Header(), []);
const dummyGame = new Game({ name: 'Dummy Game' });
const dummyRelease = undefined;
const dummyRom = new ROM({ name: 'Dummy.rom', size: 0, crc: '00000000' });

test.each([
  'test',
  'report',
  'zip',
  'clean',
])('should use temp dir for non-writing commands: %s', async (command) => {
  const options = new Options({ commands: [command] });

  const outputPath = OutputFactory.getPath(
    options,
    dummyDat,
    dummyGame,
    dummyRelease,
    dummyRom,
    await dummyRom.toFile(),
  );
  expect(outputPath.dir).toEqual(Constants.GLOBAL_TEMP_DIR);
});

test.each([
  'copy',
  'move',
])('should echo the option with no arguments: %s', async (command) => {
  const options = new Options({ commands: [command], output: os.devNull });

  const outputPath = OutputFactory.getPath(
    options,
    dummyDat,
    dummyGame,
    dummyRelease,
    dummyRom,
    await dummyRom.toFile(),
  );
  expect(outputPath).toEqual({
    root: '',
    dir: os.devNull,
    base: '',
    name: 'Dummy',
    ext: '.rom',
    entryPath: 'Dummy.rom',
  });
});

describe('token replacement', () => {
  test.each([
    ['foo/{datName}/bar', path.join('foo', 'DAT _ Name', 'bar', 'Dummy.rom')],
    ['foo/{datDescription}/bar', path.join('foo', 'DAT _ Description', 'bar', 'Dummy.rom')],
    ['root/{datReleaseRegion}', path.join('root', 'USA', 'Dummy.rom')],
    ['root/{datReleaseLanguage}', path.join('root', 'En', 'Dummy.rom')],
  ])('should replace {dat*}: %s', async (output, expectedPath) => {
    const options = new Options({ commands: ['copy'], output });
    const dat = new LogiqxDAT(new Header({ name: 'DAT / Name', description: 'DAT \\ Description' }), []);
    const release = new Release('Game Name', 'USA', 'En');

    const outputPath = OutputFactory.getPath(
      options,
      dat,
      dummyGame,
      release,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
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
    ['Game (Debug)', 'Debug'],
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
  ])('should replace {gameType}: %s', async (gameName, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: '{gameType}' });
    const game = new Game({
      name: gameName,
      release: [
        new Release(gameName, 'USA'),
        new Release(gameName, 'EUR'),
        new Release(gameName, 'JPN'),
      ],
    });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      game,
      dummyRelease,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.dir).toEqual(expectedPath);
  });

  test.each([
    ['{inputDirname}', 'game.rom', 'game.rom'],
    ['{inputDirname}', 'roms/game.rom', path.join('roms', 'game.rom')],
    ['{inputDirname}', 'roms/subdir/game.rom', path.join('roms', 'subdir', 'game.rom')],
  ])('should replace {input*}: %s', async (output, filePath, expectedPath) => {
    const options = new Options({ commands: ['copy'], output });
    const rom = new ROM({ name: path.basename(filePath), size: 0, crc: '' });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      dummyGame,
      dummyRelease,
      rom,
      (await rom.toFile()).withFilePath(filePath),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    ['{outputBasename}', 'game.rom', path.join('game.rom', 'game.rom')],
    ['{outputBasename}', 'roms/subdir/game.rom', path.join('game.rom', 'game.rom')],
    ['{outputName}.{outputExt}', 'game.rom', path.join('game.rom', 'game.rom')],
    ['{outputName}.{outputExt}', 'roms/subdir/game.rom', path.join('game.rom', 'game.rom')],
  ])('should replace {output*}: %s', async (output, filePath, expectedPath) => {
    const options = new Options({ commands: ['copy'], output });
    const rom = new ROM({ name: path.basename(filePath), size: 0, crc: '' });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      dummyGame,
      dummyRelease,
      rom,
      (await rom.toFile()).withFilePath(filePath),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    ['game.a78', path.join('Assets', '7800', 'common', 'game.a78')],
    ['game.gb', path.join('Assets', 'gb', 'common', 'game.gb')],
    ['game.nes', path.join('Assets', 'nes', 'common', 'game.nes')],
    ['game.sv', path.join('Assets', 'supervision', 'common', 'game.sv')],
  ])('should replace {pocket} for known extension: %s', async (outputRomFilename, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: 'Assets/{pocket}/common' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc: '' });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      dummyGame,
      dummyRelease,
      rom,
      await rom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    'game.bin',
    'game.ngp',
    'game.rom',
  ])('should throw on {pocket} for unknown extension: %s', async (outputRomFilename) => {
    const options = new Options({ commands: ['copy'], output: 'Assets/{pocket}/common' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc: '' });

    await expect(async () => OutputFactory.getPath(options, dummyDat, dummyGame, dummyRelease, rom, await rom.toFile())).rejects.toThrow(/failed to replace/);
  });

  test.each([
    // No unique extensions defined
    ['Bit Corporation - Gamate', path.join('Assets', 'gamate', 'common', 'Dummy.rom')],
    ['Emerson - Arcadia', path.join('Assets', 'arcadia', 'common', 'Dummy.rom')],
    ['Entex - Adventure Vision', path.join('Assets', 'avision', 'common', 'Dummy.rom')],
    // Unique extensions defined
    ['Atari - 2600', path.join('Assets', '2600', 'common', 'Dummy.rom')],
    ['Nintendo - Game Boy', path.join('Assets', 'gb', 'common', 'Dummy.rom')],
    ['Nintendo - Game Boy Advance', path.join('Assets', 'gba', 'common', 'Dummy.rom')],
    ['Nintendo - Game Boy Color', path.join('Assets', 'gbc', 'common', 'Dummy.rom')],
  ])('should replace {pocket} for known DAT name: %s', async (datName, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: 'Assets/{pocket}/common' });

    const outputPath = OutputFactory.getPath(
      options,
      new LogiqxDAT(new Header({ name: datName }), []),
      dummyGame,
      dummyRelease,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    ['game.a78', path.join('games', 'Atari7800', 'game.a78')],
    ['game.gb', path.join('games', 'Gameboy', 'game.gb')],
    ['game.nes', path.join('games', 'NES', 'game.nes')],
  ])('should replace {mister} for known extension: %s', async (outputRomFilename, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: 'games/{mister}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc: '' });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      dummyGame,
      dummyRelease,
      rom,
      await rom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    'game.bin',
    'game.ngc',
    'game.ngp',
    'game.rom',
  ])('should throw on {mister} for unknown extension: %s', async (outputRomFilename) => {
    const options = new Options({ commands: ['copy'], output: 'games/{mister}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc: '' });

    await expect(async () => OutputFactory.getPath(options, dummyDat, dummyGame, dummyRelease, rom, await rom.toFile())).rejects.toThrow(/failed to replace/);
  });

  test.each([
    ['game.a78', path.join('Roms', 'SEVENTYEIGHTHUNDRED', 'game.a78')],
    ['game.gb', path.join('Roms', 'GB', 'game.gb')],
    ['game.nes', path.join('Roms', 'FC', 'game.nes')],
  ])('should replace {onion} for known extension: %s', async (outputRomFilename, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: 'Roms/{onion}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc: '' });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      dummyGame,
      dummyRelease,
      rom,
      await rom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    'game.arduboy',
    'game.bin',
    'game.rom',
  ])('should throw on {onion} for unknown extension: %s', async (outputRomFilename) => {
    const options = new Options({ commands: ['copy'], output: 'Roms/{onion}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc: '' });

    await expect(async () => OutputFactory.getPath(options, dummyDat, dummyGame, dummyRelease, rom, await rom.toFile())).rejects.toThrow(/failed to replace/);
  });

  test.each([
    ['game.a78', path.join('roms', 'atari7800', 'game.a78')],
    ['game.gb', path.join('roms', 'gb', 'game.gb')],
    ['game.nes', path.join('roms', 'nes', 'game.nes')],
  ])(
    'should replace {batocera} for known extension: %s',
    async (outputRomFilename, expectedPath) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{batocera}' });
      const rom = new ROM({ name: outputRomFilename, size: 0, crc: '' });

      const outputPath = OutputFactory.getPath(
        options,
        dummyDat,
        dummyGame,
        dummyRelease,
        rom,
        await rom.toFile(),
      );
      expect(outputPath.format()).toEqual(expectedPath);
    },
  );

  test.each(['game.bin', 'game.rom'])(
    'should throw on {batocera} for unknown extension: %s',
    async (outputRomFilename) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{batocera}' });

      const rom = new ROM({ name: outputRomFilename, size: 0, crc: '' });

      await expect(async () => OutputFactory.getPath(
        options,
        dummyDat,
        dummyGame,
        dummyRelease,
        rom,
        await rom.toFile(),
      )).rejects.toThrow(/failed to replace/);
    },
  );
});

describe('should respect "--dir-mirror"', () => {
  test.each([
    ['', os.devNull],
    ['file.rom', path.join(os.devNull, 'file.rom')],
    ['roms/file.rom', path.join(os.devNull, 'file.rom')],
    ['roms/subdir/file.rom', path.join(os.devNull, 'subdir', 'file.rom')],
  ])('option is true: %s', async (filePath, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: os.devNull, dirMirror: true });
    const rom = new ROM({ name: path.basename(filePath), size: 0, crc: '' });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      dummyGame,
      dummyRelease,
      rom,
      (await rom.toFile()).withFilePath(filePath),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    ['roms/subdir/file.rom', path.join(os.devNull, 'file.rom')],
  ])('option is false: %s', async (filePath, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: os.devNull, dirMirror: false });
    const rom = new ROM({ name: path.basename(filePath), size: 0, crc: '' });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      dummyGame,
      dummyRelease,
      rom,
      (await rom.toFile()).withFilePath(filePath),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });
});

describe('should respect "--dir-dat-name"', () => {
  test.each([
    [undefined, path.join(os.devNull, 'Dummy.rom')],
    ['name', path.join(os.devNull, 'name', 'Dummy.rom')],
  ])('option is true: %s', async (datName, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: os.devNull, dirDatName: true });
    const dat = new LogiqxDAT(new Header({ name: datName, description: 'description' }), []);

    const outputPath = OutputFactory.getPath(
      options,
      dat,
      dummyGame,
      dummyRelease,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    ['name', path.join(os.devNull, 'Dummy.rom')],
  ])('option is false: %s', async (datName, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: os.devNull, dirDatName: false });
    const dat = new LogiqxDAT(new Header({ name: datName, description: 'description' }), []);

    const outputPath = OutputFactory.getPath(
      options,
      dat,
      dummyGame,
      dummyRelease,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });
});

describe('should respect "--dir-dat-description"', () => {
  test.each([
    [undefined, path.join(os.devNull, 'Dummy.rom')],
    ['description', path.join(os.devNull, 'description', 'Dummy.rom')],
  ])('option is true: %s', async (datDescription, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: os.devNull, dirDatDescription: true });
    const dat = new LogiqxDAT(new Header({ name: 'name', description: datDescription }), []);

    const outputPath = OutputFactory.getPath(
      options,
      dat,
      dummyGame,
      dummyRelease,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    ['description', path.join(os.devNull, 'Dummy.rom')],
  ])('option is false: %s', async (datDescription, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: os.devNull, dirDatDescription: false });
    const dat = new LogiqxDAT(new Header({ name: 'name', description: datDescription }), []);

    const outputPath = OutputFactory.getPath(
      options,
      dat,
      dummyGame,
      dummyRelease,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });
});

describe('should respect "--dir-letter"', () => {
  describe('games with one ROM', () => {
    test.each([
      ['', os.devNull],
      ['file.rom', path.join(os.devNull, 'F', 'file.rom')],
      ['🙂.rom', path.join(os.devNull, '#', '🙂.rom')],
    ])('option is true: %s', async (romName, expectedPath) => {
      const options = new Options({ commands: ['copy'], output: os.devNull, dirLetter: true });
      const rom = new ROM({ name: romName, size: 0, crc: '' });

      const outputPath = OutputFactory.getPath(
        options,
        dummyDat,
        dummyGame,
        dummyRelease,
        rom,
        await rom.toFile(),
      );
      expect(outputPath.format()).toEqual(expectedPath);
    });

    test.each([
      ['🙂.rom', path.join(os.devNull, '🙂.rom')],
    ])('option is false: %s', async (romName, expectedPath) => {
      const options = new Options({ commands: ['copy'], output: os.devNull, dirLetter: false });
      const rom = new ROM({ name: romName, size: 0, crc: '' });

      const outputPath = OutputFactory.getPath(
        options,
        dummyDat,
        dummyGame,
        dummyRelease,
        rom,
        await rom.toFile(),
      );
      expect(outputPath.format()).toEqual(expectedPath);
    });
  });

  describe('game with multiple ROMs', () => {
    const game = new Game({
      name: 'Apidya (Unknown)',
      rom: [
        new ROM({ name: 'disk1\\apidya_disk1_00.0.raw', size: 265_730, crc: '555b1be8' }),
        new ROM({ name: 'disk1\\apidya_disk1_00.1.raw', size: 256_990, crc: '9ef64ba6' }),
      ],
    });

    it('should respect the game name', async () => {
      const options = new Options({ commands: ['copy'], output: os.devNull, dirLetter: true });

      const outputPaths = await Promise.all(game.getRoms().map(async (rom) => OutputFactory.getPath(
        options,
        dummyDat,
        game,
        dummyRelease,
        rom,
        await rom.toFile(),
      )));

      expect(
        outputPaths.every((outputPath) => outputPath.dir === path.join(options.getOutput(), 'A')),
      ).toEqual(true);
    });
  });
});

describe('should respect game name', () => {
  test.each([
    [
      new Game({
        name: 'game',
      }),
      path.join(os.devNull, 'Dummy.rom'),
    ],
    [
      new Game({
        name: 'game',
        rom: new ROM({ name: 'one.rom', size: 0, crc: '' }),
      }),
      path.join(os.devNull, 'Dummy.rom'),
    ],
    [
      new Game({
        name: 'game',
        rom: [
          new ROM({ name: 'one.rom', size: 0, crc: '' }),
          new ROM({ name: 'two.rom', size: 0, crc: '' }),
        ],
      }),
      path.join(os.devNull, 'game', 'Dummy.rom'),
    ],
  ])('%s', async (game, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: os.devNull });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      game,
      dummyRelease,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });
});
