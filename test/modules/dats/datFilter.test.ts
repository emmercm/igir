import DATFilter from '../../../src/modules/dats/datFilter.js';
import Game, { GameProps } from '../../../src/types/dats/game.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import Release from '../../../src/types/dats/release.js';
import ROM from '../../../src/types/dats/rom.js';
import Options, { OptionsProps } from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

function buildDATFilter(options: OptionsProps = {}): DATFilter {
  return new DATFilter(new Options(options), new ProgressBarFake());
}

function expectFilteredDAT(
  options: OptionsProps,
  gamesArr: Game[][],
  expectedGameCount: number,
): void {
  const dat = new LogiqxDAT(new Header(), gamesArr.flat());
  const filteredDat = buildDATFilter(options).filter(dat);
  expect(filteredDat.getGames().length).toEqual(expectedGameCount);
}

function arrayCoerce<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) {
    return [];
  }
  return Array.isArray(val) ? val : [val];
}

function buildGameWithRegionLanguage(
  names: string | string[],
  regions?: string | string[],
  languages?: string | string[],
  gameOptions?: GameProps | GameProps[],
): Game[] {
  const namesArr = arrayCoerce(names);
  const regionsArr = arrayCoerce(regions);
  const languagesArr = Array.isArray(languages) ? languages : [languages];
  const gameOptionsArr = arrayCoerce(gameOptions);

  // Every different name+language combo is a different ROM+Game
  const games: Game[] = [];
  for (const [idx, romName] of namesArr.entries()) {
    for (const language of languagesArr) {
      // Every region is a different Release+ReleaseCandidate
      const releases: Release[] = [];
      for (const region of regionsArr) {
        let releaseName = romName;
        if (region) {
          releaseName += ` (${region})`;
        }
        if (language) {
          releaseName += ` (${language})`;
        }
        releases.push(new Release(releaseName, region, language));
      }

      const rom = new ROM({
        name: `${romName}.rom`,
        size: 0,
        crc32: '00000000',
      });
      const game = new Game({
        name: `${romName}${language ? ` (${language})` : ''}`, // all games need to have unique names
        rom: [rom],
        release: releases,
        ...gameOptionsArr[idx],
      });
      games.push(game);
    }
  }

  return games;
}

it('should return nothing if no parents exist', () => {
  expectFilteredDAT({}, [], 0);
});

it('should return nothing if the DAT has no games', () => {
  expectFilteredDAT({}, [buildGameWithRegionLanguage(['one', 'two', 'three'], [], [])], 0);
});

it('should return all games if no filter', () => {
  expectFilteredDAT({}, [buildGameWithRegionLanguage('one', 'USA', 'EN')], 1);

  expectFilteredDAT(
    {},
    [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'JPN', 'JA'),
    ],
    2,
  );
});

it('should return no games if none given', () => {
  expectFilteredDAT(
    {
      filterLanguage: [],
    },
    [],
    0,
  );

  expectFilteredDAT(
    {
      filterLanguage: ['ZH'],
    },
    [],
    0,
  );

  expectFilteredDAT(
    {
      filterLanguage: ['ZH', 'DE'],
    },
    [],
    0,
  );
});

it('should not re-elect a new parent if not filtered out', () => {
  const options = new Options({
    filterRegion: ['EUR'],
  });
  const parent = new Game({ name: 'Legend of Zelda, The (Europe) (Rev 1)' });
  const children = [
    'Dongfang de Chuanshuo - The Hyrule Fantasy (China) (Pirate)',
    'Legend of Zelda, The (Europe)',
    'Legend of Zelda, The (USA)',
    'Legend of Zelda, The (USA) (Rev 1)',
    'Legend of Zelda, The (USA) (Rev 1) (GameCube Edition)',
    'Legend of Zelda, The (USA) (GameCube Edition)',
    'Legend of Zelda, The (Europe) (Rev 1) (Virtual Console)',
    'Legend of Zelda, The (USA) (Rev 1) (Virtual Console)',
    'Zelda no Densetsu 1 - The Hyrule Fantasy (Japan)',
  ].map((name) => new Game({ name, cloneOf: parent.getName() }));
  const dat = new LogiqxDAT(new Header(), [parent, ...children]);
  expect(dat.getParents()).toHaveLength(1);

  const filteredDat = new DATFilter(options, new ProgressBarFake()).filter(dat);

  expect(filteredDat.getParents()).toHaveLength(1);
  expect(filteredDat.getGames().map((game) => game.getName())).toEqual([
    'Legend of Zelda, The (Europe) (Rev 1)',
    'Legend of Zelda, The (Europe)',
    'Legend of Zelda, The (Europe) (Rev 1) (Virtual Console)',
  ]);
  expect(filteredDat.getGames().at(0)?.getParent()).toEqual('');
  expect(
    filteredDat
      .getGames()
      .slice(1)
      .every((game) => game.getParent() === 'Legend of Zelda, The (Europe) (Rev 1)'),
  ).toEqual(true);
});

it('should not leave children abandoned', () => {
  const options = new Options({
    filterRegion: ['USA', 'WORLD'],
  });
  const parent = new Game({ name: 'Legend of Zelda, The (Europe) (Rev 1)' });
  const children = [
    'Dongfang de Chuanshuo - The Hyrule Fantasy (China) (Pirate)',
    'Legend of Zelda, The (Europe)',
    'Legend of Zelda, The (USA)',
    'Legend of Zelda, The (USA) (Rev 1)',
    'Legend of Zelda, The (USA) (Rev 1) (GameCube Edition)',
    'Legend of Zelda, The (USA) (GameCube Edition)',
    'Legend of Zelda, The (Europe) (Rev 1) (Virtual Console)',
    'Legend of Zelda, The (USA) (Rev 1) (Virtual Console)',
    'Zelda no Densetsu 1 - The Hyrule Fantasy (Japan)',
  ].map((name) => new Game({ name, cloneOf: parent.getName() }));
  const dat = new LogiqxDAT(new Header(), [parent, ...children]);
  expect(dat.getParents()).toHaveLength(1);

  const filteredDat = new DATFilter(options, new ProgressBarFake()).filter(dat);

  expect(filteredDat.getParents()).toHaveLength(1);
  expect(filteredDat.getGames().map((game) => game.getName())).toEqual([
    'Legend of Zelda, The (USA)',
    'Legend of Zelda, The (USA) (Rev 1)',
    'Legend of Zelda, The (USA) (Rev 1) (GameCube Edition)',
    'Legend of Zelda, The (USA) (GameCube Edition)',
    'Legend of Zelda, The (USA) (Rev 1) (Virtual Console)',
  ]);
  expect(filteredDat.getGames().at(0)?.getParent()).toEqual('');
  expect(
    filteredDat
      .getGames()
      .slice(1)
      .every((game) => game.getParent() === 'Legend of Zelda, The (USA)'),
  ).toEqual(true);
});

describe('filter regex', () => {
  test.each(['ONE', 'four', '[xyz]'])(
    'should return no games if none matching: %s',
    (filterRegex) => {
      expectFilteredDAT(
        { filterRegex },
        [
          buildGameWithRegionLanguage('one'),
          buildGameWithRegionLanguage('two'),
          buildGameWithRegionLanguage('three'),
        ],
        0,
      );
    },
  );

  test.each(['/ONE/i', 'two', 'o$'])(
    'should return one game if one matching: %s',
    (filterRegex) => {
      expectFilteredDAT(
        { filterRegex },
        [
          buildGameWithRegionLanguage('one'),
          buildGameWithRegionLanguage('two'),
          buildGameWithRegionLanguage('three'),
        ],
        1,
      );
    },
  );

  test.each(['(one|two|three)', '[aeiou]'])(
    'should return all games if all matching: %s',
    (filterRegex) => {
      expectFilteredDAT(
        { filterRegex },
        [
          buildGameWithRegionLanguage('one'),
          buildGameWithRegionLanguage('two'),
          buildGameWithRegionLanguage('three'),
        ],
        3,
      );
    },
  );
});

describe('filter regex exclude', () => {
  test.each(['(one|two|three)', '[aeiou]'])(
    'should return no games if all matching: %s',
    (filterRegexExclude) => {
      expectFilteredDAT(
        { filterRegexExclude },
        [
          buildGameWithRegionLanguage('one'),
          buildGameWithRegionLanguage('two'),
          buildGameWithRegionLanguage('three'),
        ],
        0,
      );
    },
  );

  test.each(['(two|three)', 't', '/E/i'])(
    'should return one game if two matching: %s',
    (filterRegexExclude) => {
      expectFilteredDAT(
        { filterRegexExclude },
        [
          buildGameWithRegionLanguage('one'),
          buildGameWithRegionLanguage('two'),
          buildGameWithRegionLanguage('three'),
        ],
        1,
      );
    },
  );

  test.each(['ONE', 'four', '[xyz]'])(
    'should return all games if none matching: %s',
    (filterRegexExclude) => {
      expectFilteredDAT(
        { filterRegexExclude },
        [
          buildGameWithRegionLanguage('one'),
          buildGameWithRegionLanguage('two'),
          buildGameWithRegionLanguage('three'),
        ],
        3,
      );
    },
  );
});

describe('language filter', () => {
  it('should return no games if none matching', () => {
    expectFilteredDAT(
      {
        filterLanguage: ['ZH'],
      },
      [buildGameWithRegionLanguage('one', 'USA', 'EN')],
      0,
    );

    expectFilteredDAT(
      {
        filterLanguage: ['ZH'],
      },
      [buildGameWithRegionLanguage('one', 'EUR', undefined)],
      0,
    );

    expectFilteredDAT(
      {
        filterLanguage: ['ZH'],
      },
      [buildGameWithRegionLanguage('one (En,Fr,De)', 'EUR', undefined)],
      0,
    );

    expectFilteredDAT(
      {
        filterLanguage: ['ZH'],
      },
      [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'JPN', 'JA'),
        buildGameWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ],
      0,
    );
  });

  it('should return some games if some matching', () => {
    expectFilteredDAT(
      {
        filterLanguage: ['ZH'],
      },
      [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'CHN', 'ZH'),
        buildGameWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ],
      1,
    );

    expectFilteredDAT(
      {
        filterLanguage: ['ZH'],
      },
      [
        buildGameWithRegionLanguage('one', 'USA', undefined),
        buildGameWithRegionLanguage('two', 'CHN', undefined),
        buildGameWithRegionLanguage('three', 'EUR', undefined),
      ],
      1,
    );

    expectFilteredDAT(
      {
        filterLanguage: ['EN', 'ZH'],
      },
      [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'JPN', 'JA'),
        buildGameWithRegionLanguage('three', 'ASI', ['JA', 'KO', 'ZH']),
      ],
      2,
    );
  });

  it('should return all games if all matching', () => {
    expectFilteredDAT(
      {
        filterLanguage: ['EN'],
      },
      [buildGameWithRegionLanguage('one', 'USA', 'EN')],
      1,
    );

    expectFilteredDAT(
      {
        filterLanguage: ['EN'],
      },
      [buildGameWithRegionLanguage('one', 'EUR', undefined)],
      1,
    );

    expectFilteredDAT(
      {
        filterLanguage: ['EN'],
      },
      [buildGameWithRegionLanguage('one (En,Fr,De)', 'EUR', undefined)],
      1,
    );

    expectFilteredDAT(
      {
        filterLanguage: ['EN', 'ZH'],
      },
      [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'CHN', 'ZH'),
      ],
      2,
    );

    expectFilteredDAT(
      {
        filterLanguage: ['EN', 'ZH'],
      },
      [
        buildGameWithRegionLanguage('one', 'USA', undefined),
        buildGameWithRegionLanguage('two', 'CHN', undefined),
      ],
      2,
    );

    expectFilteredDAT(
      {
        filterLanguage: ['EN', 'JA'],
      },
      [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'JPN', 'JA'),
        buildGameWithRegionLanguage('three', 'ASI', ['JA', 'KO', 'ZH']),
      ],
      3,
    );
  });
});

describe('region filter', () => {
  it('should return no games if none matching', () => {
    expectFilteredDAT(
      {
        filterRegion: ['EUR'],
      },
      [buildGameWithRegionLanguage('one', 'USA', 'EN')],
      0,
    );

    expectFilteredDAT(
      {
        filterRegion: ['CHN'],
      },
      [
        buildGameWithRegionLanguage('one', ['USA', 'CAN'], 'EN'),
        buildGameWithRegionLanguage('two', 'JPN', 'JA'),
        buildGameWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ],
      0,
    );
  });

  it('should return some games if some matching', () => {
    expectFilteredDAT(
      {
        filterRegion: ['USA'],
      },
      [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'CHN', 'ZH'),
        buildGameWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ],
      1,
    );

    expectFilteredDAT(
      {
        filterRegion: ['CAN', 'ASI'],
      },
      [
        buildGameWithRegionLanguage('one', ['USA', 'CAN'], 'EN'),
        buildGameWithRegionLanguage('two', 'JPN', 'JA'),
        buildGameWithRegionLanguage('three', 'ASI', ['JA', 'KO', 'ZH']),
      ],
      4,
    );
  });

  it('should return all games if all matching', () => {
    expectFilteredDAT(
      {
        filterRegion: ['USA'],
      },
      [buildGameWithRegionLanguage('one', 'USA', 'EN')],
      1,
    );

    expectFilteredDAT(
      {
        filterRegion: ['USA', 'CHN'],
      },
      [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'CHN', 'ZH'),
      ],
      2,
    );

    expectFilteredDAT(
      {
        filterRegion: ['USA', 'JPN'],
      },
      [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'JPN', 'JA'),
        buildGameWithRegionLanguage('three', ['ASI', 'JPN'], ['JA', 'KO', 'ZH']),
      ],
      5,
    );
  });
});

describe('category', () => {
  const games: Game[][] = [
    [
      // Nintendo - Super Nintendo Entertainment System (20240317-134803).dat
      new Game({
        name: 'Gargoyles (USA) (Proto) (1994-07-19)',
        category: ['Games', 'Preproduction'],
      }),
      new Game({ name: 'Harvest Moon (USA) (Beta)', category: 'Games' }),
      new Game({
        name: 'Peru - Operation Chavin de Huantar (USA) (Demo) (Unl)',
        category: ['Demos', 'Games'],
      }),
      new Game({ name: 'Super Game Boy (World) (Rev 2)' }),
      new Game({
        name: 'Super Game Boy (Japan, USA) (En) (Beta) (1994-03-23)',
        category: ['Applications', 'Preproduction'],
      }),
    ],
  ];
  const gamesCount = games.reduce((sum, g) => sum + g.length, 0);

  it('should return all games if option not provided', () => {
    const options = new Options();
    expectFilteredDAT(options, games, gamesCount);
  });

  test.each([['1234'], ['FOOBAR']])(
    'should return no games if none matching: %s',
    (filterCategoryRegex) => {
      const options = new Options({ filterCategoryRegex });
      expectFilteredDAT(options, games, 0);
    },
  );

  test.each([
    ['', gamesCount],
    ['.+', 4],
    ['\\w', 4],
    ['Games', 3],
    ['games', 0],
    ['/games/i', 3],
    ['/games|preproduction/i', 4],
  ])('should return matching games: %s', (filterCategoryRegex, expectedGameCount) => {
    const options = new Options({ filterCategoryRegex });
    expectFilteredDAT(options, games, expectedGameCount);
  });
});

describe('bios', () => {
  it('option is false', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
      buildGameWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
      buildGameWithRegionLanguage('three', 'USA', 'EN', { bios: 'no' }),
    ];
    expectFilteredDAT({ noBios: false }, parentsTogames, 3);
    expectFilteredDAT({ onlyBios: false }, parentsTogames, 3);
  });

  it('all games are BIOS', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN', { bios: 'yes' }),
      buildGameWithRegionLanguage('two [BIOS]', 'USA', 'EN', { bios: 'no' }),
    ];
    expectFilteredDAT({ noBios: true }, parentsTogames, 0);
    expectFilteredDAT({ onlyBios: true }, parentsTogames, 2);
  });

  it('some games are BIOS', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
      buildGameWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
      buildGameWithRegionLanguage('three', 'USA', 'EN', { bios: 'no' }),
    ];
    expectFilteredDAT({ noBios: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyBios: true }, parentsTogames, 1);
  });

  it('no games are BIOS', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
      buildGameWithRegionLanguage('two', 'USA', 'EN', { bios: 'no' }),
    ];
    expectFilteredDAT({ noBios: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyBios: true }, parentsTogames, 0);
  });
});

describe('device', () => {
  it('option is false', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN', { device: 'no' }),
      buildGameWithRegionLanguage('two', 'USA', 'EN', { device: 'yes' }),
      buildGameWithRegionLanguage('three', 'USA', 'EN', { device: 'no' }),
    ];
    expectFilteredDAT({ noDevice: false }, parentsTogames, 3);
    expectFilteredDAT({ onlyDevice: false }, parentsTogames, 3);
  });

  it('all games are device', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN', { device: 'yes' }),
      buildGameWithRegionLanguage('two', 'USA', 'EN', { device: 'yes' }),
    ];
    expectFilteredDAT({ noDevice: true }, parentsTogames, 0);
    expectFilteredDAT({ onlyDevice: true }, parentsTogames, 2);
  });

  it('some games are device', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN', { device: 'no' }),
      buildGameWithRegionLanguage('two', 'USA', 'EN', { device: 'yes' }),
      buildGameWithRegionLanguage('three', 'USA', 'EN', { device: 'no' }),
    ];
    expectFilteredDAT({ noDevice: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyDevice: true }, parentsTogames, 1);
  });

  it('no games are device', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN', { device: 'no' }),
      buildGameWithRegionLanguage('two', 'USA', 'EN', { device: 'no' }),
    ];
    expectFilteredDAT({ noDevice: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyDevice: true }, parentsTogames, 0);
  });
});

describe('unlicensed', () => {
  it('option is false', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Unl)', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Unlicensed)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noUnlicensed: false }, parentsTogames, 3);
    expectFilteredDAT({ onlyUnlicensed: false }, parentsTogames, 3);
  });

  it('all games are unlicensed', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Unl)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Unlicensed)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noUnlicensed: true }, parentsTogames, 0);
    expectFilteredDAT({ onlyUnlicensed: true }, parentsTogames, 2);
  });

  it('some games are unlicensed', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Unlicensed)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Unl)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noUnlicensed: true }, parentsTogames, 1);
    expectFilteredDAT({ onlyUnlicensed: true }, parentsTogames, 2);
  });

  it('no games are unlicensed', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noUnlicensed: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyUnlicensed: true }, parentsTogames, 0);
  });
});

describe('only retail', () => {
  it('should return all games when option is false', () => {
    expectFilteredDAT(
      { onlyRetail: false },
      [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three [b]', 'USA', 'EN'),
        buildGameWithRegionLanguage('four (Beta)', 'USA', 'EN'),
        buildGameWithRegionLanguage('five (Demo)', 'USA', 'EN'),
        buildGameWithRegionLanguage('six (Homebrew)', 'USA', 'EN'),
        buildGameWithRegionLanguage('seven (Proto)', 'USA', 'EN'),
        buildGameWithRegionLanguage('eight (Sample)', 'USA', 'EN'),
        buildGameWithRegionLanguage('nine (Program)', 'USA', 'EN'),
        buildGameWithRegionLanguage('ten (Debug)', 'USA', 'EN'),
      ],
      10,
    );
  });

  it('should return no games if none matching', () => {
    expectFilteredDAT(
      { onlyRetail: true },
      [
        buildGameWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three [b]', 'USA', 'EN'),
        buildGameWithRegionLanguage('four (Beta)', 'USA', 'EN'),
        buildGameWithRegionLanguage('five (Demo)', 'USA', 'EN'),
        buildGameWithRegionLanguage('six (Homebrew)', 'USA', 'EN'),
        buildGameWithRegionLanguage('seven (Proto)', 'USA', 'EN'),
        buildGameWithRegionLanguage('eight (Sample)', 'USA', 'EN'),
        buildGameWithRegionLanguage('nine (Program)', 'USA', 'EN'),
        buildGameWithRegionLanguage('ten (Debug)', 'USA', 'EN'),
      ],
      0,
    );
  });

  it('should return some games if some matching', () => {
    expectFilteredDAT(
      { onlyRetail: true },
      [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three [b]', 'USA', 'EN'),
        buildGameWithRegionLanguage('four (Beta)', 'USA', 'EN'),
        buildGameWithRegionLanguage('five (Demo)', 'USA', 'EN'),
        buildGameWithRegionLanguage('six (Homebrew)', 'USA', 'EN'),
        buildGameWithRegionLanguage('seven (Proto)', 'USA', 'EN'),
        buildGameWithRegionLanguage('eight (Sample)', 'USA', 'EN'),
        buildGameWithRegionLanguage('nine (Program)', 'USA', 'EN'),
        buildGameWithRegionLanguage('ten (Debug)', 'USA', 'EN'),
        buildGameWithRegionLanguage('gazillion', 'USA', 'EN'),
      ],
      2,
    );
  });

  it('should return all games if all matching', () => {
    expectFilteredDAT(
      { onlyRetail: true },
      [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ],
      2,
    );
  });
});

describe('debug', () => {
  it('option is false', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Debug)', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Debug Version)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noDebug: false }, parentsTogames, 3);
    expectFilteredDAT({ onlyDebug: false }, parentsTogames, 3);
  });

  it('all games are debug', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Debug)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Debug Version)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noDebug: true }, parentsTogames, 0);
    expectFilteredDAT({ onlyDebug: true }, parentsTogames, 2);
  });

  it('some games are debug', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Debug Version)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Debug)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noDebug: true }, parentsTogames, 1);
    expectFilteredDAT({ onlyDebug: true }, parentsTogames, 2);
  });

  it('no games are debug', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noDebug: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyDebug: true }, parentsTogames, 0);
  });
});

describe('demo', () => {
  it('option is false', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Demo)', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Demo 2000)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noDemo: false }, parentsTogames, 3);
    expectFilteredDAT({ onlyDemo: false }, parentsTogames, 3);
  });

  it('all games are demo', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Demo)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Demo 2000)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noDemo: true }, parentsTogames, 0);
    expectFilteredDAT({ onlyDemo: true }, parentsTogames, 2);
  });

  it('some games are demo', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Demo 2000)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Demo)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noDemo: true }, parentsTogames, 1);
    expectFilteredDAT({ onlyDemo: true }, parentsTogames, 2);
  });

  it('no games are demo', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noDemo: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyDemo: true }, parentsTogames, 0);
  });
});

describe('beta', () => {
  it('option is false', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Beta)', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Beta v1.0)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noBeta: false }, parentsTogames, 3);
    expectFilteredDAT({ onlyBeta: false }, parentsTogames, 3);
  });

  it('all games are beta', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Beta)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Beta v1.0)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noBeta: true }, parentsTogames, 0);
    expectFilteredDAT({ onlyBeta: true }, parentsTogames, 2);
  });

  it('some games are beta', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Beta v1.0)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Beta)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noBeta: true }, parentsTogames, 1);
    expectFilteredDAT({ onlyBeta: true }, parentsTogames, 2);
  });

  it('no games are beta', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noBeta: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyBeta: true }, parentsTogames, 0);
  });
});

describe('sample', () => {
  it('option is false', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Sample)', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Sample Copy)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noSample: false }, parentsTogames, 3);
    expectFilteredDAT({ onlySample: false }, parentsTogames, 3);
  });

  it('all games are sample', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Sample)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Sample Copy)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noSample: true }, parentsTogames, 0);
    expectFilteredDAT({ onlySample: true }, parentsTogames, 2);
  });

  it('some games are sample', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Sample Copy)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Sample)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noSample: true }, parentsTogames, 1);
    expectFilteredDAT({ onlySample: true }, parentsTogames, 2);
  });

  it('no games are sample', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noSample: true }, parentsTogames, 2);
    expectFilteredDAT({ onlySample: true }, parentsTogames, 0);
  });
});

describe('prototype', () => {
  it('option is false', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Proto)', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Prototype)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noPrototype: false }, parentsTogames, 3);
    expectFilteredDAT({ onlyPrototype: false }, parentsTogames, 3);
  });

  it('all games are prototype', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Proto)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Prototype)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noPrototype: true }, parentsTogames, 0);
    expectFilteredDAT({ onlyPrototype: true }, parentsTogames, 2);
  });

  it('some games are prototype', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Prototype)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Proto)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noPrototype: true }, parentsTogames, 1);
    expectFilteredDAT({ onlyPrototype: true }, parentsTogames, 2);
  });

  it('no games are prototype', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noPrototype: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyPrototype: true }, parentsTogames, 0);
  });
});

describe('program', () => {
  it('option is false', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Program)', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Test Program)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noProgram: false }, parentsTogames, 3);
    expectFilteredDAT({ onlyProgram: false }, parentsTogames, 3);
  });

  it('all games are programs', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Program)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Test Program)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noProgram: true }, parentsTogames, 0);
    expectFilteredDAT({ onlyProgram: true }, parentsTogames, 2);
  });

  it('some games are programs', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Test Program)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Program)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noProgram: true }, parentsTogames, 1);
    expectFilteredDAT({ onlyProgram: true }, parentsTogames, 2);
  });

  it('no games are programs', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noProgram: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyProgram: true }, parentsTogames, 0);
  });
});

describe('aftermarket', () => {
  it('option is false', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Aftermarket Version)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noAftermarket: false }, parentsTogames, 3);
    expectFilteredDAT({ onlyAftermarket: false }, parentsTogames, 3);
  });

  it('all games are aftermarket', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Aftermarket)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Aftermarket Version)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noAftermarket: true }, parentsTogames, 0);
    expectFilteredDAT({ onlyAftermarket: true }, parentsTogames, 2);
  });

  it('some games are aftermarket', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Aftermarket Version)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Aftermarket)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noAftermarket: true }, parentsTogames, 1);
    expectFilteredDAT({ onlyAftermarket: true }, parentsTogames, 2);
  });

  it('no games are aftermarket', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noAftermarket: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyAftermarket: true }, parentsTogames, 0);
  });
});

describe('homebrew', () => {
  it('option is false', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Homebrew)', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Homebrew Edition)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noHomebrew: false }, parentsTogames, 3);
    expectFilteredDAT({ onlyHomebrew: false }, parentsTogames, 3);
  });

  it('all games are homebrew', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Homebrew)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two (Homebrew Edition)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noHomebrew: true }, parentsTogames, 0);
    expectFilteredDAT({ onlyHomebrew: true }, parentsTogames, 2);
  });

  it('some games are homebrew', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one (Homebrew Edition)', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
      buildGameWithRegionLanguage('three (Homebrew)', 'USA', 'EN'),
    ];
    expectFilteredDAT({ onlyHomebrew: true }, parentsTogames, 2);
  });

  it('no games are homebrew', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noHomebrew: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyHomebrew: true }, parentsTogames, 0);
  });
});

describe('verified', () => {
  it('option is false', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', [], 'EN'),
      buildGameWithRegionLanguage('two [!]', [], 'EN'),
      buildGameWithRegionLanguage('three [!]', [], 'EN'),
    ];
    expectFilteredDAT({ noUnverified: false }, parentsTogames, 3);
    expectFilteredDAT({ onlyUnverified: false }, parentsTogames, 3);
  });

  it('all games are verified', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', [], 'EN'),
      buildGameWithRegionLanguage('two', [], 'EN'),
    ];
    expectFilteredDAT({ noUnverified: true }, parentsTogames, 0);
    expectFilteredDAT({ onlyUnverified: true }, parentsTogames, 2);
  });

  it('some games are verified', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one [!]', [], 'EN'),
      buildGameWithRegionLanguage('two', [], 'EN'),
      buildGameWithRegionLanguage('three [!]', [], 'EN'),
    ];
    expectFilteredDAT({ noUnverified: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyUnverified: true }, parentsTogames, 1);
  });

  it('no games are verified', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one [!]', [], 'EN'),
      buildGameWithRegionLanguage('two [!]', [], 'EN'),
    ];
    expectFilteredDAT({ noUnverified: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyUnverified: true }, parentsTogames, 0);
  });
});

describe('bad', () => {
  it('option is false', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two [b]', 'USA', 'EN'),
      buildGameWithRegionLanguage('three [b]', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noBad: false }, parentsTogames, 3);
    expectFilteredDAT({ onlyBad: false }, parentsTogames, 3);
  });

  it('all games are bad', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one [b]', 'USA', 'EN'),
      buildGameWithRegionLanguage('two [b]', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noBad: true }, parentsTogames, 0);
    expectFilteredDAT({ onlyBad: true }, parentsTogames, 2);
  });

  it('some games are bad', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one [b]', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
      buildGameWithRegionLanguage('three [b]', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noBad: true }, parentsTogames, 1);
    expectFilteredDAT({ onlyBad: true }, parentsTogames, 2);
  });

  it('no games are bad', () => {
    const parentsTogames = [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'USA', 'EN'),
    ];
    expectFilteredDAT({ noBad: true }, parentsTogames, 2);
    expectFilteredDAT({ onlyBad: true }, parentsTogames, 0);
  });
});
