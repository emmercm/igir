import type DAT from '../../../src/models/dats/dat.js';
import Game from '../../../src/models/dats/game.js';
import Header from '../../../src/models/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/models/dats/logiqx/logiqxDat.js';
import MameDAT from '../../../src/models/dats/mame/mameDat.js';
import DATCombiner from '../../../src/modules/dats/datCombiner.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const GAME_COUNT = 100;

function generateDummyDats(count: number): DAT[] {
  return [...Array.from({ length: count }).keys()].map(
    (dat) =>
      new LogiqxDAT({
        header: new Header({ name: `DAT ${dat}` }),
        games: [...Array.from({ length: GAME_COUNT }).keys()].map(
          (game) => new Game({ name: `Game ${game}` }),
        ),
      }),
  );
}

test('should do nothing with no DATs', () => {
  const combinedDat = new DATCombiner(new ProgressBarFake()).combine([]);

  expect(combinedDat.getGames()).toHaveLength(0);
});

test.each([[1], [10], [100]])('should combine with any number of DATs: %s', (datCount) => {
  const dats = generateDummyDats(datCount);
  const combinedDat = new DATCombiner(new ProgressBarFake()).combine(dats);

  expect(combinedDat.getGames()).toHaveLength(GAME_COUNT);

  const expectedGameNames = new Set(
    dats.flatMap((dat) => dat.getGames().map((game) => game.getName())),
  );
  expect(
    combinedDat
      .getGames()
      .map((game) => game.getName())
      .toSorted(),
  ).toEqual([...expectedGameNames].toSorted());
});

test('should not be MAME when no source DAT is MAME', () => {
  const dats = generateDummyDats(3);
  const combinedDat = new DATCombiner(new ProgressBarFake()).combine(dats);

  expect(combinedDat.isMame()).toEqual(false);
});

test('should be MAME when any source DAT is MAME', () => {
  const dats: DAT[] = [
    new LogiqxDAT({
      header: new Header({ name: 'Logiqx' }),
      games: [new Game({ name: 'Logiqx Game' })],
    }),
    new MameDAT({
      machine: [new Game({ name: 'MAME Machine' })],
    }),
  ];
  const combinedDat = new DATCombiner(new ProgressBarFake()).combine(dats);

  expect(combinedDat.isMame()).toEqual(true);
  expect(
    combinedDat
      .getGames()
      .map((game) => game.getName())
      .toSorted(),
  ).toEqual(['Logiqx Game', 'MAME Machine']);
});
