import os from 'node:os';
import path from 'node:path';

import { Ajv } from 'ajv';

import outputTokensData from '../../src/types/consoleTokens.json' with { type: 'json' };
import outputTokensSchema from '../../src/types/consoleTokens.schema.json' with { type: 'json' };
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import Release from '../../src/types/dats/release.js';
import ROM from '../../src/types/dats/rom.js';
import SingleValueGame from '../../src/types/dats/singleValueGame.js';
import Options, { GameSubdirMode, GameSubdirModeInverted } from '../../src/types/options.js';
import OutputFactory from '../../src/types/outputFactory.js';

const dummyDat = new LogiqxDAT({ header: new Header() });
const dummyGame = new SingleValueGame({ name: 'Dummy Game' });
const dummyRom = new ROM({ name: 'Dummy.rom', size: 0, crc32: '00000000' });

test.each(['test', 'report', 'zip', 'clean'])(
  'should equal input file for non-writing commands: %s',
  async (command) => {
    const options = new Options({ commands: [command] });

    const dummyFile = await dummyRom.toFile();
    const outputPath = OutputFactory.getPath(options, dummyDat, dummyGame, dummyRom, dummyFile);
    expect(outputPath.format()).toEqual(dummyFile.getFilePath());
  },
);

test.each(['copy', 'move'])('should echo the option with no arguments: %s', async (command) => {
  const options = new Options({ commands: [command], output: os.devNull });

  const outputPath = OutputFactory.getPath(
    options,
    dummyDat,
    dummyGame,
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
    ['foo/{datName}/bar', path.resolve('foo', 'DAT _ Name', 'bar', 'Dummy.rom')],
    ['foo/{datDescription}/bar', path.resolve('foo', 'DAT _ Description', 'bar', 'Dummy.rom')],
  ])('should replace {dat*}: %s', async (output, expectedPath) => {
    const options = new Options({ commands: ['copy'], output });
    const dat = new LogiqxDAT({
      header: new Header({ name: 'DAT / Name', description: 'DAT \\ Description' }),
    });

    const outputPath = OutputFactory.getPath(
      options,
      dat,
      dummyGame,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    ['root/{region}', 'USA', path.resolve('root', 'USA', 'Dummy.rom')],
    ['root/{region}', 'WORLD', path.resolve('root', 'WORLD', 'Dummy.rom')],
    ['root/{region}', 'EUR', path.resolve('root', 'EUR', 'Dummy.rom')],
  ])('should replace {region}: %s', async (output, region, expectedPath) => {
    const options = new Options({ commands: ['copy'], output });
    const dat = new LogiqxDAT({ header: new Header() });
    const game = new SingleValueGame({
      region,
    });

    const outputPath = OutputFactory.getPath(options, dat, game, dummyRom, await dummyRom.toFile());
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    ['root/{language}', 'EN', path.resolve('root', 'EN', 'Dummy.rom')],
    ['root/{language}', 'JP', path.resolve('root', 'JP', 'Dummy.rom')],
  ])('should replace {language}: %s', async (output, language, expectedPath) => {
    const options = new Options({ commands: ['copy'], output });
    const dat = new LogiqxDAT({ header: new Header() });
    const game = new SingleValueGame({
      language,
    });

    const outputPath = OutputFactory.getPath(options, dat, game, dummyRom, await dummyRom.toFile());
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    ['root/{genre}', 'Platform', path.resolve('root', 'Platform', 'Dummy.rom')],
    ['root/{genre}', 'Sports', path.resolve('root', 'Sports', 'Dummy.rom')],
  ])('should replace {genre}: %s', async (output, genre, expectedPath) => {
    const options = new Options({ commands: ['copy'], output });
    const dat = new LogiqxDAT({ header: new Header() });
    const game = new SingleValueGame({
      genre,
    });

    const outputPath = OutputFactory.getPath(options, dat, game, dummyRom, await dummyRom.toFile());
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    ['root/{category}', 'Applications', path.resolve('root', 'Applications', 'Dummy.rom')],
    ['root/{category}', 'Games', path.resolve('root', 'Games', 'Dummy.rom')],
    ['root/{category}', 'Multimedia', path.resolve('root', 'Multimedia', 'Dummy.rom')],
  ])('should replace {category}: %s', async (output, category, expectedPath) => {
    const options = new Options({ commands: ['copy'], output });
    const dat = new LogiqxDAT({ header: new Header() });
    const game = new SingleValueGame({
      category,
    });

    const outputPath = OutputFactory.getPath(options, dat, game, dummyRom, await dummyRom.toFile());
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
    ['Game (Program)', 'Program'],
    ['Game [t]', 'Trained'],
    ['Game [T+Eng]', 'Translated'],
    ['Game (Unl)', 'Unlicensed'],
    // Default
    ['Game', 'Retail'],
  ])('should replace {type}: %s', async (gameName, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: '{type}' });
    const game = new SingleValueGame({
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
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.dir).toEqual(path.resolve(expectedPath));
  });

  test.each([
    ['{inputDirname}', 'game.rom', path.resolve('game.rom')],
    ['{inputDirname}', 'roms/game.rom', path.resolve('roms', 'game.rom')],
    ['{inputDirname}', 'roms/subdir/game.rom', path.resolve('roms', 'subdir', 'game.rom')],
  ])('should replace {input*}: %s', async (output, filePath, expectedPath) => {
    const options = new Options({ commands: ['copy'], output });
    const rom = new ROM({ name: path.basename(filePath), size: 0, crc32: '' });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      dummyGame,
      rom,
      (await rom.toFile()).withFilePath(filePath),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    ['{outputBasename}', 'game.rom', path.resolve('game.rom', 'game.rom')],
    ['{outputBasename}', 'roms/subdir/game.rom', path.resolve('game.rom', 'game.rom')],
    ['{outputName}.{outputExt}', 'game.rom', path.resolve('game.rom', 'game.rom')],
    ['{outputName}.{outputExt}', 'roms/subdir/game.rom', path.resolve('game.rom', 'game.rom')],
  ])('should replace {output*}: %s', async (output, filePath, expectedPath) => {
    const options = new Options({ commands: ['copy'], output });
    const rom = new ROM({ name: path.basename(filePath), size: 0, crc32: '' });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      dummyGame,
      rom,
      (await rom.toFile()).withFilePath(filePath),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  // Output Token {adam}
  test.each([
    ['game.a78', path.resolve('ROMS', 'A7800', 'game.a78')],
    ['game.gb', path.resolve('ROMS', 'GB', 'game.gb')],
    ['game.nes', path.resolve('ROMS', 'FC', 'game.nes')],
  ])('should replace {adam} for known extension: %s', async (outputRomFilename, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: 'ROMS/{adam}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

    const outputPath = OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile());
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each(['game.n64', 'game.bs', 'game.bin', 'game.rom'])(
    'should throw on {adam} for unknown extension: %s',
    async (outputRomFilename) => {
      const options = new Options({ commands: ['copy'], output: 'games/{adam}' });
      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      await expect(
        (async (): Promise<unknown> =>
          OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile()))(),
      ).rejects.toThrow(/failed to replace/);
    },
  );

  // Output Token {batocera}
  test.each([
    ['game.a78', path.resolve('roms', 'atari7800', 'game.a78')],
    ['game.gb', path.resolve('roms', 'gb', 'game.gb')],
    ['game.nes', path.resolve('roms', 'nes', 'game.nes')],
  ])(
    'should replace {batocera} for known extension: %s',
    async (outputRomFilename, expectedPath) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{batocera}' });
      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      const outputPath = OutputFactory.getPath(
        options,
        dummyDat,
        dummyGame,
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

      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      await expect(
        (async (): Promise<unknown> =>
          OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile()))(),
      ).rejects.toThrow(/failed to replace/);
    },
  );

  // Output Token {es}
  test.each([
    ['game.a78', path.resolve('roms', 'atari7800', 'game.a78')],
    ['game.gb', path.resolve('roms', 'gb', 'game.gb')],
    ['game.nes', path.resolve('roms', 'nes', 'game.nes')],
  ])('should replace {es} for known extension: %s', async (outputRomFilename, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: 'roms/{es}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

    const outputPath = OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile());
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each(['game.bin', 'game.rom'])(
    'should throw on {es} for unknown extension: %s',
    async (outputRomFilename) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{es}' });

      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      await expect(
        (async (): Promise<unknown> =>
          OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile()))(),
      ).rejects.toThrow(/failed to replace/);
    },
  );

  // Output Token {funkeyos}
  test.each([
    ['game.lnx', path.resolve('', 'Atari lynx', 'game.lnx')],
    ['game.ws', path.resolve('', 'WonderSwan', 'game.ws')],
    ['game.wsc', path.resolve('', 'WonderSwan', 'game.wsc')],
    ['game.pce', path.resolve('', 'PCE-TurboGrafx', 'game.pce')],
    ['game.fds', path.resolve('', 'NES', 'game.fds')],
    ['game.gb', path.resolve('', 'Game Boy', 'game.gb')],
    ['game.gba', path.resolve('', 'Game Boy Advance', 'game.gba')],
    ['game.gbc', path.resolve('', 'Game Boy Color', 'game.gbc')],
    ['game.nes', path.resolve('', 'NES', 'game.nes')],
    ['game.nez', path.resolve('', 'NES', 'game.nez')],
    ['game.min', path.resolve('', 'Pokemini', 'game.min')],
    ['game.sfc', path.resolve('', 'SNES', 'game.sfc')],
    ['game.smc', path.resolve('', 'SNES', 'game.smc')],
    ['game.vb', path.resolve('', 'Virtualboy', 'game.vb')],
    ['game.gg', path.resolve('', 'Game Gear', 'game.gg')],
    ['game.sms', path.resolve('', 'Sega Master System', 'game.sms')],
    ['game.gen', path.resolve('', 'Sega Genesis', 'game.gen')],
    ['game.md', path.resolve('', 'Sega Genesis', 'game.md')],
    ['game.mdx', path.resolve('', 'Sega Genesis', 'game.mdx')],
    ['game.sgd', path.resolve('', 'Sega Genesis', 'game.sgd')],
    ['game.smd', path.resolve('', 'Sega Genesis', 'game.smd')],
    ['game.ngp', path.resolve('', 'Neo Geo Pocket', 'game.ngp')],
    ['game.ngc', path.resolve('', 'Neo Geo Pocket', 'game.ngc')],
  ])(
    'should replace {funkeyos} for known extension: %s',
    async (outputRomFilename, expectedPath) => {
      const options = new Options({ commands: ['copy'], output: '{funkeyos}' });
      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      const outputPath = OutputFactory.getPath(
        options,
        dummyDat,
        dummyGame,
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
  ])('should throw on {funkeyos} for unknown extension: %s', async (outputRomFilename) => {
    const options = new Options({ commands: ['copy'], output: '{funkeyos}' });

    const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

    await expect(
      (async (): Promise<unknown> =>
        OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile()))(),
    ).rejects.toThrow(/failed to replace/);
  });

  // Output Token {jelos}
  test.each([
    ['game.a78', path.resolve('roms', 'atari7800', 'game.a78')],
    ['game.gb', path.resolve('roms', 'gb', 'game.gb')],
    ['game.nes', path.resolve('roms', 'nes', 'game.nes')],
  ])('should replace {jelos} for known extension: %s', async (outputRomFilename, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: 'roms/{jelos}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

    const outputPath = OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile());
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each(['game.bin', 'game.rom'])(
    'should throw on {jelos} for unknown extension: %s',
    async (outputRomFilename) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{jelos}' });

      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      await expect(
        (async (): Promise<unknown> =>
          OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile()))(),
      ).rejects.toThrow(/failed to replace/);
    },
  );

  // Output Token {minui}
  test.each([
    ['game.pce', path.resolve('Roms', 'TurboGrafx-16 (PCE)', 'game.pce')],
    ['game.fds', path.resolve('Roms', 'Famicom Disk System (FC)', 'game.fds')],
    ['game.gb', path.resolve('Roms', 'Game Boy (GB)', 'game.gb')],
    ['game.sgb', path.resolve('Roms', 'Game Boy (GB)', 'game.sgb')],
    ['game.gba', path.resolve('Roms', 'Game Boy Advance (GBA)', 'game.gba')],
    ['game.gbc', path.resolve('Roms', 'Game Boy Color (GBC)', 'game.gbc')],
    ['game.nes', path.resolve('Roms', 'Nintendo Entertainment System (FC)', 'game.nes')],
    ['game.nez', path.resolve('Roms', 'Nintendo Entertainment System (FC)', 'game.nez')],
    ['game.min', path.resolve('Roms', 'Pokemon mini (PKM)', 'game.min')],
    ['game.sfc', path.resolve('Roms', 'Super Nintendo Entertainment System (SFC)', 'game.sfc')],
    ['game.smc', path.resolve('Roms', 'Super Nintendo Entertainment System (SFC)', 'game.smc')],
    ['game.vb', path.resolve('Roms', 'Virtual Boy (VB)', 'game.vb')],
    ['game.vboy', path.resolve('Roms', 'Virtual Boy (VB)', 'game.vboy')],
    ['game.32x', path.resolve('Roms', 'Sega 32X (MD)', 'game.32x')],
    ['game.gg', path.resolve('Roms', 'Sega Game Gear (GG)', 'game.gg')],
    ['game.sms', path.resolve('Roms', 'Sega Master System (SMS)', 'game.sms')],
    ['game.gen', path.resolve('Roms', 'Sega Genesis (MD)', 'game.gen')],
    ['game.md', path.resolve('Roms', 'Sega Genesis (MD)', 'game.md')],
    ['game.mdx', path.resolve('Roms', 'Sega Genesis (MD)', 'game.mdx')],
    ['game.sgd', path.resolve('Roms', 'Sega Genesis (MD)', 'game.sgd')],
    ['game.smd', path.resolve('Roms', 'Sega Genesis (MD)', 'game.smd')],
    ['game.ngp', path.resolve('Roms', 'Neo Geo Pocket (NGPC)', 'game.ngp')],
    ['game.ngc', path.resolve('Roms', 'Neo Geo Pocket Color (NGPC)', 'game.ngc')],
  ])('should replace {minui} for known extension: %s', async (outputRomFilename, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: 'Roms/{minui}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

    const outputPath = OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile());
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each(['game.bin', 'game.rom', 'game.mgw'])(
    'should throw on {minui} for unknown extension: %s',
    async (outputRomFilename) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{minui}' });
      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      await expect(
        (async (): Promise<unknown> =>
          OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile()))(),
      ).rejects.toThrow(/failed to replace/);
    },
  );

  // Output Token {mister}
  test.each([
    ['game.a78', path.resolve('games', 'Atari7800', 'game.a78')],
    ['game.gb', path.resolve('games', 'Gameboy', 'game.gb')],
    ['game.nes', path.resolve('games', 'NES', 'game.nes')],
  ])('should replace {mister} for known extension: %s', async (outputRomFilename, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: 'games/{mister}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

    const outputPath = OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile());
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each(['game.bin', 'game.ngc', 'game.ngp', 'game.rom'])(
    'should throw on {mister} for unknown extension: %s',
    async (outputRomFilename) => {
      const options = new Options({ commands: ['copy'], output: 'games/{mister}' });
      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      await expect(
        (async (): Promise<unknown> =>
          OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile()))(),
      ).rejects.toThrow(/failed to replace/);
    },
  );

  // Output Token {miyoocfw}
  test.each([
    ['game.a26', path.resolve('roms', '2600', 'game.a26')],
    ['game.lnx', path.resolve('roms', 'LYNX', 'game.lnx')],
    ['game.ws', path.resolve('roms', 'WSWAN', 'game.ws')],
    ['game.wsc', path.resolve('roms', 'WSWAN', 'game.wsc')], // TODO: check if this works
    ['game.vec', path.resolve('roms', 'VECTREX', 'game.vec')],
    ['game.pce', path.resolve('roms', 'PCE', 'game.pce')],
    ['game.gb', path.resolve('roms', 'GB', 'game.gb')],
    ['game.sgb', path.resolve('roms', 'GB', 'game.sgb')],
    ['game.gbc', path.resolve('roms', 'GB', 'game.gbc')],
    ['game.gba', path.resolve('roms', 'GBA', 'game.gba')],
    ['game.nes', path.resolve('roms', 'NES', 'game.nes')],
    ['game.fds', path.resolve('roms', 'NES', 'game.fds')],
    ['game.sfc', path.resolve('roms', 'SNES', 'game.sfc')],
    ['game.smc', path.resolve('roms', 'SNES', 'game.smc')],
    ['game.min', path.resolve('roms', 'POKEMINI', 'game.min')],
    ['game.gg', path.resolve('roms', 'SMS', 'game.gg')],
    ['game.sms', path.resolve('roms', 'SMS', 'game.sms')],
    ['game.gen', path.resolve('roms', 'SMD', 'game.gen')],
    ['game.md', path.resolve('roms', 'SMD', 'game.md')],
    ['game.smd', path.resolve('roms', 'SMD', 'game.smd')],
  ])(
    'should replace {miyoocfw} for known extension: %s',
    async (outputRomFilename, expectedPath) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{miyoocfw}' });
      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      const outputPath = OutputFactory.getPath(
        options,
        dummyDat,
        dummyGame,
        rom,
        await rom.toFile(),
      );
      expect(outputPath.format()).toEqual(expectedPath);
    },
  );

  test.each([
    'game.bin',
    'game.rom',
    // satellaview is not supported by https://github.com/TriForceX/MiyooCFW/wiki/Emulator-Info
    'game.bs',
  ])('should throw on {miyoocfw} for unknown extension: %s', async (outputRomFilename) => {
    const options = new Options({ commands: ['copy'], output: 'roms/{miyoocfw}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

    await expect(
      (async (): Promise<unknown> =>
        OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile()))(),
    ).rejects.toThrow(/failed to replace/);
  });

  // Output Token {onion}
  test.each([
    ['game.a78', path.resolve('Roms', 'SEVENTYEIGHTHUNDRED', 'game.a78')],
    ['game.gb', path.resolve('Roms', 'GB', 'game.gb')],
    ['game.nes', path.resolve('Roms', 'FC', 'game.nes')],
  ])('should replace {onion} for known extension: %s', async (outputRomFilename, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: 'Roms/{onion}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

    const outputPath = OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile());
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each(['game.arduboy', 'game.bin', 'game.rom'])(
    'should throw on {onion} for unknown extension: %s',
    async (outputRomFilename) => {
      const options = new Options({ commands: ['copy'], output: 'Roms/{onion}' });
      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      await expect(
        (async (): Promise<unknown> =>
          OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile()))(),
      ).rejects.toThrow(/failed to replace/);
    },
  );

  // Output Token {pocket}
  test.each([
    ['game.a78', path.resolve('Assets', '7800', 'common', 'game.a78')],
    ['game.gb', path.resolve('Assets', 'gb', 'common', 'game.gb')],
    ['game.nes', path.resolve('Assets', 'nes', 'common', 'game.nes')],
    ['game.sv', path.resolve('Assets', 'supervision', 'common', 'game.sv')],
  ])('should replace {pocket} for known extension: %s', async (outputRomFilename, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: 'Assets/{pocket}/common' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

    const outputPath = OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile());
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each(['game.bin', 'game.ngp', 'game.rom'])(
    'should throw on {pocket} for unknown extension: %s',
    async (outputRomFilename) => {
      const options = new Options({ commands: ['copy'], output: 'Assets/{pocket}/common' });
      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      await expect(
        (async (): Promise<unknown> =>
          OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile()))(),
      ).rejects.toThrow(/failed to replace/);
    },
  );

  test.each([
    // No unique extensions defined
    ['Bit Corporation - Gamate', path.resolve('gamate', 'Dummy.rom')],
    ['Emerson - Arcadia', path.resolve('arcadia', 'Dummy.rom')],
    ['Entex - Adventure Vision', path.resolve('avision', 'Dummy.rom')],
    // Unique extensions defined
    ['Atari - 2600', path.resolve('atari2600', 'Dummy.rom')],
    ['Nintendo - Game Boy', path.resolve('gb', 'Dummy.rom')],
    ['Nintendo - Game Boy Advance', path.resolve('gba', 'Dummy.rom')],
    ['Nintendo - Game Boy Color', path.resolve('gbc', 'Dummy.rom')],
    // Testing priority
    [
      'Nintendo - Family Computer Disk System (FDS) (Parent-Clone)',
      path.resolve('fds', 'Dummy.rom'),
    ],
    ['Nintendo - Famicom [T-En] Collection', path.resolve('famicom', 'Dummy.rom')],
    [
      'Nintendo - Nintendo Entertainment System (Headered) (Parent-Clone)',
      path.resolve('nes', 'Dummy.rom'),
    ],
    [
      'Nintendo - Nintendo Entertainment System (Headerless) (Parent-Clone)',
      path.resolve('nes', 'Dummy.rom'),
    ],
    ['Nintendo - Super Famicom [T-En] Collection', path.resolve('sfc', 'Dummy.rom')],
    [
      'Nintendo - Super Nintendo Entertainment System (Parent-Clone)',
      path.resolve('snes', 'Dummy.rom'),
    ],
  ])('should replace {pocket} for known DAT name: %s', async (datName, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: '{es}' });

    const outputPath = OutputFactory.getPath(
      options,
      new LogiqxDAT({ header: new Header({ name: datName }) }),
      dummyGame,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  // Output Token {retrodeck}
  test.each([
    ['game.a78', path.resolve('roms', 'atari7800', 'game.a78')],
    ['game.gb', path.resolve('roms', 'gb', 'game.gb')],
    ['game.nes', path.resolve('roms', 'nes', 'game.nes')],
  ])(
    'should replace {retrodeck} for known extension: %s',
    async (outputRomFilename, expectedPath) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{retrodeck}' });
      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      const outputPath = OutputFactory.getPath(
        options,
        dummyDat,
        dummyGame,
        rom,
        await rom.toFile(),
      );
      expect(outputPath.format()).toEqual(expectedPath);
    },
  );

  test.each(['game.bin', 'game.rom'])(
    'should throw on {retrodeck} for unknown extension: %s',
    async (outputRomFilename) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{retrodeck}' });

      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      await expect(
        (async (): Promise<unknown> =>
          OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile()))(),
      ).rejects.toThrow(/failed to replace/);
    },
  );

  // Output Token {romm}
  test.each([
    ['game.d88', path.resolve('roms', 'pc-8800-series', 'game.d88')],
    ['game.gb', path.resolve('roms', 'gb', 'game.gb')],
    ['game.nes', path.resolve('roms', 'nes', 'game.nes')],
    ['game.pqa', path.resolve('roms', 'palm-os', 'game.pqa')],
  ])('should replace {romm} for known extension: %s', async (outputRomFilename, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: 'roms/{romm}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

    const outputPath = OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile());
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each(['game.bin', 'game.rom'])(
    'should throw on {romm} for unknown extension: %s',
    async (outputRomFilename) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{romm}' });

      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      await expect(
        (async (): Promise<unknown> =>
          OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile()))(),
      ).rejects.toThrow(/failed to replace/);
    },
  );

  // Output Token {spruce}
  test.each([
    ['game.a78', path.resolve('Roms', 'SEVENTYEIGHTHUNDRED', 'game.a78')],
    ['game.gb', path.resolve('Roms', 'GB', 'game.gb')],
    ['game.nes', path.resolve('Roms', 'FC', 'game.nes')],
  ])('should replace {spruce} for known extension: %s', async (outputRomFilename, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: 'Roms/{spruce}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

    const outputPath = OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile());
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each(['game.bin', 'game.rom'])(
    'should throw on {spruce} for unknown extension: %s',
    async (outputRomFilename) => {
      const options = new Options({ commands: ['copy'], output: 'roms/{spruce}' });

      const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

      await expect(
        (async (): Promise<unknown> =>
          OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile()))(),
      ).rejects.toThrow(/failed to replace/);
    },
  );

  // Output Token {twmenu}
  test.each([
    ['game.a26', path.resolve('roms', 'a26', 'game.a26')],
    ['game.a52', path.resolve('roms', 'a52', 'game.a52')],
    ['game.a78', path.resolve('roms', 'a78', 'game.a78')],
    ['game.ws', path.resolve('roms', 'ws', 'game.ws')],
    ['game.wsc', path.resolve('roms', 'ws', 'game.wsc')],
    ['game.col', path.resolve('roms', 'col', 'game.col')],
    ['game.pce', path.resolve('roms', 'tg16', 'game.pce')],
    ['game.gb', path.resolve('roms', 'gb', 'game.gb')],
    ['game.sgb', path.resolve('roms', 'gb', 'game.sgb')],
    ['game.gbc', path.resolve('roms', 'gb', 'game.gbc')],
    ['game.gba', path.resolve('roms', 'gba', 'game.gba')],
    ['game.nds', path.resolve('roms', 'nds', 'game.nds')],
    ['game.nes', path.resolve('roms', 'nes', 'game.nes')],
    ['game.sfc', path.resolve('roms', 'snes', 'game.sfc')],
    ['game.smc', path.resolve('roms', 'snes', 'game.smc')],
    ['game.gg', path.resolve('roms', 'gg', 'game.gg')],
    ['game.sms', path.resolve('roms', 'sms', 'game.sms')],
    ['game.gen', path.resolve('roms', 'gen', 'game.gen')],
    ['game.md', path.resolve('roms', 'gen', 'game.md')],
    ['game.smd', path.resolve('roms', 'gen', 'game.smd')],
    ['game.sc', path.resolve('roms', 'sg', 'game.sc')],
    ['game.sg', path.resolve('roms', 'sg', 'game.sg')],
    ['game.ngp', path.resolve('roms', 'ngp', 'game.ngp')],
    ['game.ngc', path.resolve('roms', 'ngp', 'game.ngc')],
  ])('should replace {twmenu} for known extension: %s', async (outputRomFilename, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: 'roms/{twmenu}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

    const outputPath = OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile());
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([
    'game.bin',
    'game.rom',
    // satellaview is not supported by https://github.com/DS-Homebrew/TWiLightMenu/tree/master/7zfile/roms/snes
    'game.bs',
  ])('should throw on {twmenu} for unknown extension: %s', async (outputRomFilename) => {
    const options = new Options({ commands: ['copy'], output: 'roms/{twmenu}' });
    const rom = new ROM({ name: outputRomFilename, size: 0, crc32: '' });

    await expect(
      (async (): Promise<unknown> =>
        OutputFactory.getPath(options, dummyDat, dummyGame, rom, await rom.toFile()))(),
    ).rejects.toThrow(/failed to replace/);
  });
});

describe('should respect "--dir-dat-mirror"', () => {
  test.each([
    ['dats/test.dat', path.resolve(os.devNull, 'file.rom')],
    ['dats/subdir/test.dat', path.resolve(os.devNull, 'subdir', 'file.rom')],
    ['dats/sub/dir/test.dat', path.resolve(os.devNull, 'sub', 'dir', 'file.rom')],
  ])('option is true: %s', async (datPath, expectedPath) => {
    const options = new Options({
      commands: ['copy'],
      dat: [datPath.split(/[\\/]/)[0]],
      output: os.devNull,
      dirDatMirror: true,
    });
    const dat = new LogiqxDAT({ filePath: datPath, header: new Header() });
    const rom = new ROM({ name: 'file.rom', size: 0, crc32: '' });

    const outputPath = OutputFactory.getPath(options, dat, dummyGame, rom, await rom.toFile());
    expect(outputPath.format()).toEqual(expectedPath);
  });
});

describe('should respect "--dir-mirror"', () => {
  test.each([
    ['roms/file.rom', path.resolve(os.devNull, 'file.rom')],
    ['roms/subdir/file.rom', path.resolve(os.devNull, 'subdir', 'file.rom')],
  ])('option is true: %s', async (filePath, expectedPath) => {
    const options = new Options({
      commands: ['copy'],
      input: ['roms'],
      output: os.devNull,
      dirMirror: true,
    });
    const rom = new ROM({ name: path.basename(filePath), size: 0, crc32: '' });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      dummyGame,
      rom,
      (await rom.toFile()).withFilePath(filePath),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([['roms/subdir/file.rom', path.resolve(os.devNull, 'file.rom')]])(
    'option is false: %s',
    async (filePath, expectedPath) => {
      const options = new Options({ commands: ['copy'], output: os.devNull, dirMirror: false });
      const rom = new ROM({ name: path.basename(filePath), size: 0, crc32: '' });

      const outputPath = OutputFactory.getPath(
        options,
        dummyDat,
        dummyGame,
        rom,
        (await rom.toFile()).withFilePath(filePath),
      );
      expect(outputPath.format()).toEqual(expectedPath);
    },
  );
});

describe('should respect "--dir-dat-name"', () => {
  test.each([
    [undefined, path.resolve(os.devNull, 'Dummy.rom')],
    ['name', path.resolve(os.devNull, 'name', 'Dummy.rom')],
  ])('option is true: %s', async (datName, expectedPath) => {
    const options = new Options({ commands: ['copy'], output: os.devNull, dirDatName: true });
    const dat = new LogiqxDAT({
      header: new Header({ name: datName, description: 'description' }),
    });

    const outputPath = OutputFactory.getPath(
      options,
      dat,
      dummyGame,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([['name', path.resolve(os.devNull, 'Dummy.rom')]])(
    'option is false: %s',
    async (datName, expectedPath) => {
      const options = new Options({ commands: ['copy'], output: os.devNull, dirDatName: false });
      const dat = new LogiqxDAT({
        header: new Header({ name: datName, description: 'description' }),
      });

      const outputPath = OutputFactory.getPath(
        options,
        dat,
        dummyGame,
        dummyRom,
        await dummyRom.toFile(),
      );
      expect(outputPath.format()).toEqual(expectedPath);
    },
  );
});

describe('should respect "--dir-dat-description"', () => {
  test.each([
    [undefined, path.resolve(os.devNull, 'Dummy.rom')],
    ['description', path.resolve(os.devNull, 'description', 'Dummy.rom')],
  ])('option is true: %s', async (datDescription, expectedPath) => {
    const options = new Options({
      commands: ['copy'],
      output: os.devNull,
      dirDatDescription: true,
    });
    const dat = new LogiqxDAT({
      header: new Header({ name: 'name', description: datDescription }),
    });

    const outputPath = OutputFactory.getPath(
      options,
      dat,
      dummyGame,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each([['description', path.resolve(os.devNull, 'Dummy.rom')]])(
    'option is false: %s',
    async (datDescription, expectedPath) => {
      const options = new Options({
        commands: ['copy'],
        output: os.devNull,
        dirDatDescription: false,
      });
      const dat = new LogiqxDAT({
        header: new Header({ name: 'name', description: datDescription }),
      });

      const outputPath = OutputFactory.getPath(
        options,
        dat,
        dummyGame,
        dummyRom,
        await dummyRom.toFile(),
      );
      expect(outputPath.format()).toEqual(expectedPath);
    },
  );
});

describe('should respect "--dir-letter"', () => {
  describe('games with one ROM', () => {
    test.each([
      [0, '', os.devNull],
      [1, '', os.devNull],
      [2, '', os.devNull],
      [999, '', os.devNull],
      [1, 'file.rom', path.resolve(os.devNull, 'F', 'file.rom')],
      [3, 'file.rom', path.resolve(os.devNull, 'FIL', 'file.rom')],
      [10, 'file.rom', path.resolve(os.devNull, 'FILEAAAAAA', 'file.rom')],
      [1, '007.rom', path.resolve(os.devNull, '#', '007.rom')],
      [2, '007.rom', path.resolve(os.devNull, '##', '007.rom')],
      [10, '007.rom', path.resolve(os.devNull, '###AAAAAAA', '007.rom')],
      [1, '🙂.rom', path.resolve(os.devNull, '#', '🙂.rom')],
      [3, '🙂.rom', path.resolve(os.devNull, '##A', '🙂.rom')],
      [10, '🙂.rom', path.resolve(os.devNull, '##AAAAAAAA', '🙂.rom')],
    ])('option is true: %s', async (dirLetterCount, romName, expectedPath) => {
      const options = new Options({
        commands: ['copy'],
        output: os.devNull,
        dirLetter: true,
        dirLetterCount,
      });
      const rom = new ROM({ name: romName, size: 0, crc32: '' });

      const outputPath = OutputFactory.getPath(
        options,
        dummyDat,
        dummyGame,
        rom,
        await rom.toFile(),
      );
      expect(outputPath.format()).toEqual(expectedPath);
    });

    test.each([['🙂.rom', path.resolve(os.devNull, '🙂.rom')]])(
      'option is false: %s',
      async (romName, expectedPath) => {
        const options = new Options({ commands: ['copy'], output: os.devNull, dirLetter: false });
        const rom = new ROM({ name: romName, size: 0, crc32: '' });

        const outputPath = OutputFactory.getPath(
          options,
          dummyDat,
          dummyGame,
          rom,
          await rom.toFile(),
        );
        expect(outputPath.format()).toEqual(expectedPath);
      },
    );
  });

  describe('game with multiple ROMs', () => {
    const game = new SingleValueGame({
      name: 'Apidya (Unknown)',
      roms: [
        new ROM({ name: 'disk1\\apidya_disk1_00.0.raw', size: 265_730, crc32: '555b1be8' }),
        new ROM({ name: 'disk1\\apidya_disk1_00.1.raw', size: 256_990, crc32: '9ef64ba6' }),
      ],
    });

    it('should respect the game name', async () => {
      const options = new Options({
        commands: ['copy'],
        output: os.devNull,
        dirLetter: true,
        dirLetterCount: 1,
        dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
      });

      const outputPaths = await Promise.all(
        game
          .getRoms()
          .map(async (rom) =>
            OutputFactory.getPath(options, dummyDat, game, rom, await rom.toFile()),
          ),
      );

      expect(
        outputPaths.every(
          (outputPath) => outputPath.dir === path.resolve(options.getOutput(), 'A'),
        ),
      ).toEqual(true);
    });
  });
});

describe('should respect "--dir-game-subdir"', () => {
  test.each(
    [
      new SingleValueGame({
        name: 'game',
      }),
      new SingleValueGame({
        name: 'game',
        roms: new ROM({ name: 'one.rom', size: 0, crc32: '' }),
      }),
      new SingleValueGame({
        name: 'game',
        roms: [
          new ROM({ name: 'one.rom', size: 0, crc32: '' }),
          new ROM({ name: 'two.rom', size: 0, crc32: '' }),
        ],
      }),
    ].map((game) => [game.getName(), game]),
  )('"never": %s', async (_, game) => {
    const options = new Options({
      commands: ['copy'],
      output: os.devNull,
      dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.NEVER].toLowerCase(),
    });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      game,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(path.resolve(os.devNull, 'Dummy.rom'));
  });

  test.each(
    (
      [
        [
          new SingleValueGame({
            name: 'game',
          }),
          path.resolve(os.devNull, 'Dummy.rom'),
        ],
        [
          new SingleValueGame({
            name: 'game',
            roms: new ROM({ name: 'one.rom', size: 0, crc32: '' }),
          }),
          path.resolve(os.devNull, 'Dummy.rom'),
        ],
        [
          new SingleValueGame({
            name: 'game',
            roms: [
              new ROM({ name: 'one.rom', size: 0, crc32: '' }),
              new ROM({ name: 'two.rom', size: 0, crc32: '' }),
            ],
          }),
          path.resolve(os.devNull, 'game', 'Dummy.rom'),
        ],
      ] satisfies [SingleValueGame, string][]
    ).map(([game, expectedPath]) => [game.getName(), game, expectedPath]),
  )('"multiple": %s', async (_, game, expectedPath) => {
    const options = new Options({
      commands: ['copy'],
      output: os.devNull,
      dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
    });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      game,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(expectedPath);
  });

  test.each(
    [
      new SingleValueGame({
        name: 'game',
      }),
      new SingleValueGame({
        name: 'game',
        roms: new ROM({ name: 'one.rom', size: 0, crc32: '' }),
      }),
      new SingleValueGame({
        name: 'game',
        roms: [
          new ROM({ name: 'one.rom', size: 0, crc32: '' }),
          new ROM({ name: 'two.rom', size: 0, crc32: '' }),
        ],
      }),
    ].map((game) => [game.getName(), game]),
  )('"always": %s', async (_, game) => {
    const options = new Options({
      commands: ['copy'],
      output: os.devNull,
      dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.ALWAYS].toLowerCase(),
    });

    const outputPath = OutputFactory.getPath(
      options,
      dummyDat,
      game,
      dummyRom,
      await dummyRom.toFile(),
    );
    expect(outputPath.format()).toEqual(path.resolve(os.devNull, 'game', 'Dummy.rom'));
  });
});

describe('outputTokens.json', () => {
  it('should adhere to its schema', () => {
    const ajv = new Ajv();
    const validate = ajv.compile(outputTokensSchema);
    const valid = validate(outputTokensData);
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });
});
