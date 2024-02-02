import 'jest-extended';

import DATCombiner from '../../src/modules/datCombiner.js';
import DAT from '../../src/types/dats/dat.js';
import Game from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import ProgressBarFake from '../console/progressBarFake.js';

function generateDummyDats(count: number): DAT[] {
  return [...Array.from({ length: count }).keys()]
    .map((dat) => new LogiqxDAT(
      new Header({ name: `DAT ${dat}` }),
      [...Array.from({ length: 100 }).keys()]
        .map((game) => new Game({ name: `Game ${game}` })),
    ));
}

test.each([
  [generateDummyDats(0)],
  [generateDummyDats(1)],
  [generateDummyDats(10)],
  [generateDummyDats(100)],
])('should combine with any number of dats: %s', (dats) => {
  const combinedDat = new DATCombiner(new ProgressBarFake()).combine(dats);

  expect(combinedDat.getGames())
    .toHaveLength(dats.reduce((sum, dat) => sum + dat.getGames().length, 0));

  const expectedGameNames = dats.flatMap((dat) => dat.getGames().map((game) => game.getName()));
  expect(combinedDat.getGames().map((game) => game.getName()))
    .toIncludeAllMembers(expectedGameNames);
});
