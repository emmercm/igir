import os from 'node:os';
import path from 'node:path';

import Constants from '../src/constants.js';
import Game from '../src/types/dats/game.js';
import Header from '../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../src/types/dats/logiqx/logiqxDat.js';
import Release from '../src/types/dats/release.js';
import ROM from '../src/types/dats/rom.js';
import Options, { GameSubdirMode } from '../src/types/options.js';
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

describe('ROM names with directories', () => {
  const rom = new ROM({ name: 'subdir\\file.rom', size: 0, crc: '00000000' });
  const game = new Game({ name: 'Game', rom: [rom] });

  describe('command: zip', () => {
    const options = new Options({ commands: ['copy', 'zip'], output: os.devNull });

    test.each([
      [true, path.join('subdir', 'file.rom')],
      [false, 'subdir_file.rom'],
    ])('should respect romNamesContainDirectories: %s', async (romNamesContainDirectories, expectedEntryPath) => {
      const dat = new LogiqxDAT(new Header({ romNamesContainDirectories }), [game]);

      const outputPath = OutputFactory.getPath(
        options,
        dat,
        game,
        dummyRelease,
        rom,
        await rom.toFile(),
      );
      expect(outputPath).toEqual({
        root: '',
        dir: os.devNull,
        base: '',
        name: 'Game',
        ext: '.zip',
        entryPath: expectedEntryPath,
      });
    });
  });

  describe.each([
    [['copy']],
    [['copy', 'extract']],
  ])('commands: %s', (commands) => {
    const options = new Options({ commands, output: os.devNull });

    test.each([
      [true, path.join(os.devNull, 'subdir', 'file.rom')],
      [false, path.join(os.devNull, 'subdir_file.rom')],
    ])('should respect romNamesContainDirectories: %s', async (romNamesContainDirectories, expectedFormattedPath) => {
      const dat = new LogiqxDAT(new Header({ romNamesContainDirectories }), [game]);

      const outputPath = OutputFactory.getPath(
        options,
        dat,
        game,
        dummyRelease,
        rom,
        await rom.toFile(),
      );
      expect(outputPath.format()).toEqual(expectedFormattedPath);
    });
  });
});

describe('token replacement', () => {
  test.each([
    ['foo/{datName}/bar', path.join('foo', 'DAT _ Name', 'bar', 'Dummy.rom')],
    ['foo/{datDescription}/bar', path.join('foo', 'DAT _ Description', 'bar', 'Dummy.rom')],
    ['root/{datReleaseRegion}', path.join('root', 'USA', 'Dummy.rom')],
    ['root/{datReleaseLanguage}', path.join('root', 'EN', 'Dummy.rom')],
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
    ['root/{gameRegion}', 'Game (E)', [], path.join('root', 'EUR', 'Dummy.rom')],
    ['root/{gameRegion}', 'Game (Europe)', [], path.join('root', 'EUR', 'Dummy.rom')],
    ['root/{gameRegion}', 'Game', ['EUR'], path.join('root', 'EUR', 'Dummy.rom')],
    ['root/{gameRegion}', 'Game', ['EUR', 'JPN'], path.join('root', 'EUR', 'Dummy.rom')],
    ['root/{gameRegion}', 'Game', ['JPN'], path.join('root', 'JPN', 'Dummy.rom')],
    ['root/{gameRegion}', 'Game', ['JPN', 'EUR'], path.join('root', 'JPN', 'Dummy.rom')],
  ])('should replace {gameRegion}: %s', async (output, gameName, regions, expectedPath) => {
    const options = new Options({ commands: ['copy'], output });
    const dat = new LogiqxDAT(new Header(), []);
    const game = new Game({
      name: gameName,
      release: regions.map((region) => new Release(gameName, region)),
    });

    const outputPath = OutputFactory.getPath(
      options,
      dat,
      game,
      game.getReleases().find(() => true),
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    ['root/{gameLanguage}', 'Game (E)', [], path.join('root', 'EN', 'Dummy.rom')],
    ['root/{gameLanguage}', 'Game (Europe)', [], path.join('root', 'EN', 'Dummy.rom')],
    ['root/{gameLanguage}', 'Game', ['EUR'], path.join('root', 'EN', 'Dummy.rom')],
    ['root/{gameLanguage}', 'Game', ['EUR', 'JPN'], path.join('root', 'EN', 'Dummy.rom')],
    ['root/{gameLanguage}', 'Game', ['JPN'], path.join('root', 'JA', 'Dummy.rom')],
    ['root/{gameLanguage}', 'Game', ['JPN', 'EUR'], path.join('root', 'JA', 'Dummy.rom')],
  ])('should replace {gameLanguage}: %s', async (output, gameName, regions, expectedPath) => {
    const options = new Options({ commands: ['copy'], output });
    const dat = new LogiqxDAT(new Header(), []);
    const game = new Game({
      name: gameName,
      release: regions.map((region) => new Release(gameName, region)),
    });

    const outputPath = OutputFactory.getPath(
      options,
      dat,
      game,
      game.getReleases().find(() => true),
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

  test.each([
    ['game.a78', path.join('roms', 'atari7800', 'game.a78')],
    ['game.gb', path.join('roms', 'gb', 'game.gb')],
    ['game.nes', path.join('roms', 'nes', 'game.nes')],
  ])(
    'should replace {jelos} for known extension: %s',
    async (outputRomFilename, expectedPath) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{jelos}' });
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
    'should throw on {jelos} for unknown extension: %s',
    async (outputRomFilename) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{jelos}' });

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

  test.each([
    ['game.lnx', path.join('', 'Atari lynx', 'game.lnx')],
    ['game.ws', path.join('', 'WonderSwan', 'game.ws')],
    ['game.wsc', path.join('', 'WonderSwan', 'game.wsc')],
    ['game.pce', path.join('', 'PCE-TurboGrafx', 'game.pce')],
    ['game.fds', path.join('', 'NES', 'game.fds')],
    ['game.gb', path.join('', 'Game Boy', 'game.gb')],
    ['game.gba', path.join('', 'Game Boy Advance', 'game.gba')],
    ['game.gbc', path.join('', 'Game Boy Color', 'game.gbc')],
    ['game.nes', path.join('', 'NES', 'game.nes')],
    ['game.nez', path.join('', 'NES', 'game.nez')],
    ['game.min', path.join('', 'Pokemini', 'game.min')],
    ['game.sfc', path.join('', 'SNES', 'game.sfc')],
    ['game.smc', path.join('', 'SNES', 'game.smc')],
    ['game.vb', path.join('', 'Virtualboy', 'game.vb')],
    ['game.gg', path.join('', 'Game Gear', 'game.gg')],
    ['game.sms', path.join('', 'Sega Master System', 'game.sms')],
    ['game.gen', path.join('', 'Sega Genesis', 'game.gen')],
    ['game.md', path.join('', 'Sega Genesis', 'game.md')],
    ['game.mdx', path.join('', 'Sega Genesis', 'game.mdx')],
    ['game.sgd', path.join('', 'Sega Genesis', 'game.sgd')],
    ['game.smd', path.join('', 'Sega Genesis', 'game.smd')],
    ['game.ngp', path.join('', 'Neo Geo Pocket', 'game.ngp')],
    ['game.ngc', path.join('', 'Neo Geo Pocket', 'game.ngc')],
  ])(
    'should replace {funkeyos} for known extension: %s',
    async (outputRomFilename, expectedPath) => {
      const options = new Options({ commands: ['copy'], output: '{funkeyos}' });
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

  test.each([
    'game.bin',
    'game.rom',
    // satellaview is not supported by https://github.com/FunKey-Project/FunKey-OS/blob/master/FunKey/board/funkey/rootfs-overlay/usr/games/collections/SNES/settings.conf
    'game.bs',
  ])(
    'should throw on {funkeyos} for unknown extension: %s',
    async (outputRomFilename) => {
      const options = new Options({ commands: ['copy'], output: '{funkeyos}' });

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

  test.each([
    ['game.a26', path.join('roms', 'a26', 'game.a26')],
    ['game.a52', path.join('roms', 'a52', 'game.a52')],
    ['game.a78', path.join('roms', 'a78', 'game.a78')],
    ['game.ws', path.join('roms', 'ws', 'game.ws')],
    ['game.wsc', path.join('roms', 'ws', 'game.wsc')],
    ['game.col', path.join('roms', 'col', 'game.col')],
    ['game.pce', path.join('roms', 'tg16', 'game.pce')],
    ['game.gb', path.join('roms', 'gb', 'game.gb')],
    ['game.sgb', path.join('roms', 'gb', 'game.sgb')],
    ['game.gbc', path.join('roms', 'gb', 'game.gbc')],
    ['game.gba', path.join('roms', 'gba', 'game.gba')],
    ['game.srl', path.join('roms', 'gba', 'game.srl')],
    ['game.nds', path.join('roms', 'nds', 'game.nds')],
    ['game.nes', path.join('roms', 'nes', 'game.nes')],
    ['game.sfc', path.join('roms', 'snes', 'game.sfc')],
    ['game.smc', path.join('roms', 'snes', 'game.smc')],
    ['game.gg', path.join('roms', 'gg', 'game.gg')],
    ['game.sms', path.join('roms', 'sms', 'game.sms')],
    ['game.gen', path.join('roms', 'gen', 'game.gen')],
    ['game.md', path.join('roms', 'gen', 'game.md')],
    ['game.smd', path.join('roms', 'gen', 'game.smd')],
    ['game.sc', path.join('roms', 'sg', 'game.sc')],
    ['game.sg', path.join('roms', 'sg', 'game.sg')],
    ['game.ngp', path.join('roms', 'ngp', 'game.ngp')],
    ['game.ngc', path.join('roms', 'ngp', 'game.ngc')],

  ])(
    'should replace {twmenu} for known extension: %s',
    async (outputRomFilename, expectedPath) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{twmenu}' });
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

  test.each([
    'game.bin',
    'game.rom',
    // satellaview is not supported by https://github.com/DS-Homebrew/TWiLightMenu/tree/master/7zfile/roms/snes
    'game.bs',
  ])(
    'should throw on {funkeyos} for unknown extension: %s',
    async (outputRomFilename) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{twmenu}' });

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
      const options = new Options({
        commands: ['copy'],
        output: os.devNull,
        dirLetter: true,
        dirGameSubdir: GameSubdirMode[GameSubdirMode.MULTIPLE].toLowerCase(),
      });

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

describe('should respect "--dir-game-subdir"', () => {
  test.each([
    new Game({
      name: 'game',
    }),
    new Game({
      name: 'game',
      rom: new ROM({ name: 'one.rom', size: 0, crc: '' }),
    }),
    new Game({
      name: 'game',
      rom: [
        new ROM({ name: 'one.rom', size: 0, crc: '' }),
        new ROM({ name: 'two.rom', size: 0, crc: '' }),
      ],
    }),
  ])('"never": %s', async (game) => {
    const options = new Options({
      commands: ['copy'],
      output: os.devNull,
      dirGameSubdir: GameSubdirMode[GameSubdirMode.NEVER].toLowerCase(),
    });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      game,
      dummyRelease,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(path.join(os.devNull, 'Dummy.rom'));
  });

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
  ])('"multiple": %s', async (game, expectedPath) => {
    const options = new Options({
      commands: ['copy'],
      output: os.devNull,
      dirGameSubdir: GameSubdirMode[GameSubdirMode.MULTIPLE].toLowerCase(),
    });

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

  test.each([
    new Game({
      name: 'game',
    }),
    new Game({
      name: 'game',
      rom: new ROM({ name: 'one.rom', size: 0, crc: '' }),
    }),
    new Game({
      name: 'game',
      rom: [
        new ROM({ name: 'one.rom', size: 0, crc: '' }),
        new ROM({ name: 'two.rom', size: 0, crc: '' }),
      ],
    }),
  ])('"always": %s', async (game) => {
    const options = new Options({
      commands: ['copy'],
      output: os.devNull,
      dirGameSubdir: GameSubdirMode[GameSubdirMode.ALWAYS].toLowerCase(),
    });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      game,
      dummyRelease,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(path.join(os.devNull, 'game', 'Dummy.rom'));
  });
});
