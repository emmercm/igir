import os from 'node:os';
import path from 'node:path';

import { Ajv } from 'ajv';

import Game from '../../../../src/models/dats/game.js';
import Header from '../../../../src/models/dats/logiqx/header.js';
import LogiqxDAT from '../../../../src/models/dats/logiqx/logiqxDat.js';
import MergedDiscGame from '../../../../src/models/dats/mergedDiscGame.js';
import Release from '../../../../src/models/dats/release.js';
import ROM from '../../../../src/models/dats/rom.js';
import ArchiveEntry from '../../../../src/models/files/archives/archiveEntry.js';
import ChdBinCue from '../../../../src/models/files/archives/chd/chdBinCue.js';
import Options, { GameSubdirMode, GameSubdirModeInverted } from '../../../../src/models/options.js';
import outputTokensData from '../../../../src/modules/candidates/utils/consoleTokens.json' with { type: 'json' };
import outputTokensSchema from '../../../../src/modules/candidates/utils/consoleTokens.schema.json' with { type: 'json' };
import OutputFactory from '../../../../src/modules/candidates/utils/outputFactory.js';

const dummyDat = new LogiqxDAT({ header: new Header() });
const dummyGame = new Game({ name: 'Dummy Game' });
const dummyRom = new ROM({ name: 'Dummy.rom', size: 0, crc32: '00000000' });

/**
 * Resolve an output path for a single console token. Every console token test varies exactly two
 * inputs — the DAT's name and the ROM's filename — because those are the only two signals
 * {@link OutputFactory} has to identify a console with.
 */
async function getConsolePath(
  outputToken: string,
  datName: string,
  romFilename: string,
): Promise<string> {
  const options = new Options({ commands: ['copy'], output: outputToken });
  const rom = new ROM({ name: romFilename, size: 0, crc32: '' });
  return OutputFactory.getPath(
    options,
    new LogiqxDAT({ header: new Header({ name: datName }) }),
    dummyGame,
    rom,
    await rom.toFile(),
  ).format();
}

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
    const game = new Game({
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
    const game = new Game({
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
    const game = new Game({
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
    const game = new Game({
      categories: category,
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

  describe('console tokens', () => {
    describe('matching by DAT name', () => {
      // A DAT's name is the strongest console signal Igir has, and unlike the ROM's file
      // extension it is available for every ROM in the DAT. These names all use a generic
      // ".rom" extension that resolves to nothing, so only the DAT name can be doing the work.
      test.each([
        // These consoles define no unique file extensions at all, so a DAT name is the *only*
        // way they can ever be resolved. If these regressed, the consoles would be unreachable.
        ['Bit Corporation - Gamate', 'gamate'],
        ['Emerson - Arcadia', 'arcadia'],
        // These consoles do define unique extensions, but the DAT name must work on its own so
        // that ROMs with a non-standard or corrected extension still land in the right folder.
        ['Atari - 2600', 'atari2600'],
        ['Nintendo - Game Boy', 'gb'],
        ['Nintendo - Game Boy Advance', 'gba'],
        ['Nintendo - Game Boy Color', 'gbc'],
        ['Nintendo - Super Famicom', 'sfc'],
        ['Nintendo - Nintendo 64', 'n64'],
        ['Sega - Master System', 'mastersystem'],
        ['Sony - PlayStation', 'psx'],
      ])('should replace {es} for the DAT name: %s', async (datName, expectedDirName) => {
        await expect(getConsolePath('{es}', datName, 'Dummy.rom')).resolves.toEqual(
          path.resolve(expectedDirName, 'Dummy.rom'),
        );
      });

      // Arcade DATs are the motivating case for DAT-name matching: arcade ROMs are .zip files,
      // and .zip is deliberately never a console extension (it would hijack every zipped console
      // ROM), so extension matching can never resolve them. Before these entries existed, every
      // arcade candidate was silently dropped with "failed to replace output token".
      // See https://github.com/emmercm/igir/issues/2405
      test.each([
        // FinalBurn Neo's arcade DAT matches no console entry, so it falls through to the
        // catch-all FBNeo entry. Each frontend has its own folder name and casing.
        ['FinalBurn Neo - Arcade Games', '{batocera}', 'fbneo'],
        ['FinalBurn Neo - Arcade Games', '{crossmix}', 'FBNEO'],
        ['FinalBurn Neo - Arcade Games', '{es}', 'fbneo'],
        ['FinalBurn Neo - Arcade Games', '{onion}', 'FBNEO'],
        ['FinalBurn Neo - Arcade Games', '{retrodeck}', 'fbneo'],
        ['FinalBurn Neo - Arcade Games', '{rocknix}', 'fbneo'],
        ['FinalBurn Neo - Arcade Games', '{spruce}', 'FBNEO'],
        // MAME DATs are named three different ways in the wild, and all three have to resolve:
        // MAME's own ListXML falls back to the literal "MAME", the -listxml build attribute
        // looks like "0.278 (mame0278)", and Pleasuredome names its DATs after the version.
        ['MAME', '{batocera}', 'mame'],
        ['0.278 (mame0278)', '{batocera}', 'mame'],
        ['MAME 0.287 ROMs (merged)', '{batocera}', 'mame'],
        ['MAME', '{crossmix}', 'MAME'],
        ['MAME', '{es}', 'mame'],
        ['MAME', '{mister}', 'mame'],
        ['MAME', '{miyoocfw}', 'MAME'],
        ['MAME', '{retrodeck}', 'mame'],
        ['MAME', '{rocknix}', 'mame'],
        // FinalBurn Alpha is a separate, older emulator with separate frontend folders, so it
        // must not be conflated with FinalBurn Neo. Only two frontends ship an FBA folder.
        ['FB Alpha v0.2.97.44', '{adam}', 'FBA'],
        ['FinalBurn Alpha - Arcade Games', '{adam}', 'FBA'],
        ['FinalBurn Alpha - Arcade Games', '{onion}', 'FBA2012'],
      ])(
        'should replace %s for the arcade DAT name: %s',
        async (datName, outputToken, expectedDirName) => {
          await expect(getConsolePath(outputToken, datName, 'Dummy.rom')).resolves.toEqual(
            path.resolve(expectedDirName, 'Dummy.rom'),
          );
        },
      );

      // Word boundaries were added to many regexes to stop short tokens such as "GB", "ST", and
      // "2600" from matching inside unrelated words. These cases guard the opposite failure
      // mode: a boundary that is *too* strict and stops matching a real DAT name. No-Intro
      // separates the manufacturer from the console with " - ", which a naive [ -] cannot span.
      test.each([
        ['Sord - M5', 'sord-m5'],
        ['Sord M5', 'sord-m5'],
      ])(
        'should replace {romm} across a No-Intro separator: %s',
        async (datName, expectedDirName) => {
          await expect(getConsolePath('{romm}', datName, 'Dummy.rom')).resolves.toEqual(
            path.resolve(expectedDirName, 'Dummy.rom'),
          );
        },
      );
    });

    describe('matching by file extension', () => {
      // When the DAT name matches no console — an unnamed DAT, a hand-rolled DAT, or a
      // multi-console collection — Igir falls through to the ROM's file extension. Each
      // frontend names its folders differently, so the mapping is asserted per token.
      test.each([
        // {adam}
        ['{adam}', 'game.a78', 'A7800'],
        ['{adam}', 'game.gb', 'GB'],
        ['{adam}', 'game.nes', 'FC'],
        // {batocera}
        ['{batocera}', 'game.a78', 'atari7800'],
        ['{batocera}', 'game.gb', 'gb'],
        ['{batocera}', 'game.nes', 'nes'],
        // {crossmix}
        ['{crossmix}', 'game.a78', 'ATARI7800'],
        ['{crossmix}', 'game.gb', 'GB'],
        ['{crossmix}', 'game.nes', 'FC'],
        // {es}
        ['{es}', 'game.a78', 'atari7800'],
        ['{es}', 'game.gb', 'gb'],
        ['{es}', 'game.nes', 'nes'],
        // {funkeyos}
        ['{funkeyos}', 'game.lnx', 'Atari lynx'],
        ['{funkeyos}', 'game.ws', 'WonderSwan'],
        ['{funkeyos}', 'game.wsc', 'WonderSwan'],
        ['{funkeyos}', 'game.pce', 'PCE-TurboGrafx'],
        ['{funkeyos}', 'game.fds', 'NES'],
        ['{funkeyos}', 'game.gb', 'Game Boy'],
        ['{funkeyos}', 'game.gba', 'Game Boy Advance'],
        ['{funkeyos}', 'game.gbc', 'Game Boy Color'],
        ['{funkeyos}', 'game.nes', 'NES'],
        ['{funkeyos}', 'game.nez', 'NES'],
        ['{funkeyos}', 'game.min', 'Pokemini'],
        ['{funkeyos}', 'game.sfc', 'SNES'],
        ['{funkeyos}', 'game.smc', 'SNES'],
        ['{funkeyos}', 'game.vb', 'Virtualboy'],
        ['{funkeyos}', 'game.gg', 'Game Gear'],
        ['{funkeyos}', 'game.sms', 'Sega Master System'],
        ['{funkeyos}', 'game.gen', 'Sega Genesis'],
        ['{funkeyos}', 'game.md', 'Sega Genesis'],
        ['{funkeyos}', 'game.mdx', 'Sega Genesis'],
        ['{funkeyos}', 'game.sgd', 'Sega Genesis'],
        ['{funkeyos}', 'game.smd', 'Sega Genesis'],
        ['{funkeyos}', 'game.ngp', 'Neo Geo Pocket'],
        ['{funkeyos}', 'game.ngc', 'Neo Geo Pocket'],
        // {minui}
        ['{minui}', 'game.pce', 'TurboGrafx-16 (PCE)'],
        ['{minui}', 'game.fds', 'Famicom Disk System (FC)'],
        ['{minui}', 'game.gb', 'Game Boy (GB)'],
        ['{minui}', 'game.sgb', 'Game Boy (GB)'],
        ['{minui}', 'game.gba', 'Game Boy Advance (GBA)'],
        ['{minui}', 'game.gbc', 'Game Boy Color (GBC)'],
        ['{minui}', 'game.nes', 'Nintendo Entertainment System (FC)'],
        ['{minui}', 'game.nez', 'Nintendo Entertainment System (FC)'],
        ['{minui}', 'game.min', 'Pokemon mini (PKM)'],
        ['{minui}', 'game.sfc', 'Super Nintendo Entertainment System (SFC)'],
        ['{minui}', 'game.smc', 'Super Nintendo Entertainment System (SFC)'],
        ['{minui}', 'game.vb', 'Virtual Boy (VB)'],
        ['{minui}', 'game.vboy', 'Virtual Boy (VB)'],
        ['{minui}', 'game.32x', 'Sega 32X (MD)'],
        ['{minui}', 'game.gg', 'Sega Game Gear (GG)'],
        ['{minui}', 'game.sms', 'Sega Master System (SMS)'],
        ['{minui}', 'game.gen', 'Sega Genesis (MD)'],
        ['{minui}', 'game.md', 'Sega Genesis (MD)'],
        ['{minui}', 'game.mdx', 'Sega Genesis (MD)'],
        ['{minui}', 'game.sgd', 'Sega Genesis (MD)'],
        ['{minui}', 'game.smd', 'Sega Genesis (MD)'],
        ['{minui}', 'game.ngp', 'Neo Geo Pocket (NGPC)'],
        ['{minui}', 'game.ngc', 'Neo Geo Pocket Color (NGPC)'],
        // {mister}
        ['{mister}', 'game.a78', 'Atari7800'],
        ['{mister}', 'game.gb', 'Gameboy'],
        ['{mister}', 'game.nes', 'NES'],
        // {miyoocfw}
        ['{miyoocfw}', 'game.a26', '2600'],
        ['{miyoocfw}', 'game.lnx', 'LYNX'],
        ['{miyoocfw}', 'game.ws', 'WSWAN'],
        ['{miyoocfw}', 'game.wsc', 'WSWAN'],
        ['{miyoocfw}', 'game.vec', 'VECTREX'],
        ['{miyoocfw}', 'game.pce', 'PCE'],
        ['{miyoocfw}', 'game.gb', 'GB'],
        ['{miyoocfw}', 'game.sgb', 'GB'],
        ['{miyoocfw}', 'game.gbc', 'GB'],
        ['{miyoocfw}', 'game.gba', 'GBA'],
        ['{miyoocfw}', 'game.nes', 'NES'],
        ['{miyoocfw}', 'game.fds', 'NES'],
        ['{miyoocfw}', 'game.sfc', 'SNES'],
        ['{miyoocfw}', 'game.smc', 'SNES'],
        ['{miyoocfw}', 'game.min', 'POKEMINI'],
        ['{miyoocfw}', 'game.gg', 'SMS'],
        ['{miyoocfw}', 'game.sms', 'SMS'],
        ['{miyoocfw}', 'game.gen', 'SMD'],
        ['{miyoocfw}', 'game.md', 'SMD'],
        ['{miyoocfw}', 'game.smd', 'SMD'],
        // {onion}
        ['{onion}', 'game.a78', 'SEVENTYEIGHTHUNDRED'],
        ['{onion}', 'game.gb', 'GB'],
        ['{onion}', 'game.nes', 'FC'],
        // {pocket}
        ['{pocket}', 'game.a78', '7800'],
        ['{pocket}', 'game.gb', 'gb'],
        ['{pocket}', 'game.nes', 'nes'],
        ['{pocket}', 'game.sv', 'supervision'],
        // {retrodeck}
        ['{retrodeck}', 'game.a78', 'atari7800'],
        ['{retrodeck}', 'game.gb', 'gb'],
        ['{retrodeck}', 'game.nes', 'nes'],
        // {rocknix}
        ['{rocknix}', 'game.a78', 'atari7800'],
        ['{rocknix}', 'game.gb', 'gb'],
        ['{rocknix}', 'game.nes', 'nes'],
        // {romm}
        ['{romm}', 'game.d88', 'pc-8800-series'],
        ['{romm}', 'game.gb', 'gb'],
        ['{romm}', 'game.nes', 'nes'],
        ['{romm}', 'game.pqa', 'palm-os'],
        // {spruce}
        ['{spruce}', 'game.a78', 'SEVENTYEIGHTHUNDRED'],
        ['{spruce}', 'game.gb', 'GB'],
        ['{spruce}', 'game.nes', 'FC'],
        // {twmenu}
        ['{twmenu}', 'game.a26', 'a26'],
        ['{twmenu}', 'game.a52', 'a52'],
        ['{twmenu}', 'game.a78', 'a78'],
        ['{twmenu}', 'game.ws', 'ws'],
        ['{twmenu}', 'game.wsc', 'ws'],
        ['{twmenu}', 'game.col', 'col'],
        ['{twmenu}', 'game.pce', 'tg16'],
        ['{twmenu}', 'game.gb', 'gb'],
        ['{twmenu}', 'game.sgb', 'gb'],
        ['{twmenu}', 'game.gbc', 'gb'],
        ['{twmenu}', 'game.gba', 'gba'],
        ['{twmenu}', 'game.nds', 'nds'],
        ['{twmenu}', 'game.nes', 'nes'],
        ['{twmenu}', 'game.sfc', 'snes'],
        ['{twmenu}', 'game.smc', 'snes'],
        ['{twmenu}', 'game.gg', 'gg'],
        ['{twmenu}', 'game.sms', 'sms'],
        ['{twmenu}', 'game.gen', 'gen'],
        ['{twmenu}', 'game.md', 'gen'],
        ['{twmenu}', 'game.smd', 'gen'],
        ['{twmenu}', 'game.sc', 'sg'],
        ['{twmenu}', 'game.sg', 'sg'],
        ['{twmenu}', 'game.ngp', 'ngp'],
        ['{twmenu}', 'game.ngc', 'ngp'],
      ])(
        'should replace %s for the file extension: %s',
        async (outputToken, romFilename, expectedDirName) => {
          await expect(getConsolePath(outputToken, '', romFilename)).resolves.toEqual(
            path.resolve(expectedDirName, romFilename),
          );
        },
      );

      // An unrecognized DAT name must not short-circuit extension matching. This is the common
      // case for the many DATs that aren't named after a single console.
      test.each([
        ['game.gb', 'gb'],
        ['game.gbc', 'gbc'],
        ['game.nes', 'nes'],
      ])(
        'should fall through an unrecognized DAT name to the file extension: %s',
        async (romFilename, expectedDirName) => {
          await expect(
            getConsolePath('{es}', 'Some Unknown Collection', romFilename),
          ).resolves.toEqual(path.resolve(expectedDirName, romFilename));
        },
      );
    });

    describe('precedence between the DAT name and the file extension', () => {
      // The DAT name is checked first and, when it matches, the file extension is never
      // consulted. This matters most for arcade romsets, whose archives contain files with
      // extensions that collide with console ROMs — without this ordering, a MAME romset would
      // be scattered across a dozen console folders.
      test.each([
        ['MAME', 'game.nes', 'mame'],
        ['FinalBurn Neo - Arcade Games', 'game.gb', 'fbneo'],
        // The DAT name is also the more specific of the two signals: a Game Boy Color DAT can
        // legitimately contain files with a ".gb" extension, and they belong in the GBC folder.
        ['Nintendo - Game Boy Color', 'game.gb', 'gbc'],
      ])(
        'should prefer the DAT name over the file extension: %s',
        async (datName, romFilename, expectedDirName) => {
          await expect(getConsolePath('{es}', datName, romFilename)).resolves.toEqual(
            path.resolve(expectedDirName, romFilename),
          );
        },
      );
    });

    describe('specificity', () => {
      // Console entries are matched with findLast(), so when several regexes match the same DAT
      // name the *last* entry in consoleTokens.json wins. That makes the file's ordering
      // load-bearing: every specific console has to be listed after the broader console whose
      // name it contains. These cases pin that ordering in place — each pair is a name where
      // the broader entry also matches, and the broader entry must lose.
      test.each([
        // "Game Boy" is a prefix of both successors
        ['Nintendo - Game Boy', 'gb'],
        ['Nintendo - Game Boy Color', 'gbc'],
        ['Nintendo - Game Boy Advance', 'gba'],
        // "Famicom" appears inside the Famicom Disk System's full name, and "Nintendo
        // Entertainment System" inside the Super Nintendo's. These are the real No-Intro DAT
        // names, parenthetical suffixes and all, since those suffixes are what regexes trip on.
        ['Nintendo - Famicom [T-En] Collection', 'famicom'],
        ['Nintendo - Family Computer Disk System (FDS) (Parent-Clone)', 'fds'],
        ['Nintendo - Nintendo Entertainment System (Headered) (Parent-Clone)', 'nes'],
        ['Nintendo - Nintendo Entertainment System (Headerless) (Parent-Clone)', 'nes'],
        ['Nintendo - Super Famicom [T-En] Collection', 'sfc'],
        ['Nintendo - Super Nintendo Entertainment System (Parent-Clone)', 'snes'],
        // "Neo Geo" is a prefix of three unrelated hardware families
        ['SNK - Neo Geo', 'neogeo'],
        ['SNK - Neo Geo CD', 'neogeocd'],
        ['SNK - Neo Geo Pocket', 'ngp'],
        ['SNK - Neo Geo Pocket Color', 'ngpc'],
        // MSX generations nest inside each other, and the "+" in MSX2+ has to stay escaped:
        // an unescaped "+" makes /MSX2+/ match plain "MSX2" and hijack it via findLast().
        ['Microsoft - MSX', 'msx'],
        ['Microsoft - MSX2', 'msx2'],
        ['Microsoft - MSX TurboR', 'msxturbor'],
        // PlayStation numbering, where the bare name matches every successor
        ['Sony - PlayStation', 'psx'],
        ['Sony - PlayStation 2', 'ps2'],
        ['Sony - PlayStation 3', 'ps3'],
        ['Sony - PlayStation Portable', 'psp'],
        ['Sony - PlayStation Vita', 'psvita'],
        // Single-letter suffixes are easy to lose to a greedy earlier entry
        ['Nintendo - Wii', 'wii'],
        ['Nintendo - Wii U', 'wiiu'],
        ['Microsoft - Xbox', 'xbox'],
        ['Microsoft - Xbox 360', 'xbox360'],
        ['Nintendo - Nintendo 64', 'n64'],
        ['Nintendo - Nintendo 64DD', 'n64dd'],
        // NEC's naming is the messiest: SuperGrafx and the CD add-ons all contain "PC Engine"
        // or "TurboGrafx", and FBNeo spells SuperGrafx "SuprGrafx"
        ['NEC - PC Engine', 'pcengine'],
        ['NEC - PC Engine CD', 'pcenginecd'],
        ['NEC - PC Engine SuperGrafx', 'supergrafx'],
        ['NEC - TurboGrafx-16', 'tg16'],
        ['NEC - TurboGrafx CD', 'tg-cd'],
        // Amiga's CD-based variants
        ['Commodore - Amiga', 'amiga'],
        ['Commodore - Amiga CD32', 'amigacd32'],
        ['Commodore - Amiga CDTV', 'cdtv'],
        // Atari's CD add-on
        ['Atari - Jaguar', 'atarijaguar'],
        ['Atari - Jaguar CD', 'atarijaguarcd'],
      ])(
        'should prefer the more specific console for the DAT name: %s',
        async (datName, expectedDirName) => {
          await expect(getConsolePath('{es}', datName, 'Dummy.rom')).resolves.toEqual(
            path.resolve(expectedDirName, 'Dummy.rom'),
          );
        },
      );

      // The MSX2+ folder differs from MSX2 only for some frontends; Batocera is one of them, so
      // it's the token that can actually prove the escaped "+" is doing its job.
      test.each([
        ['Microsoft - MSX2', 'msx2'],
        ['Microsoft - MSX2+', 'msx2+'],
      ])('should distinguish {batocera} MSX2 from MSX2+: %s', async (datName, expectedDirName) => {
        await expect(getConsolePath('{batocera}', datName, 'Dummy.rom')).resolves.toEqual(
          path.resolve(expectedDirName, 'Dummy.rom'),
        );
      });

      // The arcade entries are deliberately placed *first* in consoleTokens.json. Their regexes
      // are broad ("FinalBurn Neo" matches every FBNeo DAT), so being first means findLast()
      // lets any console-specific entry override them. That keeps the arcade regexes simple
      // while ensuring FBNeo's eighteen console DATs still sort by console, not into "fbneo".
      test.each([
        ['FinalBurn Neo - Neo Geo Games', 'neogeo'],
        ['FinalBurn Neo - Neo Geo Pocket Games', 'ngp'],
        ['FinalBurn Neo - NES Games', 'nes'],
        ['FinalBurn Neo - FDS Games', 'fds'],
        ['FinalBurn Neo - SNES Games', 'snes'],
        ['FinalBurn Neo - Master System Games', 'mastersystem'],
        ['FinalBurn Neo - Game Gear Games', 'gamegear'],
        ['FinalBurn Neo - ColecoVision Games', 'colecovision'],
        ['FinalBurn Neo - ZX Spectrum Games', 'zxspectrum'],
        ['FinalBurn Neo - Sega SG-1000 Games', 'sg-1000'],
        ['FinalBurn Neo - Fairchild Channel F Games', 'channelf'],
        ['FinalBurn Neo - Astrocade Home Computer Games', 'astrocde'],
        ['FinalBurn Neo - MSX 1 Games', 'msx'],
        // FBNeo spells several consoles differently from No-Intro/Redump, and each of these
        // spellings previously matched nothing and fell through to the arcade folder
        ['FinalBurn Neo - Megadrive Games', 'megadrivejp'],
        ['FinalBurn Neo - PC-Engine Games', 'pcengine'],
        ['FinalBurn Neo - SuprGrafx Games', 'supergrafx'],
        ['FinalBurn Neo - TurboGrafx 16 Games', 'tg16'],
      ])(
        'should prefer the console over the arcade fallback: %s',
        async (datName, expectedDirName) => {
          await expect(getConsolePath('{es}', datName, 'Dummy.rom')).resolves.toEqual(
            path.resolve(expectedDirName, 'Dummy.rom'),
          );
        },
      );
    });

    describe('token aliases', () => {
      // JELOS was renamed ROCKNIX, so {jelos} is kept as an alias that's filled in at load time
      // from the {rocknix} value. It has to resolve identically for every match path, otherwise
      // users on the old token would silently get different — or no — output directories.
      test.each([
        // Matched by file extension
        ['', 'game.a78', 'atari7800'],
        ['', 'game.gb', 'gb'],
        ['', 'game.nes', 'nes'],
        // Matched by DAT name, including the arcade entries added most recently
        ['Nintendo - Game Boy Color', 'Dummy.rom', 'gbc'],
        ['MAME', 'Dummy.rom', 'mame'],
        ['FinalBurn Neo - Arcade Games', 'Dummy.rom', 'fbneo'],
      ])(
        'should resolve {jelos} and {rocknix} to the same value: %s %s',
        async (datName, romFilename, expectedDirName) => {
          const jelosPath = await getConsolePath('{jelos}', datName, romFilename);
          const rocknixPath = await getConsolePath('{rocknix}', datName, romFilename);

          expect(jelosPath).toEqual(path.resolve(expectedDirName, romFilename));
          expect(jelosPath).toEqual(rocknixPath);
        },
      );
    });

    describe('known gaps', () => {
      // A token that can't be resolved is left in the path, and the leftover-token guard throws
      // rather than writing a file to a literal "{es}" directory. CandidateGenerator catches
      // this and drops the candidate, so these are the paths where ROMs go missing.

      // Extensions that no console claims. Some are genuinely ambiguous containers (.bin,
      // .rom); the rest are formats the frontend's own documentation says it doesn't support.
      test.each([
        ['{adam}', 'game.n64'],
        ['{adam}', 'game.bs'],
        ['{adam}', 'game.bin'],
        ['{adam}', 'game.rom'],
        ['{batocera}', 'game.bin'],
        ['{batocera}', 'game.rom'],
        ['{crossmix}', 'game.bin'],
        ['{crossmix}', 'game.rom'],
        ['{es}', 'game.bin'],
        ['{es}', 'game.rom'],
        ['{funkeyos}', 'game.bin'],
        ['{funkeyos}', 'game.rom'],
        // satellaview is not supported by https://github.com/FunKey-Project/FunKey-OS/blob/master/FunKey/board/funkey/rootfs-overlay/usr/games/collections/SNES/settings.conf
        ['{funkeyos}', 'game.bs'],
        ['{minui}', 'game.bin'],
        ['{minui}', 'game.rom'],
        ['{minui}', 'game.mgw'],
        ['{mister}', 'game.bin'],
        ['{mister}', 'game.rom'],
        // MiSTer has no Neo Geo Pocket core
        ['{mister}', 'game.ngc'],
        ['{mister}', 'game.ngp'],
        ['{miyoocfw}', 'game.bin'],
        ['{miyoocfw}', 'game.rom'],
        // satellaview is not supported by https://github.com/TriForceX/MiyooCFW/wiki/Emulator-Info
        ['{miyoocfw}', 'game.bs'],
        ['{onion}', 'game.bin'],
        ['{onion}', 'game.rom'],
        ['{pocket}', 'game.bin'],
        ['{pocket}', 'game.rom'],
        // openFPGA has no Neo Geo Pocket core
        ['{pocket}', 'game.ngp'],
        ['{retrodeck}', 'game.bin'],
        ['{retrodeck}', 'game.rom'],
        ['{rocknix}', 'game.bin'],
        ['{rocknix}', 'game.rom'],
        ['{romm}', 'game.bin'],
        ['{romm}', 'game.rom'],
        ['{spruce}', 'game.bin'],
        ['{spruce}', 'game.rom'],
        ['{twmenu}', 'game.bin'],
        ['{twmenu}', 'game.rom'],
        // satellaview is not supported by https://github.com/DS-Homebrew/TWiLightMenu/tree/master/7zfile/roms/snes
        ['{twmenu}', 'game.bs'],
      ])(
        'should throw on %s for an unknown file extension: %s',
        async (outputToken, romFilename) => {
          await expect(getConsolePath(outputToken, '', romFilename)).rejects.toThrow(
            /failed to replace/,
          );
        },
      );

      // A console can match while the requested frontend still has no folder for it. Matching
      // by DAT name is *not* re-tried against the file extension in that case, by design — the
      // DAT name is the more reliable signal, and falling back would put ROMs in a folder for
      // the wrong console rather than failing loudly.
      test.each([
        // These frontends document no arcade support at all
        ['FinalBurn Neo - Arcade Games', '{funkeyos}'],
        ['FinalBurn Neo - Arcade Games', '{minui}'],
        ['FinalBurn Neo - Arcade Games', '{twmenu}'],
        // The Analogue Pocket has no fixed arcade folder; each openFPGA core uses its own
        // Assets/<coreID>/common/ directory and needs an MRA-converted .rom, not a romset
        ['FinalBurn Neo - Arcade Games', '{pocket}'],
        // RomM has an "arcade" platform but no FBNeo or MAME slug, and Igir deliberately does
        // not map an emulator-specific DAT onto a frontend's generic "arcade" folder
        ['FinalBurn Neo - Arcade Games', '{romm}'],
        ['MAME', '{romm}'],
        // MiSTer has a MAME folder but no concept of FBNeo
        ['FinalBurn Neo - Arcade Games', '{mister}'],
        // These frontends only ship version-pinned MAME folders (MAME2000, MAME2003PLUS, …), so
        // there's no folder a generic MAME DAT can be sorted into
        ['MAME', '{adam}'],
        ['MAME', '{onion}'],
        ['MAME', '{spruce}'],
        // Only Adam and Onion ship a FinalBurn Alpha folder; everyone else moved to FBNeo
        ['FB Alpha v0.2.97.44', '{batocera}'],
        ['FB Alpha v0.2.97.44', '{es}'],
      ])('should throw on %s for a console with no folder: %s', async (datName, outputToken) => {
        await expect(getConsolePath(outputToken, datName, 'Dummy.rom')).rejects.toThrow(
          /failed to replace/,
        );
      });

      // Consoles with no entry in consoleTokens.json at all. Nothing in the DAT name or the
      // file extension can resolve these, so they're a standing to-do rather than a bug.
      test.each([['Nokia - N-Gage'], ['Some Unknown Console']])(
        'should throw when no console is known for the DAT name: %s',
        async (datName) => {
          await expect(getConsolePath('{es}', datName, 'Dummy.rom')).rejects.toThrow(
            /failed to replace/,
          );
        },
      );

      // Issue #2405 was filed because this failure was invisible: the message named only the
      // token, at a log level users don't see. The DAT name and a pointer to the escape hatch
      // have to stay in the message so an unmatched console is self-diagnosing.
      it('should name the DAT when no console matches', async () => {
        await expect(
          getConsolePath('{batocera}', 'Some Unknown Console', 'Dummy.rom'),
        ).rejects.toThrow(/no console is known for the DAT "Some Unknown Console"/);
      });

      // Known ordering gap: the "Mega Drive" entry is listed *after* both 32X entries, so
      // findLast() gives 32X DATs the Mega Drive folder whenever the name also says "Mega
      // Drive". A bare "32X" resolves correctly, which is what makes this an ordering problem
      // rather than a missing console. Fixing it means moving the 32X entries after Mega Drive.
      test.each([
        ['Sega - 32X', 'sega32x'],
        ['Sega - Mega Drive 32X', 'megadrivejp'],
      ])(
        'should mis-sort 32X DATs that also name the Mega Drive: %s',
        async (datName, expectedDirName) => {
          await expect(getConsolePath('{es}', datName, 'Dummy.rom')).resolves.toEqual(
            path.resolve(expectedDirName, 'Dummy.rom'),
          );
        },
      );
    });
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
      dat: [datPath.split(/[\\/]/, 1)[0]],
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
    const game = new Game({
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
      new Game({
        name: 'game',
      }),
      new Game({
        name: 'game',
        roms: new ROM({ name: 'one.rom', size: 0, crc32: '' }),
      }),
      new Game({
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
          new Game({
            name: 'game',
          }),
          path.resolve(os.devNull, 'Dummy.rom'),
        ],
        [
          new Game({
            name: 'game',
            roms: new ROM({ name: 'one.rom', size: 0, crc32: '' }),
          }),
          path.resolve(os.devNull, 'Dummy.rom'),
        ],
        [
          new Game({
            name: 'game',
            roms: [
              new ROM({ name: 'one.rom', size: 0, crc32: '' }),
              new ROM({ name: 'two.rom', size: 0, crc32: '' }),
            ],
          }),
          path.resolve(os.devNull, 'game', 'Dummy.rom'),
        ],
      ] satisfies [Game, string][]
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
      new Game({
        name: 'game',
      }),
      new Game({
        name: 'game',
        roms: new ROM({ name: 'one.rom', size: 0, crc32: '' }),
      }),
      new Game({
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

describe('should respect "--merge-discs"', () => {
  const discMergedGame = new MergedDiscGame({
    name: 'Metal Gear Solid (USA)',
    subGames: [
      new Game({
        name: 'Metal Gear Solid (USA) (Disc 1)',
        roms: new ROM({ name: 'Metal Gear Solid (USA) (Disc 1).chd', size: 0, crc32: '' }),
      }),
      new Game({
        name: 'Metal Gear Solid (USA) (Disc 2)',
        roms: new ROM({ name: 'Metal Gear Solid (USA) (Disc 2).chd', size: 0, crc32: '' }),
      }),
    ],
  });

  test.each(
    [
      GameSubdirModeInverted[GameSubdirMode.NEVER].toLowerCase(),
      GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
      GameSubdirModeInverted[GameSubdirMode.ALWAYS].toLowerCase(),
    ].map((mode) => [mode]),
  )('raw-copies merged discs to a single subdirectory: "%s"', async (dirGameSubdir) => {
    const options = new Options({
      commands: ['copy'],
      output: os.devNull,
      dirGameSubdir,
    });

    for (const rom of discMergedGame.getRoms()) {
      const outputPath = OutputFactory.getPath(
        options,
        dummyDat,
        discMergedGame,
        rom,
        await ArchiveEntry.entryOf({
          archive: new ChdBinCue(rom.getName()),
          entryPath: rom.getName(),
          size: 0,
          crc32: '',
        }),
      );
      expect(outputPath.format()).toEqual(
        path.resolve(os.devNull, 'Metal Gear Solid (USA)', rom.getName()),
      );
    }
  });

  test.each(
    [
      GameSubdirModeInverted[GameSubdirMode.NEVER].toLowerCase(),
      GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
      GameSubdirModeInverted[GameSubdirMode.ALWAYS].toLowerCase(),
    ].map((mode) => [mode]),
  )('extracts merged discs into a single subdirectory: "%s"', async (dirGameSubdir) => {
    const options = new Options({
      commands: ['copy', 'extract'],
      output: os.devNull,
      dirGameSubdir,
    });

    for (const rom of discMergedGame.getRoms()) {
      const outputPath = OutputFactory.getPath(
        options,
        dummyDat,
        discMergedGame,
        rom,
        await ArchiveEntry.entryOf({
          archive: new ChdBinCue(rom.getName()),
          entryPath: rom.getName(),
          size: 0,
          crc32: '',
        }),
      );
      expect(outputPath.format()).toEqual(
        path.resolve(os.devNull, 'Metal Gear Solid (USA)', rom.getName()),
      );
    }
  });

  // A TOSEC-style GD-ROM multi-disc game whose discs are each a single CHD holding multiple raw
  // tracks. The track ROMs carry no disc identity in their names, and when merged they are
  // de-conflicted with a disc-name subdirectory.
  const tosecGdRomMergedGame = new MergedDiscGame({
    name: 'Deep Fighter v1.001 (2000)(Ubi Soft)(PAL)(DE)[!]',
    subGames: [
      new Game({
        name: 'Deep Fighter v1.001 (2000)(Ubi Soft)(PAL)(DE)(Disc 1 of 2)[!]',
        roms: [
          new ROM({
            name: 'Deep Fighter v1.001 (2000)(Ubi Soft)(PAL)(DE)(Disc 1 of 2)[!]/track01.bin',
            size: 0,
            crc32: '',
          }),
          new ROM({
            name: 'Deep Fighter v1.001 (2000)(Ubi Soft)(PAL)(DE)(Disc 1 of 2)[!]/track02.raw',
            size: 0,
            crc32: '',
          }),
          new ROM({
            name: 'Deep Fighter v1.001 (2000)(Ubi Soft)(PAL)(DE)(Disc 1 of 2)[!]/track03.raw',
            size: 0,
            crc32: '',
          }),
        ],
      }),
      new Game({
        name: 'Deep Fighter v1.001 (2000)(Ubi Soft)(PAL)(DE)(Disc 2 of 2)[!]',
        roms: [
          new ROM({
            name: 'Deep Fighter v1.001 (2000)(Ubi Soft)(PAL)(DE)(Disc 2 of 2)[!]/track01.bin',
            size: 0,
            crc32: '',
          }),
          new ROM({
            name: 'Deep Fighter v1.001 (2000)(Ubi Soft)(PAL)(DE)(Disc 2 of 2)[!]/track02.raw',
            size: 0,
            crc32: '',
          }),
        ],
      }),
    ],
  });

  test.each(
    [
      GameSubdirModeInverted[GameSubdirMode.NEVER].toLowerCase(),
      GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
      GameSubdirModeInverted[GameSubdirMode.ALWAYS].toLowerCase(),
    ].map((mode) => [mode]),
  )(
    'raw-copies every track of a GD-ROM disc CHD to one output file per disc: "%s"',
    async (dirGameSubdir) => {
      const options = new Options({
        commands: ['copy'],
        output: os.devNull,
        dirGameSubdir,
      });

      for (const subGame of tosecGdRomMergedGame.getSubGames()) {
        const outputPaths = new Set<string>();
        for (const rom of subGame.getRoms()) {
          const outputPath = OutputFactory.getPath(
            options,
            dummyDat,
            tosecGdRomMergedGame,
            rom,
            await ArchiveEntry.entryOf({
              archive: new ChdBinCue(`${subGame.getName()}.chd`),
              entryPath: rom.getName(),
              size: 0,
              crc32: '',
            }),
          );
          outputPaths.add(outputPath.format());
        }

        // Every track of this disc collapses to exactly one output file named after the disc
        expect([...outputPaths]).toEqual([
          path.resolve(
            os.devNull,
            'Deep Fighter v1.001 (2000)(Ubi Soft)(PAL)(DE)[!]',
            `${subGame.getName()}.chd`,
          ),
        ]);
      }
    },
  );
});

describe('outputTokens.json', () => {
  it('should adhere to its schema', () => {
    const ajv = new Ajv();
    const validate = ajv.compile(outputTokensSchema);
    const isValid = validate(outputTokensData);
    expect(validate.errors).toBeNull();
    expect(isValid).toBe(true);
  });
});

describe('multi-rom games with path structure included in game name', () => {
  const game = new Game({
    name: 'Top10/A-D/Cool Game',
    roms: [
      new ROM({ name: 'Top10/A-D/Cool Game.cue', size: 0, crc32: '' }),
      new ROM({ name: 'Top10/A-D/Cool Game (Track 01).bin', size: 0, crc32: '' }),
    ],
  });

  it('should not duplicate directory structure for multi-ROM games', async () => {
    const options = new Options({
      commands: ['copy'],
      output: os.devNull,
      dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
    });

    const outputPaths = await Promise.all(
      game
        .getRoms()
        .map(async (rom) =>
          OutputFactory.getPath(options, dummyDat, game, rom, await rom.toFile()),
        ),
    );

    expect(outputPaths[0].format()).toEqual(path.join(os.devNull, 'Top10', 'A-D', 'Cool Game.cue'));
    expect(outputPaths[1].format()).toEqual(
      path.join(os.devNull, 'Top10', 'A-D', 'Cool Game (Track 01).bin'),
    );
  });
});
