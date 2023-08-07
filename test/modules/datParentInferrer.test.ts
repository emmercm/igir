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
  // https://www.tosecdev.org/tosec-naming-convention
  [[
    'Legend of TOSEC, The (19xx)',
    'Legend of TOSEC, The (200x)',
    'Legend of TOSEC, The (1986)',
    'Legend of TOSEC, The (199x)',
    'Legend of TOSEC, The (2001-01)',
    'Legend of TOSEC, The (1986-06-21)',
    'Legend of TOSEC, The (19xx-12)',
    'Legend of TOSEC, The (19xx-12-25)',
    'Legend of TOSEC, The (19xx-12-2x)',
  ], 'Legend of TOSEC, The (19xx)'],
  [[
    'Legend of TOSEC, The (1986)(Devstudio)(PAL)',
    'Legend of TOSEC, The (1986)(Devstudio)(NTSC)',
  ], 'Legend of TOSEC, The (1986)(Devstudio)(PAL)'],
  [[
    'Legend of TOSEC, The (1986)(Devstudio)(de)',
    'Legend of TOSEC, The (1986)(Devstudio)(pt)',
    'Legend of TOSEC, The (1986)(Devstudio)(de-fr)',
  ], 'Legend of TOSEC, The (1986)(Devstudio)(de)'],
  [[
    'Legend of TOSEC, The (1986)(Devstudio)(PD)',
    'Legend of TOSEC, The (1986)(Devstudio)(FR)(SW)',
  ], 'Legend of TOSEC, The (1986)(Devstudio)(PD)'],
  [[
    'Legend of TOSEC, The (1986)(Devstudio)(US)',
    'Legend of TOSEC, The (1986)(Devstudio)(US)(beta)',
    'Legend of TOSEC, The (1986)(Devstudio)(US)(proto)',
  ], 'Legend of TOSEC, The (1986)(Devstudio)(US)'],
  [[
    'Legend of TOSEC, The (1986)(Devstudio)(US)',
    'Legend of TOSEC, The (1986)(Devstudio)(US)[a]',
    'Legend of TOSEC, The (1986)(Devstudio)(US)[b]',
    'Legend of TOSEC, The (1986)(Devstudio)(US)[f]',
    'Legend of TOSEC, The (1986)(Devstudio)(US)[f NTSC]',
    'Legend of TOSEC, The (1986)(Devstudio)(US)[u]',
    'Legend of TOSEC, The (1986)(Devstudio)(US)[cr]',
    'Legend of TOSEC, The (1986)(Devstudio)(US)[tr fr]',
    'Legend of TOSEC, The (1986)(Devstudio)(US)[tr de-partial someguy]',
    'Legend of TOSEC, The (1986)(Devstudio)(US)[h Fairlight]',
    'Legend of TOSEC, The (1986)(Devstudio)(US)[m save game]',
    'Legend of TOSEC, The (1986)(Devstudio)(US)[o]',
  ], 'Legend of TOSEC, The (1986)(Devstudio)(US)'],
  [[
    'Legend of TOSEC, The (1986)(Devstudio)(US)',
    'Legend of TOSEC, The (1986)(Devstudio)(US)[cr PDX][h TRSi]',
    'Legend of TOSEC, The (1986)(Devstudio)(US)[h PDX - TRSi]',
  ], 'Legend of TOSEC, The (1986)(Devstudio)(US)'],
])('should group similar games: %s', async (gameNames, expectedGameName) => {
  const ungroupedDat = buildDat(gameNames);
  const groupedDat = await new DATParentInferrer(new ProgressBarFake()).infer(ungroupedDat);
  expect(groupedDat.getParents()).toHaveLength(1);
  expect(groupedDat.getParents()[0].getGames()).toHaveLength(ungroupedDat.getGames().length);
  expect(groupedDat.getParents()[0].getName()).toEqual(expectedGameName);
});

describe('dissimilar games', () => {
  test.each([
    [[
      'Jade Empire (USA, Europe) (En,Es,It)',
      'Jade Empire (USA, Europe) (En,Fr,De,Es,It) (Bonus Disc)',
    ]],
    [[
      'Mortal Kombat - Deception (USA)',
      'Mortal Kombat - Deception (USA) (Kollector\'s Edition Bonus Disc)',
    ]],
    [[
      'Final Fantasy VII (USA) (Disc 1)',
      'Final Fantasy VII (USA) (Disc 2)',
      'Final Fantasy VII (USA) (Disc 3)',
      'Final Fantasy VII (USA) (Interactive Sampler CD)',
      'Final Fantasy VII (USA) (Square Soft on PlayStation Previews)',
    ]],
  ])('should not group different discs', async (gameNames) => {
    const ungroupedDat = buildDat(gameNames);
    const groupedDat = await new DATParentInferrer(new ProgressBarFake()).infer(ungroupedDat);
    expect(groupedDat.getParents()).toHaveLength(gameNames.length);
    expect(groupedDat.getParents().every((parent) => parent.getGames().length === 1)).toEqual(true);
  });

  test.each([
    [[
      'Madden NFL 06 (USA)',
      'Madden NFL 07 (USA)',
      'Madden NFL 08 (USA)',
      'Madden NFL 09 (USA)',
      'Madden NFL 2002 (USA)',
      'Madden NFL 2003 (USA)',
      'Madden NFL 2004 (USA)',
      'Madden NFL 2005 (USA)',
    ]],
  ])('should not group different years', async (gameNames) => {
    const ungroupedDat = buildDat(gameNames);
    const groupedDat = await new DATParentInferrer(new ProgressBarFake()).infer(ungroupedDat);
    expect(groupedDat.getParents()).toHaveLength(gameNames.length);
    expect(groupedDat.getParents().every((parent) => parent.getGames().length === 1)).toEqual(true);
  });

  test.each([
    [[
      'Hitman - Blood Money (France)',
      'Hitman - Contracts (Europe)',
      'Hitman - Silent Assassin (Japan)',
    ]],
  ])('should not group different taglines', async (gameNames) => {
    const ungroupedDat = buildDat(gameNames);
    const groupedDat = await new DATParentInferrer(new ProgressBarFake()).infer(ungroupedDat);
    expect(groupedDat.getParents()).toHaveLength(gameNames.length);
    expect(groupedDat.getParents().every((parent) => parent.getGames().length === 1)).toEqual(true);
  });
});
