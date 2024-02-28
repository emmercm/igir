import DATFilter from '../../src/modules/datFilter.js';
import Game, { GameProps } from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import Release from '../../src/types/dats/release.js';
import ROM from '../../src/types/dats/rom.js';
import Options, { OptionsProps } from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

function buildDATFilter(options: OptionsProps = {}): DATFilter {
  return new DATFilter(new Options(options), new ProgressBarFake());
}

async function expectFilteredDAT(
  options: OptionsProps,
  gamesArr: Game[][],
  expectedSize: number,
): Promise<void> {
  const dat = new LogiqxDAT(new Header(), gamesArr.flat());
  const filteredDat = await buildDATFilter(options).filter(dat);
  expect(filteredDat.getGames().length).toEqual(expectedSize);
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

      const rom = new ROM({ name: `${romName}.rom`, size: 0, crc: '00000000' });
      const game = new Game({
        name: romName, rom: [rom], release: releases, ...gameOptionsArr[idx],
      });
      games.push(game);
    }
  }

  return games;
}

it('should return nothing if no parents exist', async () => {
  await expectFilteredDAT({}, [], 0);
});

it('should return nothing if no parent has release candidates', async () => {
  await expectFilteredDAT({}, [
    buildGameWithRegionLanguage(['one', 'two', 'three'], [], []),
  ], 0);
});

describe('filter', () => {
  it('should return all candidates if no filter', async () => {
    await expectFilteredDAT({}, [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
    ], 1);

    await expectFilteredDAT({}, [
      buildGameWithRegionLanguage('one', 'USA', 'EN'),
      buildGameWithRegionLanguage('two', 'JPN', 'JA'),
    ], 2);
  });

  it('should return no candidates if none given', async () => {
    await expectFilteredDAT({
      filterLanguage: [],
    }, [], 0);

    await expectFilteredDAT({
      filterLanguage: ['ZH'],
    }, [], 0);

    await expectFilteredDAT({
      filterLanguage: ['ZH', 'DE'],
    }, [], 0);
  });

  describe('filter regex', () => {
    test.each([
      'ONE',
      'four',
      '[xyz]',
    ])('should return no candidates if none matching: %s', async (filterRegex) => {
      await expectFilteredDAT({ filterRegex }, [
        buildGameWithRegionLanguage('one'),
        buildGameWithRegionLanguage('two'),
        buildGameWithRegionLanguage('three'),
      ], 0);
    });

    test.each([
      '/ONE/i',
      'two',
      'o$',
    ])('should return one candidate if one matching: %s', async (filterRegex) => {
      await expectFilteredDAT({ filterRegex }, [
        buildGameWithRegionLanguage('one'),
        buildGameWithRegionLanguage('two'),
        buildGameWithRegionLanguage('three'),
      ], 1);
    });

    test.each([
      '(one|two|three)',
      '[aeiou]',
    ])('should return all candidates if all matching: %s', async (filterRegex) => {
      await expectFilteredDAT({ filterRegex }, [
        buildGameWithRegionLanguage('one'),
        buildGameWithRegionLanguage('two'),
        buildGameWithRegionLanguage('three'),
      ], 3);
    });
  });

  describe('filter regex exclude', () => {
    test.each([
      '(one|two|three)',
      '[aeiou]',
    ])('should return no candidates if all matching: %s', async (filterRegexExclude) => {
      await expectFilteredDAT({ filterRegexExclude }, [
        buildGameWithRegionLanguage('one'),
        buildGameWithRegionLanguage('two'),
        buildGameWithRegionLanguage('three'),
      ], 0);
    });

    test.each([
      '(two|three)',
      't',
      '/E/i',
    ])('should return one candidate if two matching: %s', async (filterRegexExclude) => {
      await expectFilteredDAT({ filterRegexExclude }, [
        buildGameWithRegionLanguage('one'),
        buildGameWithRegionLanguage('two'),
        buildGameWithRegionLanguage('three'),
      ], 1);
    });

    test.each([
      'ONE',
      'four',
      '[xyz]',
    ])('should return all candidates if none matching: %s', async (filterRegexExclude) => {
      await expectFilteredDAT({ filterRegexExclude }, [
        buildGameWithRegionLanguage('one'),
        buildGameWithRegionLanguage('two'),
        buildGameWithRegionLanguage('three'),
      ], 3);
    });
  });

  describe('language filter', () => {
    it('should return no candidates if none matching', async () => {
      await expectFilteredDAT({
        filterLanguage: ['ZH'],
      }, [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
      ], 0);

      await expectFilteredDAT({
        filterLanguage: ['ZH'],
      }, [
        buildGameWithRegionLanguage('one', 'EUR', undefined),
      ], 0);

      await expectFilteredDAT({
        filterLanguage: ['ZH'],
      }, [
        buildGameWithRegionLanguage('one (En,Fr,De)', 'EUR', undefined),
      ], 0);

      await expectFilteredDAT({
        filterLanguage: ['ZH'],
      }, [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'JPN', 'JA'),
        buildGameWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredDAT({
        filterLanguage: ['ZH'],
      }, [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'CHN', 'ZH'),
        buildGameWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ], 1);

      await expectFilteredDAT({
        filterLanguage: ['ZH'],
      }, [
        buildGameWithRegionLanguage('one', 'USA', undefined),
        buildGameWithRegionLanguage('two', 'CHN', undefined),
        buildGameWithRegionLanguage('three', 'EUR', undefined),
      ], 1);

      await expectFilteredDAT({
        filterLanguage: ['EN', 'ZH'],
      }, [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'JPN', 'JA'),
        buildGameWithRegionLanguage('three', 'ASI', ['JA', 'KO', 'ZH']),
      ], 2);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredDAT({
        filterLanguage: ['EN'],
      }, [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
      ], 1);

      await expectFilteredDAT({
        filterLanguage: ['EN'],
      }, [
        buildGameWithRegionLanguage('one', 'EUR', undefined),
      ], 1);

      await expectFilteredDAT({
        filterLanguage: ['EN'],
      }, [
        buildGameWithRegionLanguage('one (En,Fr,De)', 'EUR', undefined),
      ], 1);

      await expectFilteredDAT({
        filterLanguage: ['EN', 'ZH'],
      }, [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'CHN', 'ZH'),
      ], 2);

      await expectFilteredDAT({
        filterLanguage: ['EN', 'ZH'],
      }, [
        buildGameWithRegionLanguage('one', 'USA', undefined),
        buildGameWithRegionLanguage('two', 'CHN', undefined),
      ], 2);

      await expectFilteredDAT({
        filterLanguage: ['EN', 'JA'],
      }, [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'JPN', 'JA'),
        buildGameWithRegionLanguage('three', 'ASI', ['JA', 'KO', 'ZH']),
      ], 3);
    });
  });

  describe('region filter', () => {
    it('should return no candidates if none matching', async () => {
      await expectFilteredDAT({
        filterRegion: ['EUR'],
      }, [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
      ], 0);

      await expectFilteredDAT({
        filterRegion: ['CHN'],
      }, [
        buildGameWithRegionLanguage('one', ['USA', 'CAN'], 'EN'),
        buildGameWithRegionLanguage('two', 'JPN', 'JA'),
        buildGameWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredDAT({
        filterRegion: ['USA'],
      }, [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'CHN', 'ZH'),
        buildGameWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ], 1);

      await expectFilteredDAT({
        filterRegion: ['CAN', 'ASI'],
      }, [
        buildGameWithRegionLanguage('one', ['USA', 'CAN'], 'EN'),
        buildGameWithRegionLanguage('two', 'JPN', 'JA'),
        buildGameWithRegionLanguage('three', 'ASI', ['JA', 'KO', 'ZH']),
      ], 4);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredDAT({
        filterRegion: ['USA'],
      }, [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
      ], 1);

      await expectFilteredDAT({
        filterRegion: ['USA', 'CHN'],
      }, [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'CHN', 'ZH'),
      ], 2);

      await expectFilteredDAT({
        filterRegion: ['USA', 'JPN'],
      }, [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'JPN', 'JA'),
        buildGameWithRegionLanguage('three', ['ASI', 'JPN'], ['JA', 'KO', 'ZH']),
      ], 5);
    });
  });

  describe('bios', () => {
    it('option is false', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        buildGameWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
        buildGameWithRegionLanguage('three', 'USA', 'EN', { bios: 'no' }),
      ];
      await expectFilteredDAT({ noBios: false }, parentsToCandidates, 3);
      await expectFilteredDAT({ onlyBios: false }, parentsToCandidates, 3);
    });

    it('all games are BIOS', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { bios: 'yes' }),
        buildGameWithRegionLanguage('two [BIOS]', 'USA', 'EN', { bios: 'no' }),
      ];
      await expectFilteredDAT({ noBios: true }, parentsToCandidates, 0);
      await expectFilteredDAT({ onlyBios: true }, parentsToCandidates, 2);
    });

    it('some games are BIOS', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        buildGameWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
        buildGameWithRegionLanguage('three', 'USA', 'EN', { bios: 'no' }),
      ];
      await expectFilteredDAT({ noBios: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyBios: true }, parentsToCandidates, 1);
    });

    it('no games are BIOS', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        buildGameWithRegionLanguage('two', 'USA', 'EN', { bios: 'no' }),
      ];
      await expectFilteredDAT({ noBios: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyBios: true }, parentsToCandidates, 0);
    });
  });

  describe('device', () => {
    it('option is false', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { device: 'no' }),
        buildGameWithRegionLanguage('two', 'USA', 'EN', { device: 'yes' }),
        buildGameWithRegionLanguage('three', 'USA', 'EN', { device: 'no' }),
      ];
      await expectFilteredDAT({ noDevice: false }, parentsToCandidates, 3);
      await expectFilteredDAT({ onlyDevice: false }, parentsToCandidates, 3);
    });

    it('all games are device', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { device: 'yes' }),
        buildGameWithRegionLanguage('two', 'USA', 'EN', { device: 'yes' }),
      ];
      await expectFilteredDAT({ noDevice: true }, parentsToCandidates, 0);
      await expectFilteredDAT({ onlyDevice: true }, parentsToCandidates, 2);
    });

    it('some games are device', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { device: 'no' }),
        buildGameWithRegionLanguage('two', 'USA', 'EN', { device: 'yes' }),
        buildGameWithRegionLanguage('three', 'USA', 'EN', { device: 'no' }),
      ];
      await expectFilteredDAT({ noDevice: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyDevice: true }, parentsToCandidates, 1);
    });

    it('no games are device', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN', { device: 'no' }),
        buildGameWithRegionLanguage('two', 'USA', 'EN', { device: 'no' }),
      ];
      await expectFilteredDAT({ noDevice: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyDevice: true }, parentsToCandidates, 0);
    });
  });

  describe('unlicensed', () => {
    it('option is false', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Unl)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Unlicensed)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noUnlicensed: false }, parentsToCandidates, 3);
      await expectFilteredDAT({ onlyUnlicensed: false }, parentsToCandidates, 3);
    });

    it('all games are unlicensed', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Unl)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Unlicensed)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noUnlicensed: true }, parentsToCandidates, 0);
      await expectFilteredDAT({ onlyUnlicensed: true }, parentsToCandidates, 2);
    });

    it('some games are unlicensed', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Unlicensed)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Unl)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noUnlicensed: true }, parentsToCandidates, 1);
      await expectFilteredDAT({ onlyUnlicensed: true }, parentsToCandidates, 2);
    });

    it('no games are unlicensed', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noUnlicensed: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyUnlicensed: true }, parentsToCandidates, 0);
    });
  });

  describe('only retail', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredDAT({ onlyRetail: false }, [
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
      ], 10);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredDAT({ onlyRetail: true }, [
        buildGameWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three [b]', 'USA', 'EN'),
        buildGameWithRegionLanguage('four (Beta)', 'USA', 'EN'),
        buildGameWithRegionLanguage('five (Demo)', 'USA', 'EN'),
        buildGameWithRegionLanguage('six (Homebrew)', 'USA', 'EN'),
        buildGameWithRegionLanguage('seven (Proto)', 'USA', 'EN'),
        buildGameWithRegionLanguage('eight (Sample)', 'USA', 'EN'),
        buildGameWithRegionLanguage('nine (Program)', 'USA', 'EN'),
        buildGameWithRegionLanguage('ten (Debug)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredDAT({ onlyRetail: true }, [
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
      ], 2);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredDAT({ onlyRetail: true }, [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('debug', () => {
    it('option is false', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Debug)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Debug Version)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noDebug: false }, parentsToCandidates, 3);
      await expectFilteredDAT({ onlyDebug: false }, parentsToCandidates, 3);
    });

    it('all games are debug', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Debug)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Debug Version)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noDebug: true }, parentsToCandidates, 0);
      await expectFilteredDAT({ onlyDebug: true }, parentsToCandidates, 2);
    });

    it('some games are debug', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Debug Version)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Debug)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noDebug: true }, parentsToCandidates, 1);
      await expectFilteredDAT({ onlyDebug: true }, parentsToCandidates, 2);
    });

    it('no games are debug', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noDebug: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyDebug: true }, parentsToCandidates, 0);
    });
  });

  describe('demo', () => {
    it('option is false', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Demo)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Demo 2000)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noDemo: false }, parentsToCandidates, 3);
      await expectFilteredDAT({ onlyDemo: false }, parentsToCandidates, 3);
    });

    it('all games are demo', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Demo)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Demo 2000)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noDemo: true }, parentsToCandidates, 0);
      await expectFilteredDAT({ onlyDemo: true }, parentsToCandidates, 2);
    });

    it('some games are demo', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Demo 2000)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Demo)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noDemo: true }, parentsToCandidates, 1);
      await expectFilteredDAT({ onlyDemo: true }, parentsToCandidates, 2);
    });

    it('no games are demo', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noDemo: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyDemo: true }, parentsToCandidates, 0);
    });
  });

  describe('beta', () => {
    it('option is false', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Beta)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Beta v1.0)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noBeta: false }, parentsToCandidates, 3);
      await expectFilteredDAT({ onlyBeta: false }, parentsToCandidates, 3);
    });

    it('all games are beta', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Beta)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Beta v1.0)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noBeta: true }, parentsToCandidates, 0);
      await expectFilteredDAT({ onlyBeta: true }, parentsToCandidates, 2);
    });

    it('some games are beta', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Beta v1.0)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Beta)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noBeta: true }, parentsToCandidates, 1);
      await expectFilteredDAT({ onlyBeta: true }, parentsToCandidates, 2);
    });

    it('no games are beta', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noBeta: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyBeta: true }, parentsToCandidates, 0);
    });
  });

  describe('sample', () => {
    it('option is false', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Sample)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Sample Copy)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noSample: false }, parentsToCandidates, 3);
      await expectFilteredDAT({ onlySample: false }, parentsToCandidates, 3);
    });

    it('all games are sample', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Sample)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Sample Copy)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noSample: true }, parentsToCandidates, 0);
      await expectFilteredDAT({ onlySample: true }, parentsToCandidates, 2);
    });

    it('some games are sample', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Sample Copy)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Sample)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noSample: true }, parentsToCandidates, 1);
      await expectFilteredDAT({ onlySample: true }, parentsToCandidates, 2);
    });

    it('no games are sample', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noSample: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlySample: true }, parentsToCandidates, 0);
    });
  });

  describe('prototype', () => {
    it('option is false', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Proto)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Prototype)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noPrototype: false }, parentsToCandidates, 3);
      await expectFilteredDAT({ onlyPrototype: false }, parentsToCandidates, 3);
    });

    it('all games are prototype', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Proto)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Prototype)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noPrototype: true }, parentsToCandidates, 0);
      await expectFilteredDAT({ onlyPrototype: true }, parentsToCandidates, 2);
    });

    it('some games are prototype', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Prototype)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Proto)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noPrototype: true }, parentsToCandidates, 1);
      await expectFilteredDAT({ onlyPrototype: true }, parentsToCandidates, 2);
    });

    it('no games are prototype', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noPrototype: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyPrototype: true }, parentsToCandidates, 0);
    });
  });

  describe('program', () => {
    it('option is false', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Program)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Test Program)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noProgram: false }, parentsToCandidates, 3);
      await expectFilteredDAT({ onlyProgram: false }, parentsToCandidates, 3);
    });

    it('all games are programs', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Program)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Test Program)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noProgram: true }, parentsToCandidates, 0);
      await expectFilteredDAT({ onlyProgram: true }, parentsToCandidates, 2);
    });

    it('some games are programs', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Test Program)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Program)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noProgram: true }, parentsToCandidates, 1);
      await expectFilteredDAT({ onlyProgram: true }, parentsToCandidates, 2);
    });

    it('no games are programs', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noProgram: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyProgram: true }, parentsToCandidates, 0);
    });
  });

  describe('aftermarket', () => {
    it('option is false', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Aftermarket Version)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noAftermarket: false }, parentsToCandidates, 3);
      await expectFilteredDAT({ onlyAftermarket: false }, parentsToCandidates, 3);
    });

    it('all games are aftermarket', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Aftermarket)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Aftermarket Version)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noAftermarket: true }, parentsToCandidates, 0);
      await expectFilteredDAT({ onlyAftermarket: true }, parentsToCandidates, 2);
    });

    it('some games are aftermarket', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Aftermarket Version)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Aftermarket)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noAftermarket: true }, parentsToCandidates, 1);
      await expectFilteredDAT({ onlyAftermarket: true }, parentsToCandidates, 2);
    });

    it('no games are aftermarket', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noAftermarket: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyAftermarket: true }, parentsToCandidates, 0);
    });
  });

  describe('homebrew', () => {
    it('option is false', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Homebrew)', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Homebrew Edition)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noHomebrew: false }, parentsToCandidates, 3);
      await expectFilteredDAT({ onlyHomebrew: false }, parentsToCandidates, 3);
    });

    it('all games are homebrew', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Homebrew)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two (Homebrew Edition)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noHomebrew: true }, parentsToCandidates, 0);
      await expectFilteredDAT({ onlyHomebrew: true }, parentsToCandidates, 2);
    });

    it('some games are homebrew', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one (Homebrew Edition)', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three (Homebrew)', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ onlyHomebrew: true }, parentsToCandidates, 2);
    });

    it('no games are homebrew', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noHomebrew: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyHomebrew: true }, parentsToCandidates, 0);
    });
  });

  describe('verified', () => {
    it('option is false', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', [], 'EN'),
        buildGameWithRegionLanguage('two [!]', [], 'EN'),
        buildGameWithRegionLanguage('three [!]', [], 'EN'),
      ];
      await expectFilteredDAT({ noUnverified: false }, parentsToCandidates, 3);
      await expectFilteredDAT({ onlyUnverified: false }, parentsToCandidates, 3);
    });

    it('all games are verified', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', [], 'EN'),
        buildGameWithRegionLanguage('two', [], 'EN'),
      ];
      await expectFilteredDAT({ noUnverified: true }, parentsToCandidates, 0);
      await expectFilteredDAT({ onlyUnverified: true }, parentsToCandidates, 2);
    });

    it('some games are verified', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one [!]', [], 'EN'),
        buildGameWithRegionLanguage('two', [], 'EN'),
        buildGameWithRegionLanguage('three [!]', [], 'EN'),
      ];
      await expectFilteredDAT({ noUnverified: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyUnverified: true }, parentsToCandidates, 1);
    });

    it('no games are verified', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one [!]', [], 'EN'),
        buildGameWithRegionLanguage('two [!]', [], 'EN'),
      ];
      await expectFilteredDAT({ noUnverified: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyUnverified: true }, parentsToCandidates, 0);
    });
  });

  describe('bad', () => {
    it('option is false', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two [b]', 'USA', 'EN'),
        buildGameWithRegionLanguage('three [b]', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noBad: false }, parentsToCandidates, 3);
      await expectFilteredDAT({ onlyBad: false }, parentsToCandidates, 3);
    });

    it('all games are bad', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one [b]', 'USA', 'EN'),
        buildGameWithRegionLanguage('two [b]', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noBad: true }, parentsToCandidates, 0);
      await expectFilteredDAT({ onlyBad: true }, parentsToCandidates, 2);
    });

    it('some games are bad', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one [b]', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
        buildGameWithRegionLanguage('three [b]', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noBad: true }, parentsToCandidates, 1);
      await expectFilteredDAT({ onlyBad: true }, parentsToCandidates, 2);
    });

    it('no games are bad', async () => {
      const parentsToCandidates = [
        buildGameWithRegionLanguage('one', 'USA', 'EN'),
        buildGameWithRegionLanguage('two', 'USA', 'EN'),
      ];
      await expectFilteredDAT({ noBad: true }, parentsToCandidates, 2);
      await expectFilteredDAT({ onlyBad: true }, parentsToCandidates, 0);
    });
  });
});
