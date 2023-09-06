import DATScanner from '../../src/modules/datScanner.js';
import FixdatCreator from '../../src/modules/fixdatCreator.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import DAT from '../../src/types/dats/dat.js';
import Game from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import Parent from '../../src/types/dats/parent.js';
import ROM from '../../src/types/dats/rom.js';
import Options, { OptionsProps } from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
import ProgressBarFake from '../console/progressBarFake.js';

const gameWithNoRoms = new Game({
  name: 'game with no ROMs',
});
const gameWithOneRom = new Game({
  name: 'game with one ROM',
  rom: new ROM('one.rom', 1, '12345678'),
});
const gameWithTwoRoms = new Game({
  name: 'game with two ROMs',
  rom: [
    new ROM('two.a', 2, 'abcdef90'),
    new ROM('two.b', 3, '09876543'),
  ],
});
const dat = new LogiqxDAT(new Header(), [gameWithNoRoms, gameWithOneRom, gameWithTwoRoms]);

/**
 * Generate a {@link Parent} with all if its {@link ReleaseCandidate}s for every {@link Game} given.
 */
async function generateParentsToCandidates(
  games: Game[],
): Promise<Map<Parent, ReleaseCandidate[]>> {
  const entries = await Promise.all(games.map(async (game) => [
    new Parent(game.getName(), game),
    [new ReleaseCandidate(
      game,
      undefined,
      await Promise.all(game.getRoms().map(async (rom) => new ROMWithFiles(
        rom,
        await rom.toFile(),
        await rom.toFile(),
      ))),
    )],
  ])) as [[Parent, ReleaseCandidate[]]];

  return new Map(entries);
}

async function runFixdatCreator(
  optionsProps: OptionsProps,
  parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
): Promise<DAT | undefined> {
  const fixdatPath = await new FixdatCreator(new Options(optionsProps), new ProgressBarFake())
    .write(dat, parentsToCandidates);
  if (!fixdatPath) {
    return undefined;
  }

  await expect(fsPoly.exists(fixdatPath)).resolves.toEqual(true);

  const fixdat = (await new DATScanner(new Options({
    ...optionsProps,
    dat: [fixdatPath],
  }), new ProgressBarFake()).scan())[0];

  await fsPoly.rm(fixdatPath, { force: true });

  return fixdat;
}

it('should do nothing if the option is false', async () => {
  // Given only one game has all their ROMs present (game with no ROMs)
  const parentsToCandidates = await generateParentsToCandidates([]);

  // When a fixdat is generated, but the option isn't provided
  const fixdat = await runFixdatCreator(
    { fixdat: false },
    parentsToCandidates,
  );

  // Then no fixdat was written
  expect(fixdat).toBeUndefined();
});

it('should do nothing if no ROMs are missing', async () => {
  // Given every game has all their ROMs present
  const parentsToCandidates = await generateParentsToCandidates([gameWithOneRom, gameWithTwoRoms]);

  // When a fixdat is generated
  const fixdat = await runFixdatCreator(
    { fixdat: true },
    parentsToCandidates,
  );

  // Then no fixdat was written
  expect(fixdat).toBeUndefined();
});

it('should write some ROMs if some ROMs are missing', async () => {
  // Given two games that have all their ROMs present (game with no ROMs, game with two ROMs)
  const parentsToCandidates = await generateParentsToCandidates([gameWithTwoRoms]);

  // When a fixdat is generated
  const fixdat = await runFixdatCreator(
    { fixdat: true },
    parentsToCandidates,
  );

  // Then only the game with no ROMs present should exist in the fixdat
  expect(fixdat).toBeDefined();
  const games = fixdat?.getGames() ?? [];
  expect(games).toHaveLength(1);
  expect(games[0].getName()).toEqual(gameWithOneRom.getName());
});

it('should write all ROMs if all ROMs are missing', async () => {
  // Given only one game has all their ROMs present (game with no ROMs)
  const parentsToCandidates = await generateParentsToCandidates([]);

  // When a fixdat is generated
  const fixdat = await runFixdatCreator(
    { fixdat: true },
    parentsToCandidates,
  );

  // Then only the game with no ROMs present should exist in the fixdat
  expect(fixdat).toBeDefined();
  const games = fixdat?.getGames() ?? [];
  expect(games).toHaveLength(2);
  expect(games[0].getName()).toEqual(gameWithOneRom.getName());
  expect(games[1].getName()).toEqual(gameWithTwoRoms.getName());
});
