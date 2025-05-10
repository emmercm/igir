import 'jest-extended';

import DATCombiner from '../../../src/modules/dats/datCombiner.js';
import DAT from '../../../src/types/dats/dat.js';
import Game from '../../../src/types/dats/game.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
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

  const expectedGameNames = dats.flatMap((dat) => dat.getGames().map((game) => game.getName()));
  expect(combinedDat.getGames().map((game) => game.getName())).toIncludeAllMembers(
    expectedGameNames,
  );
});
