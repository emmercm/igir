import DATParentInferrer from '../../src/modules/datParentInferrer.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import ProgressBarFake from '../console/progressBarFake.js';

function buildDat(gameNames: string[]): DAT {
  return new DAT(
    new Header(),
    gameNames.map((name) => new Game({ name })),
  );
}

test.each([
  [[
    'Pikmin (Europe) (En,Fr,De,Es,It)',
    'Pikmin (Japan) (Jitsuen-you Sample)',
    'Pikmin (Japan) (Rev 1)',
    'Pikmin (Japan) (Rev 2)',
    'Pikmin (USA)',
    'Pikmin (USA) (Rev 1)',
  ], 'Pikmin (Europe) (En,Fr,De,Es,It)'],
  [[
    'Compton\'s Interactive Encyclopedia (USA) (Version 2.00S)',
    'Compton\'s Interactive Encyclopedia (USA) (Version 2.01R)',
    'Compton\'s Interactive Encyclopedia (USA) (Version 2.01S)',
    'Compton\'s Interactive Encyclopedia (USA) (Version 2.10) (RE2)',
  ], 'Compton\'s Interactive Encyclopedia (USA) (Version 2.00S)'],
  [[
    'Spyro the Dragon (Europe) (En,Fr,De,Es,It)',
    'Spyro the Dragon (Japan)',
    'Spyro the Dragon (Japan) (Demo)',
    'Spyro the Dragon (Japan) (Shokai Genteiban)',
    'Spyro the Dragon (USA)',
    'Spyro the Dragon (USA) (Beta) (1998-06-15)',
    'Spyro the Dragon (USA) (Beta) (1998-07-18)',
    'Spyro the Dragon (USA) (Demo 1)',
    'Spyro the Dragon (USA) (Demo 2)',
  ], 'Spyro the Dragon (Europe) (En,Fr,De,Es,It)'],
  [[
    'Dead or Alive (Europe)',
    'Dead or Alive (Europe) (Beta) (Alt)',
    'Dead or Alive (Japan)',
    'Dead or Alive (UK) (Demo)',
    'Dead or Alive (USA)',
    'Dead or Alive (USA) (Beta 1)',
    'Dead or Alive (USA) (Beta 2)',
    'Dead or Alive (USA) (En,Ja) (Demo)',
  ], 'Dead or Alive (Europe)'],
  [[
    'Secret of Monkey Island, The (Japan)',
    'Secret of Monkey Island, The (USA) (Limited Run Games)',
    'Secret of Monkey Island, The (USA) (RE)',
  ], 'Secret of Monkey Island, The (Japan)'],
  [[
    'Sewer Shark (Europe)',
    'Sewer Shark (USA)',
    'Sewer Shark (USA) (Not for Resale)',
    'Sewer Shark (USA) (Not for Resale) (Alt 1)',
    'Sewer Shark (USA) (Not for Resale) (Alt 2)',
    'Sewer Shark (USA) (Rev 1)',
  ], 'Sewer Shark (Europe)'],
  [[
    'Doom 3 (Europe) (En,Fr,Es,It)',
    'Doom 3 (Europe) (En,Fr,Es,It) (Limited Collector\'s Edition)',
    'Doom 3 (USA, Asia)',
    'Doom 3 (USA, Asia) (Limited Collector\'s Edition)',
  ], 'Doom 3 (Europe) (En,Fr,Es,It)'],
])('should group similar games', async (gameNames, expectedGameName) => {
  const ungroupedDat = buildDat(gameNames);
  const groupedDat = await new DATParentInferrer(new ProgressBarFake()).infer(ungroupedDat);
  expect(groupedDat.getParents()).toHaveLength(1);
  expect(groupedDat.getParents()[0].getGames()).toHaveLength(ungroupedDat.getGames().length);
  expect(groupedDat.getParents()[0].getName()).toEqual(expectedGameName);
});

describe('dissimilar games', () => {
  it('should not group different discs', () => {
    // TODO(cemmer)

    /**
     * Jade Empire (Korea) (En,Zh,Ko)
     * Jade Empire (Korea) (En,Zh,Ko) (Bonus Disc)
     * Jade Empire (USA, Europe) (En,Es,It)
     * Jade Empire (USA, Europe) (En,Fr,De,Es,It) (Bonus Disc)
     *
     * Mortal Kombat - Deception (Europe) (En,Fr,De,Es,It)
     * Mortal Kombat - Deception (Germany) (En,Fr,De,Es,It)
     * Mortal Kombat - Deception (USA)
     * Mortal Kombat - Deception (USA) (Kollector's Edition Bonus Disc)
     */
  });

  /**
   * different years
   *
   * Madden NFL 06 (Europe)
   * Madden NFL 06 (USA)
   * Madden NFL 07 (Europe)
   * Madden NFL 07 (USA)
   * Madden NFL 08 (USA)
   * Madden NFL 08 (USA) (Beta)
   * Madden NFL 09 (USA)
   * Madden NFL 2002 (USA)
   * Madden NFL 2003 (Europe)
   * Madden NFL 2003 (USA)
   * Madden NFL 2004 (Europe)
   * Madden NFL 2004 (USA)
   * Madden NFL 2004 (USA) (Rev 1)
   * Madden NFL 2005 (Europe)
   * Madden NFL 2005 (USA)
   */

  /**
   * different taglines
   *
   * Hitman - Blood Money (France)
   * Hitman - Blood Money (Germany)
   * Hitman - Blood Money (USA, Europe)
   * Hitman - Contracts (Europe)
   * Hitman - Contracts (France)
   * Hitman - Contracts (Germany)
   * Hitman - Contracts (Italy)
   * Hitman - Contracts (Japan)
   * Hitman - Contracts (Spain)
   * Hitman - Contracts (USA)
   * Hitman - Silent Assassin (Japan)
   */
});
