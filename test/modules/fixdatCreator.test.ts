import Logger from '../../src/console/logger.js';
import { LogLevel } from '../../src/console/logLevel.js';
import DATScanner from '../../src/modules/dats/datScanner.js';
import FixdatCreator from '../../src/modules/fixdatCreator.js';
import FsPoly from '../../src/polyfill/fsPoly.js';
import DAT from '../../src/types/dats/dat.js';
import Game from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import Release from '../../src/types/dats/release.js';
import ROM from '../../src/types/dats/rom.js';
import FileCache from '../../src/types/files/fileCache.js';
import FileFactory from '../../src/types/files/fileFactory.js';
import Options, { OptionsProps } from '../../src/types/options.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
import WriteCandidate from '../../src/types/writeCandidate.js';
import ProgressBarFake from '../console/progressBarFake.js';

const gameWithNoRoms = new Game({
  name: 'game with no ROMs',
});
const gameWithOneRom = new Game({
  name: 'game with one ROM',
  rom: new ROM({ name: 'one.rom', size: 1, crc32: '12345678' }),
  release: [new Release('game with one ROM', 'USA'), new Release('game with one ROM', 'EUR')],
});
const gameWithTwoRoms = new Game({
  name: 'game with two ROMs',
  rom: [
    new ROM({ name: 'two.a', size: 2, crc32: 'abcdef90' }),
    new ROM({ name: 'two.b', size: 3, crc32: '09876543' }),
  ],
});
const dat = new LogiqxDAT(new Header(), [gameWithNoRoms, gameWithOneRom, gameWithTwoRoms]);

async function generateCandidates(games: Game[]): Promise<WriteCandidate[]> {
  return Promise.all(
    games.map(
      async (game) =>
        new WriteCandidate(
          game,
          await Promise.all(
            game
              .getRoms()
              .map(async (rom) => new ROMWithFiles(rom, await rom.toFile(), await rom.toFile())),
          ),
        ),
    ),
  );
}

async function runFixdatCreator(
  optionsProps: OptionsProps,
  candidates: WriteCandidate[],
): Promise<DAT | undefined> {
  const fixdatPath = await new FixdatCreator(
    new Options(optionsProps),
    new ProgressBarFake(),
  ).create(dat, candidates);
  if (!fixdatPath) {
    return undefined;
  }

  await expect(FsPoly.exists(fixdatPath)).resolves.toEqual(true);

  try {
    return (
      await new DATScanner(
        new Options({
          ...optionsProps,
          dat: [fixdatPath],
        }),
        new ProgressBarFake(),
        new FileFactory(new FileCache(), new Logger(LogLevel.NEVER)),
      ).scan()
    )[0];
  } finally {
    await FsPoly.rm(fixdatPath, { force: true });
  }
}

it('should do nothing if the option is false', async () => {
  // Given only one game has all their ROMs present (game with no ROMs)
  const candidates = await generateCandidates([]);

  // When a fixdat is generated, but the option isn't provided
  const fixdat = await runFixdatCreator({ commands: [] }, candidates);

  // Then no fixdat was written
  expect(fixdat).toBeUndefined();
});

it('should do nothing if no ROMs are missing', async () => {
  // Given every game has all their ROMs present
  const candidates = await generateCandidates([gameWithOneRom, gameWithTwoRoms]);

  // When a fixdat is generated
  const fixdat = await runFixdatCreator({ commands: ['fixdat'] }, candidates);

  // Then no fixdat was written
  expect(fixdat).toBeUndefined();
});

it('should write some ROMs if some ROMs are missing', async () => {
  // Given two games that have all their ROMs present (game with no ROMs, game with two ROMs)
  const candidates = await generateCandidates([gameWithTwoRoms]);

  // When a fixdat is generated
  const fixdat = await runFixdatCreator({ commands: ['fixdat'] }, candidates);

  // Then only the game with no ROMs present should exist in the fixdat
  expect(fixdat).toBeDefined();
  const games = fixdat?.getGames() ?? [];
  expect(games).toHaveLength(1);
  expect(games[0].getName()).toEqual(gameWithOneRom.getName());
});

it('should write all ROMs if all ROMs are missing', async () => {
  // Given only one game has all their ROMs present (game with no ROMs)
  const candidates = await generateCandidates([]);

  // When a fixdat is generated
  const fixdat = await runFixdatCreator({ commands: ['fixdat'] }, candidates);

  // Then only the game with no ROMs present should exist in the fixdat
  expect(fixdat).toBeDefined();
  const games = fixdat?.getGames() ?? [];
  expect(games).toHaveLength(2);
  expect(games[0].getName()).toEqual(gameWithOneRom.getName());
  expect(games[1].getName()).toEqual(gameWithTwoRoms.getName());
});
