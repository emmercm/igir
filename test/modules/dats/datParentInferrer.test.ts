import DATParentInferrer from '../../../src/modules/dats/datParentInferrer.js';
import DAT from '../../../src/types/dats/dat.js';
import Game from '../../../src/types/dats/game.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

function buildDat(gameNames: string[]): DAT {
  return new LogiqxDAT(
    new Header(),
    gameNames.map((name) => new Game({ name })),
  );
}

it('should not do anything if the DAT has parent/clone info', () => {
  // Given
  const dat = new LogiqxDAT(new Header(), [
    new Game({ name: 'game one' }),
    new Game({ name: 'game two', cloneOf: 'game one' }),
  ]);

  // When
  const inferredDat = new DATParentInferrer(new Options(), new ProgressBarFake()).infer(dat);

  // Then
  expect(inferredDat === dat).toEqual(true);
});

it("should ignore the DAT's parent/clone info if specified", () => {
  // Given
  const options = new Options({
    datIgnoreParentClone: true,
  });
  const dat = new LogiqxDAT(new Header(), [
    new Game({ name: 'game one' }),
    new Game({ name: 'game two', cloneOf: 'game one' }),
  ]);

  // When
  const inferredDat = new DATParentInferrer(options, new ProgressBarFake()).infer(dat);

  // Then
  expect(inferredDat === dat).toEqual(false);
  expect(inferredDat.getParents()).toHaveLength(dat.getGames().length);
  expect(inferredDat.getParents().every((parent) => parent.getGames().length === 1)).toEqual(true);
});

it('should not do anything if the DAT has no games', () => {
  // Given
  const dat = new LogiqxDAT(new Header(), []);

  // When
  const inferredDat = new DATParentInferrer(new Options(), new ProgressBarFake()).infer(dat);

  // Then
  expect(inferredDat === dat).toEqual(true);
});

describe('similar games', () => {
  test.each([
    [
      [
        'Pikmin (Europe) (En,Fr,De,Es,It)',
        'Pikmin (Japan) (Jitsuen-you Sample)',
        'Pikmin (Japan) (Rev 1)',
        'Pikmin (Japan) (Rev 2)',
        'Pikmin (USA)',
        'Pikmin (USA) (Rev 1)',
      ],
      'Pikmin (Europe) (En,Fr,De,Es,It)',
    ],
    [
      [
        "Compton's Interactive Encyclopedia (USA) (Version 2.00S)",
        "Compton's Interactive Encyclopedia (USA) (Version 2.01R)",
        "Compton's Interactive Encyclopedia (USA) (Version 2.01S)",
        "Compton's Interactive Encyclopedia (USA) (Version 2.10) (RE2)",
      ],
      "Compton's Interactive Encyclopedia (USA) (Version 2.00S)",
    ],
    [
      [
        'Spyro the Dragon (Europe) (En,Fr,De,Es,It)',
        'Spyro the Dragon (Japan)',
        'Spyro the Dragon (Japan) (Demo)',
        'Spyro the Dragon (Japan) (Shokai Genteiban)',
        'Spyro the Dragon (USA)',
        'Spyro the Dragon (USA) (Beta) (1998-06-15)',
        'Spyro the Dragon (USA) (Beta) (1998-07-18)',
        'Spyro the Dragon (USA) (Demo 1)',
        'Spyro the Dragon (USA) (Demo 2)',
      ],
      'Spyro the Dragon (Europe) (En,Fr,De,Es,It)',
    ],
    [
      [
        'Dead or Alive (Europe)',
        'Dead or Alive (Europe) (Beta) (Alt)',
        'Dead or Alive (Japan)',
        'Dead or Alive (UK) (Demo)',
        'Dead or Alive (USA)',
        'Dead or Alive (USA) (Beta 1)',
        'Dead or Alive (USA) (Beta 2)',
        'Dead or Alive (USA) (En,Ja) (Demo)',
      ],
      'Dead or Alive (Europe)',
    ],
    [
      [
        'Secret of Monkey Island, The (Japan)',
        'Secret of Monkey Island, The (USA) (Limited Run Games)',
        'Secret of Monkey Island, The (USA) (RE)',
      ],
      'Secret of Monkey Island, The (Japan)',
    ],
    [
      [
        'Sewer Shark (Europe)',
        'Sewer Shark (USA)',
        'Sewer Shark (USA) (Not for Resale)',
        'Sewer Shark (USA) (Not for Resale) (Alt 1)',
        'Sewer Shark (USA) (Not for Resale) (Alt 2)',
        'Sewer Shark (USA) (Rev 1)',
      ],
      'Sewer Shark (Europe)',
    ],
    [
      [
        'Doom 3 (Europe) (En,Fr,Es,It)',
        "Doom 3 (Europe) (En,Fr,Es,It) (Limited Collector's Edition)",
        'Doom 3 (USA, Asia)',
        "Doom 3 (USA, Asia) (Limited Collector's Edition)",
      ],
      'Doom 3 (Europe) (En,Fr,Es,It)',
    ],
    [
      ["All Star Tennis '99 (Europe) (En,Fr,De,Es,It)", 'All Star Tennis 99 (USA)'],
      'All Star Tennis 99 (USA)',
    ],
    [
      [
        '[BIOS] PS3 System Software Update (World) (v4.88)',
        '[BIOS] PS3 System Software Update (World) (v3.41) (Patch)',
        '[BIOS] PS3 System Software Update (World) (v0.90) (Tool)',
        '[BIOS] PS3 System Software Update (World) (v0.91-005) (Tool)',
        '[BIOS] PS3 System Software Update (World) (v3.41) (Shop)',
        '[BIOS] PS3 System Software Update (World) (v3.41-1)',
        '[BIOS] PS3 System Software Update (World) (v1.60) (Debug) [b]',
        '[BIOS] PS3 System Software Update (World) (v1.00) (Disc)',
        '[BIOS] PS3 System Software Update (World) (v4.70) (Arcade)',
      ],
      '[BIOS] PS3 System Software Update (World) (v4.88)',
    ],
    // https://emulation.gametechwiki.com/index.php/GoodTools
    [
      [
        'A game (1990)(Side A).zip',
        'A game (1990)(Side A)[a].zip',
        'A game (1990)(Side A)[a2].zip',
        'A game (1990)(Side A)[a3].zip',
      ],
      'A game (1990)(Side A).zip',
    ],
    [
      [
        'Chu Chu Rocket (E) (M5) [!]',
        'Chu Chu Rocket (J) (M5) [!]',
        'Chu Chu Rocket (J) (M5) [f1]',
        'Chu Chu Rocket (J) (M5) [f2]',
        'Chu Chu Rocket (J) (M5) [f3]',
        'Chu Chu Rocket (U) (M5) [!]',
        'Chu Chu Rocket (U) (M5) [f1]',
        'Chu Chu Rocket (U) (M5) [f2]',
      ],
      'Chu Chu Rocket (E) (M5) [!]',
    ],
    [
      [
        'Mario Golf - Advance Tour (A)',
        'Mario Golf - Advance Tour (E)',
        'Mario Golf - Advance Tour (F)',
        'Mario Golf - Advance Tour (G)',
        'Mario Golf - Advance Tour (I)',
        'Mario Golf - Advance Tour (J)',
        'Mario Golf - Advance Tour (S)',
        'Mario Golf - Advance Tour (U)',
      ],
      'Mario Golf - Advance Tour (A)',
    ],
    [
      [
        'Tetris (Ch)',
        'Tetris (Ch) (Wxn)',
        'Tetris (E) [!]',
        'Tetris (E) [T+Rus_Cool-Spot]',
        'Tetris (E) [T+Rus_Cool-Spot][a1]',
        'Tetris (J) (REV0) [!]',
        'Tetris (J) (REV0) [a1]',
        'Tetris (J) (REV0) [b1]',
        'Tetris (J) (REV0) [b2]',
        'Tetris (J) (REV0) [b3]',
        'Tetris (J) (REV0) [o1]',
        'Tetris (J) (REV0) [o2]',
        'Tetris (J) (REV0) [o3]',
        'Tetris (J) (REV0) [T+Chi_MS emumax]',
        'Tetris (J) (REV0) [T+Chi_MS emumax][a1]',
        'Tetris (J) (REVA) [!]',
        'Tetris (PD)',
        'Tetris (U) [!]',
        'Tetris (U) [b1]',
        'Tetris (U) [b1][o1]',
        'Tetris (U) [b1][T+Bra100%_Emuroms]',
        'Tetris (U) [b2]',
        'Tetris (U) [b2][o1]',
        'Tetris (U) [b3]',
        'Tetris (U) [b4]',
        'Tetris (U) [b5]',
        'Tetris (U) [b6]',
        'Tetris (U) [b7]',
        'Tetris (U) [b8]',
        'Tetris (U) [T+Bra100%_Emuroms]',
        'Tetris (U) [T+Dut1.1_OK Impala!]',
        'Tetris (U) [T+Ita0.9b_ZombiKiller]',
        'Tetris (U) [T+Pol]',
        'Tetris (U) [T+Tur_Naito-TanUKi]',
        'Tetris (U) [T-Dut]',
        'Tetris (VS)',
        'Tetris (VS) [a1]',
      ],
      'Tetris (Ch)',
    ],
    // https://www.tosecdev.org/tosec-naming-convention
    [
      [
        'Legend of TOSEC, The (19xx)',
        'Legend of TOSEC, The (200x)',
        'Legend of TOSEC, The (1986)',
        'Legend of TOSEC, The (199x)',
        'Legend of TOSEC, The (2001-01)',
        'Legend of TOSEC, The (1986-06-21)',
        'Legend of TOSEC, The (19xx-12)',
        'Legend of TOSEC, The (19xx-12-25)',
        'Legend of TOSEC, The (19xx-12-2x)',
      ],
      'Legend of TOSEC, The (19xx)',
    ],
    [
      [
        'Legend of TOSEC, The (1986)(Devstudio)(PAL)',
        'Legend of TOSEC, The (1986)(Devstudio)(NTSC)',
      ],
      'Legend of TOSEC, The (1986)(Devstudio)(PAL)',
    ],
    [
      [
        'Legend of TOSEC, The (1986)(Devstudio)(de)',
        'Legend of TOSEC, The (1986)(Devstudio)(pt)',
        'Legend of TOSEC, The (1986)(Devstudio)(de-fr)',
      ],
      'Legend of TOSEC, The (1986)(Devstudio)(de)',
    ],
    [
      [
        'Legend of TOSEC, The (1986)(Devstudio)(PD)',
        'Legend of TOSEC, The (1986)(Devstudio)(FR)(SW)',
      ],
      'Legend of TOSEC, The (1986)(Devstudio)(PD)',
    ],
    [
      [
        'Legend of TOSEC, The (1986)(Devstudio)(US)',
        'Legend of TOSEC, The (1986)(Devstudio)(US)(beta)',
        'Legend of TOSEC, The (1986)(Devstudio)(US)(proto)',
      ],
      'Legend of TOSEC, The (1986)(Devstudio)(US)',
    ],
    [
      [
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
      ],
      'Legend of TOSEC, The (1986)(Devstudio)(US)',
    ],
    [
      [
        'Legend of TOSEC, The (1986)(Devstudio)(US)',
        'Legend of TOSEC, The (1986)(Devstudio)(US)[cr PDX][h TRSi]',
        'Legend of TOSEC, The (1986)(Devstudio)(US)[h PDX - TRSi]',
      ],
      'Legend of TOSEC, The (1986)(Devstudio)(US)',
    ],
    [
      [
        'F1 World Grand Prix for Dreamcast v1.011 (1999)(Video System)(JP)(en)[!]',
        'F1 World Grand Prix for Dreamcast v1.000 (1999)(Video System)(PAL)(M4)[!]',
        'F1 World Grand Prix v1.006 (2000)(Video System)(US)(M4)[!]',
      ],
      'F1 World Grand Prix for Dreamcast v1.011 (1999)(Video System)(JP)(en)[!]',
    ],
    [
      [
        '18 Wheeler - American Pro Trucker (2001)(Sega)(US)',
        '18 Wheeler - American Pro Trucker v1.006 (2000)(Sega)(JP)(en)[!]',
        '18 Wheeler - American Pro Trucker v1.500 (2001)(Sega)(US)[!]',
        '18 Wheeler - American Pro Trucker v1.700 (2001)(Sega)(PAL)(M4)[!]',
      ],
      '18 Wheeler - American Pro Trucker (2001)(Sega)(US)',
    ],
    [
      [
        'Airforce Delta v1.000 (1999)(Konami)(US)[!][1S]',
        'Airforce Delta v1.000 (1999)(Konami)(US)[!][2S]',
        'Airforce Delta v1.000 (1999)(Konami)(US)[3S]',
        'Airforce Delta v1.002 (1999)(Konami)(JP)[!]',
      ],
      'Airforce Delta v1.000 (1999)(Konami)(US)[!][1S]',
    ],
    [
      [
        'Biohazard - Code Veronica Shokai Genteiban v1.002 (1999)(Capcom)(JP)(Disc 1 of 2)[!][2, 3]',
        'Biohazard - Code Veronica Shokai Genteiban v1.002 (1999)(Capcom)(JP)(Disc 1 of 2)[!][2M1, 2M3, 2MB1]',
        'Biohazard - Code Veronica Shokai Genteiban v1.002 (1999)(Capcom)(JP)(Disc 1 of 2)[!][HK112D, HK112E]',
      ],
      'Biohazard - Code Veronica Shokai Genteiban v1.002 (1999)(Capcom)(JP)(Disc 1 of 2)[!][2, 3]',
    ],
    [
      [
        'Comic Party v2.001 (2001)(Aqua Plus)(JP)(Disc 1 of 2)[!][10MM1]',
        'Comic Party v2.001 (2001)(Aqua Plus)(JP)(Disc 1 of 2)[!][12MM1]',
        'Comic Party v2.001 (2001)(Aqua Plus)(JP)(Disc 1 of 2)[!][14M1]',
        'Comic Party v2.001 (2001)(Aqua Plus)(JP)(Disc 1 of 2)[!][15M1, 15M2]',
        'Comic Party v3.004 (2001)(Aqua Plus)(JP)(Disc 1 of 2)[!]',
      ],
      'Comic Party v2.001 (2001)(Aqua Plus)(JP)(Disc 1 of 2)[!][10MM1]',
    ],
    [
      [
        'Generator Vol. 1 v1.002 (1999)(Sega)(US)[!][14S]',
        'Generator Vol. 1 v1.002 (1999)(Sega)(US)[!][1M5, 1MM1]',
        'Generator Vol. 1 v1.002 (1999)(Sega)(US)[!][2MB13, 2MB14, 2MB32]',
        'Generator Vol. 1 v1.002 (1999)(Sega)(US)[!][2MB3, 7MM1]',
        'Generator Vol. 1 v1.002 (1999)(Sega)(US)[!][5M2, 5M3]',
        'Generator Vol. 1 v1.002 (1999)(Sega)(US)[!][8MB1, 8MB4]',
        'Generator Vol. 1 v1.002 (1999)(Sega)(US)[3MM1]',
        'Generator Vol. 1 v1.010 (1999)(Sega)(JP)(en)[!]',
      ],
      'Generator Vol. 1 v1.002 (1999)(Sega)(US)[!][14S]',
    ],
    [
      [
        'NFL 2K v1.007 (1999)(Sega)(US)[!][10S]',
        'NFL 2K v1.007 (1999)(Sega)(US)[!][13S]',
        'NFL 2K v1.007 (1999)(Sega)(US)[!][9S]',
        'NFL 2K v1.007 (1999)(Sega)(US)[!][MT B08, B13, B17, B19, B20]',
      ],
      'NFL 2K v1.007 (1999)(Sega)(US)[!][10S]',
    ],
  ])('should group similar games: %s', (gameNames, expectedGameName) => {
    const ungroupedDat = buildDat(gameNames);
    const groupedDat = new DATParentInferrer(new Options(), new ProgressBarFake()).infer(
      ungroupedDat,
    );
    expect(groupedDat.getParents()).toHaveLength(1);
    expect(groupedDat.getParents()[0].getGames()).toHaveLength(ungroupedDat.getGames().length);
    expect(groupedDat.getParents()[0].getName()).toEqual(expectedGameName);
  });
});

describe('dissimilar games', () => {
  test.each([
    [
      [
        'Jade Empire (USA, Europe) (En,Es,It)',
        'Jade Empire (USA, Europe) (En,Fr,De,Es,It) (Bonus Disc)',
      ],
    ],
    [
      [
        'Mortal Kombat - Deception (USA)',
        "Mortal Kombat - Deception (USA) (Kollector's Edition Bonus Disc)",
      ],
    ],
    [
      [
        'Final Fantasy VII (USA) (Disc 1)',
        'Final Fantasy VII (USA) (Disc 2)',
        'Final Fantasy VII (USA) (Disc 3)',
        'Final Fantasy VII (USA) (Interactive Sampler CD)',
        'Final Fantasy VII (USA) (Square Soft on PlayStation Previews)',
      ],
    ],
  ])('should not group different discs', (gameNames) => {
    const ungroupedDat = buildDat(gameNames);
    const groupedDat = new DATParentInferrer(new Options(), new ProgressBarFake()).infer(
      ungroupedDat,
    );
    expect(groupedDat.getParents()).toHaveLength(gameNames.length);
    expect(groupedDat.getParents().every((parent) => parent.getGames().length === 1)).toEqual(true);
  });

  test.each([
    [
      [
        'Madden NFL 06 (USA)',
        'Madden NFL 07 (USA)',
        'Madden NFL 08 (USA)',
        'Madden NFL 09 (USA)',
        'Madden NFL 2002 (USA)',
        'Madden NFL 2003 (USA)',
        'Madden NFL 2004 (USA)',
        'Madden NFL 2005 (USA)',
      ],
    ],
  ])('should not group different years', (gameNames) => {
    const ungroupedDat = buildDat(gameNames);
    const groupedDat = new DATParentInferrer(new Options(), new ProgressBarFake()).infer(
      ungroupedDat,
    );
    expect(groupedDat.getParents()).toHaveLength(gameNames.length);
    expect(groupedDat.getParents().every((parent) => parent.getGames().length === 1)).toEqual(true);
  });

  test.each([
    [
      [
        'Hitman - Blood Money (France)',
        'Hitman - Contracts (Europe)',
        'Hitman - Silent Assassin (Japan)',
      ],
    ],
  ])('should not group different taglines', (gameNames) => {
    const ungroupedDat = buildDat(gameNames);
    const groupedDat = new DATParentInferrer(new Options(), new ProgressBarFake()).infer(
      ungroupedDat,
    );
    expect(groupedDat.getParents()).toHaveLength(gameNames.length);
    expect(groupedDat.getParents().every((parent) => parent.getGames().length === 1)).toEqual(true);
  });
});
