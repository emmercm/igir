import path from 'node:path';

import Game from '../../../src/models/dats/game.js';
import Header from '../../../src/models/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/models/dats/logiqx/logiqxDat.js';
import MergedDiscGame from '../../../src/models/dats/mergedDiscGame.js';
import ROM from '../../../src/models/dats/rom.js';
import Options from '../../../src/models/options.js';
import DATDiscMerger from '../../../src/modules/dats/datDiscMerger.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const singleDiscGames: Game[] = [
  // Redump
  new Game({
    // PlayStation 1
    name: 'Metal Gear Solid - VR Missions (USA)',
    categories: 'Games',
    description: 'Metal Gear Solid - VR Missions (USA)',
    roms: [
      new ROM({ name: 'Metal Gear Solid - VR Missions (USA).cue', size: 102, crc32: '7a5818df' }),
      new ROM({
        name: 'Metal Gear Solid - VR Missions (USA).bin',
        size: 492_487_632,
        crc32: '30e61ff3',
      }),
    ],
  }),
  new Game({
    // Dreamcast
    name: 'Jet Grind Radio (USA)',
    categories: 'Games',
    description: 'Gauntlet Legends (USA)',
    roms: [
      new ROM({ name: 'Jet Grind Radio (USA).cue', size: 357, crc32: '96f06d56' }),
      new ROM({ name: 'Jet Grind Radio (USA) (Track 1).bin', size: 1_425_312, crc32: 'af3d3ea0' }),
      new ROM({ name: 'Jet Grind Radio (USA) (Track 2).bin', size: 1_589_952, crc32: '8557fcaa' }),
      new ROM({
        name: 'Jet Grind Radio (USA) (Track 3).bin',
        size: 1_185_760_800,
        crc32: '17ad284b',
      }),
    ],
  }),
  // TOSEC
  new Game({
    // Dreamcast
    name: 'Seaman v1.001 (2000)(Sega)(US)[!][req. microphone]',
    description: 'Seaman v1.001 (2000)(Sega)(US)[!][req. microphone]',
    roms: [
      new ROM({
        name: 'Seaman v1.001 (2000)(Sega)(US)[!][req. microphone].gdi',
        size: 88,
        crc32: '49df7865',
      }),
      new ROM({ name: 'track01.bin', size: 3_749_088, crc32: '2f500c1d' }),
      new ROM({ name: 'track02.raw', size: 3_262_224, crc32: '0b268e35' }),
      new ROM({ name: 'track03.bin', size: 1_185_760_800, crc32: '18a5c480' }),
    ],
  }),
];

const multiDiscGames: Game[] = [
  // Redump
  new Game({
    name: 'Final Fantasy IX (USA) (Disc 1)',
    categories: 'Games',
    description: 'Final Fantasy IX (USA) (Disc 1)',
    roms: [
      new ROM({ name: 'Final Fantasy IX (USA) (Disc 1).cue', size: 97, crc32: '141d342f' }),
      new ROM({
        name: 'Final Fantasy IX (USA) (Disc 1).bin',
        size: 740_715_360,
        crc32: '49521342',
      }),
    ],
  }),
  new Game({
    name: 'Final Fantasy IX (USA) (Disc 2)',
    categories: 'Games',
    description: 'Final Fantasy IX (USA) (Disc 2)',
    roms: [
      new ROM({ name: 'Final Fantasy IX (USA) (Disc 2).cue', size: 97, crc32: '154012fe' }),
      new ROM({
        name: 'Final Fantasy IX (USA) (Disc 2).bin',
        size: 689_004_288,
        crc32: 'dfef08c8',
      }),
    ],
  }),
  new Game({
    name: 'Final Fantasy IX (USA) (Disc 3)',
    categories: 'Games',
    description: 'Final Fantasy IX (USA) (Disc 3)',
    roms: [
      new ROM({ name: 'Final Fantasy IX (USA) (Disc 3).cue', size: 97, crc32: 'a35bf28e' }),
      new ROM({
        name: 'Final Fantasy IX (USA) (Disc 3).bin',
        size: 729_755_040,
        crc32: 'cdc64cac',
      }),
    ],
  }),
  new Game({
    name: 'Final Fantasy IX (USA) (Disc 4)',
    categories: 'Games',
    description: 'Final Fantasy IX (USA) (Disc 4)',
    roms: [
      new ROM({ name: 'Final Fantasy IX (USA) (Disc 4).cue', size: 97, crc32: '17fa5f5c' }),
      new ROM({
        name: 'Final Fantasy IX (USA) (Disc 4).bin',
        size: 688_413_936,
        crc32: '15a5e12b',
      }),
    ],
  }),
  // TOSEC
  new Game({
    name: 'Tales of Symphonia (2004)(Namco)(US)(Disc 1 of 2)',
    description: 'Tales of Symphonia (2004)(Namco)(US)(Disc 1 of 2)',
    roms: new ROM({
      name: 'Tales of Symphonia (2004)(Namco)(US)(Disc 1 of 2).iso',
      size: 1_459_978_240,
      crc32: '7fe3b9f7',
    }),
  }),
  new Game({
    name: 'Tales of Symphonia (2004)(Namco)(US)(Disc 2 of 2)',
    description: 'Tales of Symphonia (2004)(Namco)(US)(Disc 2 of 2)',
    roms: new ROM({
      name: 'Tales of Symphonia (2004)(Namco)(US)(Disc 2 of 2).iso',
      size: 1_459_978_240,
      crc32: 'a65645eb',
    }),
  }),
];

const multiDiscGamesWithConflictingRoms: Game[] = [
  // TOSEC
  new Game({
    name: 'D2 v1.000 (2000)(Sega)(US)(Disc 1 of 4)[!][10S]',
    description: 'D2 v1.000 (2000)(Sega)(US)(Disc 1 of 4)[!][10S]',
    roms: [
      new ROM({
        name: 'D2 v1.000 (2000)(Sega)(US)(Disc 1 of 4)[!][10S].gdi',
        size: 87,
        crc32: '468c1495',
      }),
      new ROM({ name: 'track01.bin', size: 1_058_400, crc32: '9f60d77d' }),
      new ROM({ name: 'track02.raw', size: 1_237_152, crc32: '0640c2bc' }),
      new ROM({ name: 'track03.bin', size: 1_185_760_800, crc32: '595b2ae7' }),
    ],
  }),
  new Game({
    name: 'D2 v1.000 (2000)(Sega)(US)(Disc 2 of 4)[!][13S]',
    description: 'D2 v1.000 (2000)(Sega)(US)(Disc 2 of 4)[!][13S]',
    roms: [
      new ROM({
        name: 'D2 v1.000 (2000)(Sega)(US)(Disc 2 of 4)[!][13S].gdi',
        size: 87,
        crc32: '468c1495',
      }),
      new ROM({ name: 'track01.bin', size: 1_058_400, crc32: 'f8fa0170' }),
      new ROM({ name: 'track02.raw', size: 1_237_152, crc32: '60846198' }),
      new ROM({ name: 'track03.bin', size: 1_185_760_800, crc32: '82cee4bf' }),
    ],
  }),
  new Game({
    name: 'D2 v1.000 (2000)(Sega)(US)(Disc 3 of 4)[!]',
    description: 'D2 v1.000 (2000)(Sega)(US)(Disc 3 of 4)[!]',
    roms: [
      new ROM({
        name: 'D2 v1.000 (2000)(Sega)(US)(Disc 3 of 4)[!].gdi',
        size: 87,
        crc32: '468c1495',
      }),
      new ROM({ name: 'track01.bin', size: 1_058_400, crc32: 'fd4d2f58' }),
      new ROM({ name: 'track02.raw', size: 1_237_152, crc32: 'a47d5891' }),
      new ROM({ name: 'track03.bin', size: 1_185_760_800, crc32: '652e9137' }),
    ],
  }),
  new Game({
    name: 'D2 v1.000 (2000)(Sega)(US)(Disc 4 of 4)[!][4S]',
    description: 'D2 v1.000 (2000)(Sega)(US)(Disc 4 of 4)[!][4S]',
    roms: [
      new ROM({
        name: 'D2 v1.000 (2000)(Sega)(US)(Disc 4 of 4)[!][4S].gdi',
        size: 87,
        crc32: '468c1495',
      }),
      new ROM({ name: 'track01.bin', size: 1_058_400, crc32: '50534e1a' }),
      new ROM({ name: 'track02.raw', size: 1_237_152, crc32: 'fed00b48' }),
      new ROM({ name: 'track03.bin', size: 1_185_760_800, crc32: 'd2c97d6b' }),
    ],
  }),
];

it('should do nothing if no games are present', () => {
  const options = new Options({ mergeDiscs: true });
  const dat = new LogiqxDAT({ header: new Header() });

  const result = new DATDiscMerger(options, new ProgressBarFake()).merge(dat);

  expect(result).toEqual(dat);
});

it('should do nothing if option not enabled', () => {
  const options = new Options({ mergeDiscs: false });
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [...singleDiscGames, ...multiDiscGames, ...multiDiscGamesWithConflictingRoms],
  });

  const result = new DATDiscMerger(options, new ProgressBarFake()).merge(dat);

  expect(result).toEqual(dat);
});

it('should do nothing if no multi-disc games', () => {
  const options = new Options({ mergeDiscs: true });
  const dat = new LogiqxDAT({ header: new Header(), games: singleDiscGames });

  const result = new DATDiscMerger(options, new ProgressBarFake()).merge(dat);

  expect(result.getParents()).toHaveLength(dat.getParents().length);
  expect(result.getGames()).toHaveLength(dat.getGames().length);
});

it('should merge multi-disc games and leave single disc games alone', () => {
  const options = new Options({ mergeDiscs: true });
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [...singleDiscGames, ...multiDiscGames, ...multiDiscGamesWithConflictingRoms],
  });

  const result = new DATDiscMerger(options, new ProgressBarFake()).merge(dat);

  expect(result.getParents()).not.toHaveLength(dat.getParents().length);
  expect(result.getGames()).not.toHaveLength(dat.getGames().length);

  expect(
    result
      .getGames()
      .map((game) => [game.getName(), game.getRoms().map((rom) => rom.getName())])
      .toSorted(),
  ).toEqual([
    [
      'D2 v1.000 (2000)(Sega)(US)(Disc 1 of 4)[!][10S]',
      [
        'D2 v1.000 (2000)(Sega)(US)(Disc 1 of 4)[!][10S].gdi',
        'track01.bin',
        'track02.raw',
        'track03.bin',
      ],
    ],
    [
      'D2 v1.000 (2000)(Sega)(US)(Disc 2 of 4)[!][13S]',
      [
        'D2 v1.000 (2000)(Sega)(US)(Disc 2 of 4)[!][13S].gdi',
        'track01.bin',
        'track02.raw',
        'track03.bin',
      ],
    ],
    [
      'D2 v1.000 (2000)(Sega)(US)(Disc 3 of 4)[!]',
      [
        'D2 v1.000 (2000)(Sega)(US)(Disc 3 of 4)[!].gdi',
        'track01.bin',
        'track02.raw',
        'track03.bin',
      ],
    ],
    [
      'D2 v1.000 (2000)(Sega)(US)(Disc 4 of 4)[!][4S]',
      [
        'D2 v1.000 (2000)(Sega)(US)(Disc 4 of 4)[!][4S].gdi',
        'track01.bin',
        'track02.raw',
        'track03.bin',
      ],
    ],
    [
      'Final Fantasy IX (USA)',
      [
        'Final Fantasy IX (USA) (Disc 1).cue',
        'Final Fantasy IX (USA) (Disc 1).bin',
        'Final Fantasy IX (USA) (Disc 2).cue',
        'Final Fantasy IX (USA) (Disc 2).bin',
        'Final Fantasy IX (USA) (Disc 3).cue',
        'Final Fantasy IX (USA) (Disc 3).bin',
        'Final Fantasy IX (USA) (Disc 4).cue',
        'Final Fantasy IX (USA) (Disc 4).bin',
      ],
    ],
    [
      'Jet Grind Radio (USA)',
      [
        'Jet Grind Radio (USA).cue',
        'Jet Grind Radio (USA) (Track 1).bin',
        'Jet Grind Radio (USA) (Track 2).bin',
        'Jet Grind Radio (USA) (Track 3).bin',
      ],
    ],
    [
      'Metal Gear Solid - VR Missions (USA)',
      ['Metal Gear Solid - VR Missions (USA).cue', 'Metal Gear Solid - VR Missions (USA).bin'],
    ],
    [
      'Seaman v1.001 (2000)(Sega)(US)[!][req. microphone]',
      [
        'Seaman v1.001 (2000)(Sega)(US)[!][req. microphone].gdi',
        'track01.bin',
        'track02.raw',
        'track03.bin',
      ],
    ],
    [
      'Tales of Symphonia (2004)(Namco)(US)',
      [
        'Tales of Symphonia (2004)(Namco)(US)(Disc 1 of 2).iso',
        'Tales of Symphonia (2004)(Namco)(US)(Disc 2 of 2).iso',
      ],
    ],
  ]);
});

it('should de-conflict duplicate ROM names per sub-game in a MergedDiscGame', () => {
  const options = new Options({ mergeDiscs: true });
  const discOne = new Game({
    name: 'Pippo (Disc 1)',
    roms: [
      new ROM({ name: 'track01.bin', size: 100, crc32: '11111111' }),
      new ROM({ name: 'track02.bin', size: 200, crc32: '22222222' }),
    ],
  });
  const discTwo = new Game({
    name: 'Pippo (Disc 2)',
    roms: [
      new ROM({ name: 'track01.bin', size: 300, crc32: '33333333' }),
      new ROM({ name: 'track02.bin', size: 400, crc32: '44444444' }),
    ],
  });
  const dat = new LogiqxDAT({ header: new Header(), games: [discOne, discTwo] });

  const result = new DATDiscMerger(options, new ProgressBarFake()).merge(dat);

  expect(result.getGames()).toHaveLength(1);
  const merged = result.getGames()[0];
  expect(merged).toBeInstanceOf(MergedDiscGame);
  // The duplicate names are de-conflicted by prefixing each sub-game's original name, and the
  // sub-games carry the same renamed ROM instances that getRoms() flattens.
  expect(merged.getRoms().map((rom) => rom.getName())).toEqual([
    'Pippo (Disc 1)/track01.bin',
    'Pippo (Disc 1)/track02.bin',
    'Pippo (Disc 2)/track01.bin',
    'Pippo (Disc 2)/track02.bin',
  ]);
  const subGames = (merged as MergedDiscGame).getSubGames();
  expect(subGames).toHaveLength(2);
  expect(subGames[0].getRoms().map((rom) => rom.getName())).toEqual([
    'Pippo (Disc 1)/track01.bin',
    'Pippo (Disc 1)/track02.bin',
  ]);
});

it('should return a plain Game (not a MergedDiscGame) for single-disc groups', () => {
  const options = new Options({ mergeDiscs: true });
  const dat = new LogiqxDAT({ header: new Header(), games: [singleDiscGames[0]] });

  const result = new DATDiscMerger(options, new ProgressBarFake()).merge(dat);

  expect(result.getGames()).toHaveLength(1);
  const game = result.getGames()[0];
  expect(game).toBeInstanceOf(Game);
  expect(game).not.toBeInstanceOf(MergedDiscGame);
});
