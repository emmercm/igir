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

it('should return nothing if no parent has release candidates', () => {
  expectFilteredDAT({}, [buildGameWithRegionLanguage(['one', 'two', 'three'], [], [])], 0);
});

describe('filter', () => {
  it('should return all candidates if no filter', () => {
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

  it('should return no candidates if none given', () => {
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
      'should return no candidates if none matching: %s',
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
      'should return one candidate if one matching: %s',
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
      'should return all candidates if all matching: %s',
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
      'should return no candidates if all matching: %s',
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
      'should return one candidate if two matching: %s',
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
      'should return all candidates if none matching: %s',
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
    it('should return no candidates if none matching', () => {
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

    it('should return some candidates if some matching', () => {
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

    it('should return all candidates if all matching', () => {
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
    it('should return no candidates if none matching', () => {
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

    it('should return some candidates if some matching', () => {
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

    it('should return all candidates if all matching', () => {
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

  describe('bios', () => {
    it('option is false', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        buildGameWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
        buildGameWithRegionLanguage('three', 'USA', 'EN', { bios: 'no' }),
      ];
      expectFilteredDAT({ noBios: false }, parentsToCandidates, 3);
      expectFilteredDAT({ onlyBios: false }, parentsToCandidates, 3);
    });

    it('all games are BIOS', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { bios: 'yes' }),
        buildGameWithRegionLanguage('two [BIOS]', 'USA', 'EN', { bios: 'no' }),
      ];
      expectFilteredDAT({ noBios: true }, parentsToCandidates, 0);
      expectFilteredDAT({ onlyBios: true }, parentsToCandidates, 2);
    });

    it('some games are BIOS', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        buildGameWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
        buildGameWithRegionLanguage('three', 'USA', 'EN', { bios: 'no' }),
      ];
      expectFilteredDAT({ noBios: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyBios: true }, parentsToCandidates, 1);
    });

    it('no games are BIOS', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        buildGameWithRegionLanguage('two', 'USA', 'EN', { bios: 'no' }),
      ];
      expectFilteredDAT({ noBios: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyBios: true }, parentsToCandidates, 0);
    });
  });

  describe('device', () => {
    it('option is false', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { device: 'no' }),
        buildGameWithRegionLanguage('two', 'USA', 'EN', { device: 'yes' }),
        buildGameWithRegionLanguage('three', 'USA', 'EN', { device: 'no' }),
      ];
      expectFilteredDAT({ noDevice: false }, parentsToCandidates, 3);
      expectFilteredDAT({ onlyDevice: false }, parentsToCandidates, 3);
    });

    it('all games are device', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { device: 'yes' }),
        buildGameWithRegionLanguage('two', 'USA', 'EN', { device: 'yes' }),
      ];
      expectFilteredDAT({ noDevice: true }, parentsToCandidates, 0);
      expectFilteredDAT({ onlyDevice: true }, parentsToCandidates, 2);
    });

    it('some games are device', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { device: 'no' }),
        buildGameWithRegionLanguage('two', 'USA', 'EN', { device: 'yes' }),
        buildGameWithRegionLanguage('three', 'USA', 'EN', { device: 'no' }),
      ];
      expectFilteredDAT({ noDevice: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyDevice: true }, parentsToCandidates, 1);
    });

    it('no games are device', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { device: 'no' }),
        buildGameWithRegionLanguage('two', 'USA', 'EN', { device: 'no' }),
      ];
      expectFilteredDAT({ noDevice: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyDevice: true }, parentsToCandidates, 0);
    });
  });

  describe('unlicensed', () => {
    it('option is false', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Unl)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Unlicensed)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noUnlicensed: false }, parentsToCandidates, 3);
      expectFilteredDAT({ onlyUnlicensed: false }, parentsToCandidates, 3);
    });

    it('all games are unlicensed', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Unl)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Unlicensed)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noUnlicensed: true }, parentsToCandidates, 0);
      expectFilteredDAT({ onlyUnlicensed: true }, parentsToCandidates, 2);
    });

    it('some games are unlicensed', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Unlicensed)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Unl)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noUnlicensed: true }, parentsToCandidates, 1);
      expectFilteredDAT({ onlyUnlicensed: true }, parentsToCandidates, 2);
    });

    it('no games are unlicensed', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noUnlicensed: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyUnlicensed: true }, parentsToCandidates, 0);
    });
  });

  describe('only retail', () => {
    it('should return all candidates when option is false', () => {
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

    it('should return no candidates if none matching', () => {
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

    it('should return some candidates if some matching', () => {
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

    it('should return all candidates if all matching', () => {
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
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Debug)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Debug Version)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noDebug: false }, parentsToCandidates, 3);
      expectFilteredDAT({ onlyDebug: false }, parentsToCandidates, 3);
    });

    it('all games are debug', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Debug)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Debug Version)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noDebug: true }, parentsToCandidates, 0);
      expectFilteredDAT({ onlyDebug: true }, parentsToCandidates, 2);
    });

    it('some games are debug', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Debug Version)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Debug)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noDebug: true }, parentsToCandidates, 1);
      expectFilteredDAT({ onlyDebug: true }, parentsToCandidates, 2);
    });

    it('no games are debug', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noDebug: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyDebug: true }, parentsToCandidates, 0);
    });
  });

  describe('demo', () => {
    it('option is false', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Demo)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Demo 2000)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noDemo: false }, parentsToCandidates, 3);
      expectFilteredDAT({ onlyDemo: false }, parentsToCandidates, 3);
    });

    it('all games are demo', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Demo)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Demo 2000)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noDemo: true }, parentsToCandidates, 0);
      expectFilteredDAT({ onlyDemo: true }, parentsToCandidates, 2);
    });

    it('some games are demo', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Demo 2000)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Demo)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noDemo: true }, parentsToCandidates, 1);
      expectFilteredDAT({ onlyDemo: true }, parentsToCandidates, 2);
    });

    it('no games are demo', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noDemo: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyDemo: true }, parentsToCandidates, 0);
    });
  });

  describe('beta', () => {
    it('option is false', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Beta)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Beta v1.0)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noBeta: false }, parentsToCandidates, 3);
      expectFilteredDAT({ onlyBeta: false }, parentsToCandidates, 3);
    });

    it('all games are beta', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Beta)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Beta v1.0)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noBeta: true }, parentsToCandidates, 0);
      expectFilteredDAT({ onlyBeta: true }, parentsToCandidates, 2);
    });

    it('some games are beta', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Beta v1.0)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Beta)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noBeta: true }, parentsToCandidates, 1);
      expectFilteredDAT({ onlyBeta: true }, parentsToCandidates, 2);
    });

    it('no games are beta', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noBeta: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyBeta: true }, parentsToCandidates, 0);
    });
  });

  describe('sample', () => {
    it('option is false', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Sample)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Sample Copy)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noSample: false }, parentsToCandidates, 3);
      expectFilteredDAT({ onlySample: false }, parentsToCandidates, 3);
    });

    it('all games are sample', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Sample)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Sample Copy)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noSample: true }, parentsToCandidates, 0);
      expectFilteredDAT({ onlySample: true }, parentsToCandidates, 2);
    });

    it('some games are sample', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Sample Copy)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Sample)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noSample: true }, parentsToCandidates, 1);
      expectFilteredDAT({ onlySample: true }, parentsToCandidates, 2);
    });

    it('no games are sample', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noSample: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlySample: true }, parentsToCandidates, 0);
    });
  });

  describe('prototype', () => {
    it('option is false', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Proto)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Prototype)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noPrototype: false }, parentsToCandidates, 3);
      expectFilteredDAT({ onlyPrototype: false }, parentsToCandidates, 3);
    });

    it('all games are prototype', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Proto)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Prototype)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noPrototype: true }, parentsToCandidates, 0);
      expectFilteredDAT({ onlyPrototype: true }, parentsToCandidates, 2);
    });

    it('some games are prototype', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Prototype)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Proto)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noPrototype: true }, parentsToCandidates, 1);
      expectFilteredDAT({ onlyPrototype: true }, parentsToCandidates, 2);
    });

    it('no games are prototype', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noPrototype: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyPrototype: true }, parentsToCandidates, 0);
    });
  });

  describe('program', () => {
    it('option is false', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Program)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Test Program)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noProgram: false }, parentsToCandidates, 3);
      expectFilteredDAT({ onlyProgram: false }, parentsToCandidates, 3);
    });

    it('all games are programs', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Program)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Test Program)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noProgram: true }, parentsToCandidates, 0);
      expectFilteredDAT({ onlyProgram: true }, parentsToCandidates, 2);
    });

    it('some games are programs', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Test Program)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Program)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noProgram: true }, parentsToCandidates, 1);
      expectFilteredDAT({ onlyProgram: true }, parentsToCandidates, 2);
    });

    it('no games are programs', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noProgram: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyProgram: true }, parentsToCandidates, 0);
    });
  });

  describe('aftermarket', () => {
    it('option is false', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Aftermarket Version)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noAftermarket: false }, parentsToCandidates, 3);
      expectFilteredDAT({ onlyAftermarket: false }, parentsToCandidates, 3);
    });

    it('all games are aftermarket', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Aftermarket)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Aftermarket Version)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noAftermarket: true }, parentsToCandidates, 0);
      expectFilteredDAT({ onlyAftermarket: true }, parentsToCandidates, 2);
    });

    it('some games are aftermarket', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Aftermarket Version)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Aftermarket)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noAftermarket: true }, parentsToCandidates, 1);
      expectFilteredDAT({ onlyAftermarket: true }, parentsToCandidates, 2);
    });

    it('no games are aftermarket', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noAftermarket: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyAftermarket: true }, parentsToCandidates, 0);
    });
  });

  describe('homebrew', () => {
    it('option is false', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Homebrew)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Homebrew Edition)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noHomebrew: false }, parentsToCandidates, 3);
      expectFilteredDAT({ onlyHomebrew: false }, parentsToCandidates, 3);
    });

    it('all games are homebrew', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Homebrew)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Homebrew Edition)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noHomebrew: true }, parentsToCandidates, 0);
      expectFilteredDAT({ onlyHomebrew: true }, parentsToCandidates, 2);
    });

    it('some games are homebrew', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Homebrew Edition)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Homebrew)', 'USA', 'EN'),
      ];
      expectFilteredDAT({ onlyHomebrew: true }, parentsToCandidates, 2);
    });

    it('no games are homebrew', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noHomebrew: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyHomebrew: true }, parentsToCandidates, 0);
    });
  });

  describe('verified', () => {
    it('option is false', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', [], 'EN'),
        buildGameWithRegionLanguage('two [!]', [], 'EN'),
        buildGameWithRegionLanguage('three [!]', [], 'EN'),
      ];
      expectFilteredDAT({ noUnverified: false }, parentsToCandidates, 3);
      expectFilteredDAT({ onlyUnverified: false }, parentsToCandidates, 3);
    });

    it('all games are verified', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', [], 'EN'),
        buildGameWithRegionLanguage('two', [], 'EN'),
      ];
      expectFilteredDAT({ noUnverified: true }, parentsToCandidates, 0);
      expectFilteredDAT({ onlyUnverified: true }, parentsToCandidates, 2);
    });

    it('some games are verified', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one [!]', [], 'EN'),
        buildGameWithRegionLanguage('two', [], 'EN'),
        buildGameWithRegionLanguage('three [!]', [], 'EN'),
      ];
      expectFilteredDAT({ noUnverified: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyUnverified: true }, parentsToCandidates, 1);
    });

    it('no games are verified', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one [!]', [], 'EN'),
        buildGameWithRegionLanguage('two [!]', [], 'EN'),
      ];
      expectFilteredDAT({ noUnverified: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyUnverified: true }, parentsToCandidates, 0);
    });
  });

  describe('bad', () => {
    it('option is false', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two [b]', 'USA', 'EN'),
        buildGameWithRegionLanguage('three [b]', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noBad: false }, parentsToCandidates, 3);
      expectFilteredDAT({ onlyBad: false }, parentsToCandidates, 3);
    });

    it('all games are bad', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one [b]', 'USA', 'EN'),
        buildGameWithRegionLanguage('two [b]', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noBad: true }, parentsToCandidates, 0);
      expectFilteredDAT({ onlyBad: true }, parentsToCandidates, 2);
    });

    it('some games are bad', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one [b]', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three [b]', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noBad: true }, parentsToCandidates, 1);
      expectFilteredDAT({ onlyBad: true }, parentsToCandidates, 2);
    });

    it('no games are bad', () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      expectFilteredDAT({ noBad: true }, parentsToCandidates, 2);
      expectFilteredDAT({ onlyBad: true }, parentsToCandidates, 0);
    });
  });
});
