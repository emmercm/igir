import CandidateFilter from '../../src/modules/candidateFilter.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game, { GameProps } from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import Parent from '../../src/types/logiqx/parent.js';
import Release from '../../src/types/logiqx/release.js';
import ROM from '../../src/types/logiqx/rom.js';
import Options, { OptionsProps } from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
import ProgressBarFake from '../console/progressBarFake.js';

function buildCandidateFilter(options: OptionsProps = {}): CandidateFilter {
  return new CandidateFilter(new Options(options), new ProgressBarFake());
}

async function expectFilteredCandidates(
  options: OptionsProps,
  parentsToCandidates: [Parent, ReleaseCandidate[]][],
  expectedSize: number,
): Promise<void> {
  const dat = new DAT(new Header(), []);

  const [filteredParentsToCandidates] = await Promise.all([buildCandidateFilter(options)
    .filter(dat, new Map(parentsToCandidates))]);

  const totalCandidates = [...filteredParentsToCandidates.values()]
    .reduce((sum, candidate) => sum + candidate.length, 0);
  expect(totalCandidates).toEqual(expectedSize);
}

async function expectPreferredCandidates(
  options: OptionsProps,
  parentsToCandidates: [Parent, ReleaseCandidate[]][],
  expectedNames: string[],
): Promise<void> {
  const dat = new DAT(new Header(), []);

  const filteredParentsToCandidates = await buildCandidateFilter(options)
    .filter(dat, new Map(parentsToCandidates));
  // Assert CandidateFilter doesn't affect the number of parents
  expect(filteredParentsToCandidates.size).toEqual(parentsToCandidates.length);

  // Assert the total number of candidates across all parents is the expected amount
  const totalCandidates = [...filteredParentsToCandidates.values()]
    .reduce((sum, candidate) => sum + candidate.length, 0);
  expect(totalCandidates).toEqual(parentsToCandidates.length);

  // Assert the number of candidates equals the number of parents (single:true)
  const candidateNames = [...filteredParentsToCandidates.values()]
    .flatMap((candidate) => candidate.map((c) => c.getName()));
  expect(candidateNames).toHaveLength(parentsToCandidates.length);

  // Assert the candidate names, in any order
  expect(candidateNames).toHaveLength(expectedNames.length);
  for (let i = 0; i < expectedNames.length; i += 1) {
    const expectedName = expectedNames[i];
    expect(candidateNames).toContain(expectedName);
  }
}

function arrayCoerce<T>(val: T | T[] | undefined): T[] {
  if (!val) {
    return [];
  }
  return Array.isArray(val) ? val : [val];
}

async function buildReleaseCandidatesWithRegionLanguage(
  names: string | string[],
  regions?: string | string[],
  languages?: string | string[],
  gameOptions?: GameProps | GameProps[],
): Promise<[Parent, ReleaseCandidate[]]> {
  const namesArr = arrayCoerce(names);
  const regionsArr = arrayCoerce(regions);
  const languagesArr = Array.isArray(languages) ? languages : [languages];
  const gameOptionsArr = arrayCoerce(gameOptions);

  // Every different name+language combo is a different ROM+Game
  const games: Game[] = [];
  const releaseCandidates: ReleaseCandidate[] = [];
  for (let i = 0; i < namesArr.length; i += 1) {
    const romName = namesArr[i];

    for (let j = 0; j < languagesArr.length; j += 1) {
      const language = languagesArr[j];

      // Every region is a different Release+ReleaseCandidate
      const releases: Release[] = [];
      for (let k = 0; k < regionsArr.length; k += 1) {
        const region = regionsArr[k];
        let releaseName = romName;
        if (region) {
          releaseName += ` (${region})`;
        }
        if (language) {
          releaseName += ` (${language})`;
        }
        releases.push(new Release(releaseName, region, language));
      }

      const rom = new ROM(`${romName}.rom`, 0, '00000000');
      const game = new Game({
        name: romName, rom: [rom], release: releases, ...gameOptionsArr[i],
      });
      games.push(game);

      /** {@see CandidateGenerator} */
      const releaseCandidateReleases = releases.length ? releases : [undefined];
      /* eslint-disable no-await-in-loop */
      for (let k = 0; k < releaseCandidateReleases.length; k += 1) {
        const release = releaseCandidateReleases[k];
        releaseCandidates.push(new ReleaseCandidate(
          game,
          release,
          await Promise.all(game.getRoms().map(async (gameRom) => new ROMWithFiles(
            gameRom,
            await gameRom.toFile(),
            await gameRom.toFile(),
          ))),
        ));
      }
    }
  }

  const parent = new Parent(namesArr[0], games);
  return [parent, releaseCandidates];
}

it('should return nothing if no parents exist', async () => {
  await expectFilteredCandidates({}, [], 0);
});

it('should return nothing if no parent has release candidates', async () => {
  await expectFilteredCandidates({}, [
    await buildReleaseCandidatesWithRegionLanguage(['one', 'two', 'three'], [], []),
  ], 0);
});

describe('preFilter', () => {
  it('should return all candidates if no filter', async () => {
    await expectFilteredCandidates({}, [
      await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
    ], 1);

    await expectFilteredCandidates({}, [
      await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
      await buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JA'),
    ], 2);
  });

  it('should return no candidates if none given', async () => {
    await expectFilteredCandidates({
      languageFilter: [],
    }, [], 0);

    await expectFilteredCandidates({
      languageFilter: ['ZH'],
    }, [], 0);

    await expectFilteredCandidates({
      languageFilter: ['ZH', 'DE'],
    }, [], 0);
  });

  describe('language filter', () => {
    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({
        languageFilter: ['ZH'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
      ], 0);

      await expectFilteredCandidates({
        languageFilter: ['ZH'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'EUR', undefined),
      ], 0);

      await expectFilteredCandidates({
        languageFilter: ['ZH'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one (En,Fr,De)', 'EUR', undefined),
      ], 0);

      await expectFilteredCandidates({
        languageFilter: ['ZH'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JA'),
        await buildReleaseCandidatesWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({
        languageFilter: ['ZH'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'CHN', 'ZH'),
        await buildReleaseCandidatesWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ], 1);

      await expectFilteredCandidates({
        languageFilter: ['ZH'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', undefined),
        await buildReleaseCandidatesWithRegionLanguage('two', 'CHN', undefined),
        await buildReleaseCandidatesWithRegionLanguage('three', 'EUR', undefined),
      ], 1);

      await expectFilteredCandidates({
        languageFilter: ['EN', 'ZH'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JA'),
        await buildReleaseCandidatesWithRegionLanguage('three', 'ASI', ['JA', 'KO', 'ZH']),
      ], 2);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({
        languageFilter: ['EN'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
      ], 1);

      await expectFilteredCandidates({
        languageFilter: ['EN'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'EUR', undefined),
      ], 1);

      await expectFilteredCandidates({
        languageFilter: ['EN'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one (En,Fr,De)', 'EUR', undefined),
      ], 1);

      await expectFilteredCandidates({
        languageFilter: ['EN', 'ZH'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'CHN', 'ZH'),
      ], 2);

      await expectFilteredCandidates({
        languageFilter: ['EN', 'ZH'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', undefined),
        await buildReleaseCandidatesWithRegionLanguage('two', 'CHN', undefined),
      ], 2);

      await expectFilteredCandidates({
        languageFilter: ['EN', 'JA'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JA'),
        await buildReleaseCandidatesWithRegionLanguage('three', 'ASI', ['JA', 'KO', 'ZH']),
      ], 3);
    });
  });

  describe('region filter', () => {
    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({
        regionFilter: ['EUR'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
      ], 0);

      await expectFilteredCandidates({
        regionFilter: ['CHN'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', ['USA', 'CAN'], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JA'),
        await buildReleaseCandidatesWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({
        regionFilter: ['USA'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'CHN', 'ZH'),
        await buildReleaseCandidatesWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ], 1);

      await expectFilteredCandidates({
        regionFilter: ['CAN', 'ASI'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', ['USA', 'CAN'], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JA'),
        await buildReleaseCandidatesWithRegionLanguage('three', 'ASI', ['JA', 'KO', 'ZH']),
      ], 4);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({
        regionFilter: ['USA'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
      ], 1);

      await expectFilteredCandidates({
        regionFilter: ['USA', 'CHN'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'CHN', 'ZH'),
      ], 2);

      await expectFilteredCandidates({
        regionFilter: ['USA', 'JPN'],
      }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JA'),
        await buildReleaseCandidatesWithRegionLanguage('three', ['ASI', 'JPN'], ['JA', 'KO', 'ZH']),
      ], 5);
    });
  });

  describe('only bios', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ onlyBios: false }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
        await buildReleaseCandidatesWithRegionLanguage('three', 'USA', 'EN', { bios: 'no' }),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ onlyBios: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'no' }),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ onlyBios: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
        await buildReleaseCandidatesWithRegionLanguage('three', 'USA', 'EN', { bios: 'no' }),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ onlyBios: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'yes' }),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
      ], 2);
    });
  });

  describe('no bios', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noBios: false }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
        await buildReleaseCandidatesWithRegionLanguage('three', 'USA', 'EN', { bios: 'no' }),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noBios: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'yes' }),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noBios: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
        await buildReleaseCandidatesWithRegionLanguage('three', 'USA', 'EN', { bios: 'no' }),
      ], 2);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noBios: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'no' }),
      ], 2);
    });
  });

  describe('no unlicensed', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noUnlicensed: false }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Unl)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Unlicensed)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noUnlicensed: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Unl)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Unlicensed)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noUnlicensed: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Unlicensed)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Unl)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noUnlicensed: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('only retail', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ onlyRetail: false }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three [b]', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('four (Beta)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('five (Demo)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('six (Homebrew)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('seven (Proto)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('eight (Sample)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('nine (Test)', 'USA', 'EN'),
      ], 9);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ onlyRetail: true }, [
        await buildReleaseCandidatesWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three [b]', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('four (Beta)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('five (Demo)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('six (Homebrew)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('seven (Proto)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('eight (Sample)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('nine (Test)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ onlyRetail: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three [b]', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('four (Beta)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('five (Demo)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('six (Homebrew)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('seven (Proto)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('eight (Sample)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('nine (Test)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('ten', 'USA', 'EN'),
      ], 2);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ onlyRetail: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no demo', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noDemo: false }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Demo)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Demo 2000)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noDemo: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Demo)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Demo 2000)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noDemo: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Demo 2000)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Demo)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noDemo: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no beta', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noBeta: false }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Beta)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Beta v1.0)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noBeta: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Beta)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Beta v1.0)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noBeta: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Beta v1.0)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Beta)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noBeta: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no sample', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noSample: false }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Sample)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Sample Copy)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noSample: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Sample)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Sample Copy)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noSample: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Sample Copy)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Sample)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noSample: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no prototype', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noPrototype: false }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Proto)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Prototype)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noPrototype: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Proto)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Prototype)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noPrototype: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Prototype)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Proto)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noPrototype: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no test roms', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noTestRoms: false }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Test)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Test Copy)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noTestRoms: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Test)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Test Copy)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noTestRoms: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Test Copy)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Test)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noTestRoms: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no aftermarket', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noAftermarket: false }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Aftermarket Version)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noAftermarket: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Aftermarket)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Aftermarket Version)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noAftermarket: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Aftermarket Version)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Aftermarket)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noAftermarket: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no homebrew', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noHomebrew: false }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Homebrew)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Homebrew Edition)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noHomebrew: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Homebrew)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two (Homebrew Edition)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noHomebrew: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one (Homebrew Edition)', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three (Homebrew)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noHomebrew: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no bad', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noBad: false }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two [b]', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three [b]', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noBad: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one [b]', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two [b]', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noBad: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one [b]', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three [b]', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noBad: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });
});

describe('sort', () => {
  describe('prefer good', () => {
    it('should return the first candidate when option is false', async () => {
      await expectPreferredCandidates({ preferGood: false, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two [b]'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three [b]', 'three'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three [b] (USA) (EN)']);
    });

    it('should return the first candidate when none matching', async () => {
      await expectPreferredCandidates({ preferGood: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two two'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three', 'three three'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (USA) (EN)']);
    });

    it('should return the first matching candidate when some matching', async () => {
      await expectPreferredCandidates({ preferGood: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two [b]'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three [b]', 'three'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (USA) (EN)']);
    });

    it('should return the first candidate when all matching', async () => {
      await expectPreferredCandidates({ preferGood: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one [b]'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two [b]', 'two two [b]'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three [b]', 'three three [b]'], 'USA', 'EN'),
      ], ['one [b] (USA) (EN)', 'two [b] (USA) (EN)', 'three [b] (USA) (EN)']);
    });
  });

  describe('prefer languages', () => {
    it('should return the first candidate when option is empty', async () => {
      await expectPreferredCandidates({ preferLanguage: [], single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', ['ES', 'EN']),
        await buildReleaseCandidatesWithRegionLanguage('three', 'JPN', 'JA'),
        await buildReleaseCandidatesWithRegionLanguage('four', 'JPN', ['JA', 'EN']),
        await buildReleaseCandidatesWithRegionLanguage('five', 'EUR', ['DE', 'IT']),
        await buildReleaseCandidatesWithRegionLanguage('six', 'EUR', undefined),
      ], ['one (USA) (EN)', 'two (USA) (ES)', 'three (JPN) (JA)', 'four (JPN) (JA)', 'five (EUR) (DE)', 'six (EUR)']);
    });

    it('should return the first candidate when none matching', async () => {
      await expectPreferredCandidates({ preferLanguage: ['EN'], single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'SPA', 'ES'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JA'),
        await buildReleaseCandidatesWithRegionLanguage('three', 'EUR', ['DE', 'IT']),
        await buildReleaseCandidatesWithRegionLanguage('four', 'CHN', undefined),
      ], ['one (SPA) (ES)', 'two (JPN) (JA)', 'three (EUR) (DE)', 'four (CHN)']);
    });

    it('should return the first matching candidate when some matching', async () => {
      await expectPreferredCandidates({ preferLanguage: ['EN', 'JA'], single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', ['ES', 'EN']),
        await buildReleaseCandidatesWithRegionLanguage('three', 'JPN', 'JA'),
        await buildReleaseCandidatesWithRegionLanguage('four', 'JPN', ['JA', 'EN']),
        await buildReleaseCandidatesWithRegionLanguage('five', 'EUR', ['DE', 'IT']),
        await buildReleaseCandidatesWithRegionLanguage('six', ['CHN', 'EUR'], undefined),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (JPN) (JA)', 'four (JPN) (EN)', 'five (EUR) (DE)', 'six (EUR)']);
    });

    it('should return the first candidate when all matching', async () => {
      await expectPreferredCandidates({ preferLanguage: ['EN', 'JA'], single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', ['ES', 'EN']),
        await buildReleaseCandidatesWithRegionLanguage('three', 'JPN', 'JA'),
        await buildReleaseCandidatesWithRegionLanguage('four', 'JPN', ['JA', 'EN']),
        await buildReleaseCandidatesWithRegionLanguage('five', ['USA', 'JPN'], undefined),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (JPN) (JA)', 'four (JPN) (EN)', 'five (USA)']);
    });
  });

  describe('prefer regions', () => {
    it('should return the first candidate when option is false', async () => {
      await expectPreferredCandidates({ preferRegion: [], single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', ['ES', 'EN']),
        await buildReleaseCandidatesWithRegionLanguage('three', ['EUR', 'USA'], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('four', ['JPN', 'EUR'], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('five', ['TAI', 'CHN'], 'ZH'),
        await buildReleaseCandidatesWithRegionLanguage('six', 'USA', undefined),
        await buildReleaseCandidatesWithRegionLanguage(['seven', 'seven seven'], undefined, undefined),
      ], ['one (USA) (EN)', 'two (USA) (ES)', 'three (EUR) (EN)', 'four (JPN) (EN)', 'five (TAI) (ZH)', 'six (USA)', 'seven']);
    });

    it('should return the first candidate when none matching', async () => {
      await expectPreferredCandidates({ preferRegion: ['USA', 'EUR'], single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'EUR', ['DE', 'IT']),
        await buildReleaseCandidatesWithRegionLanguage('two', ['TAI', 'CHN'], 'ZH'),
        await buildReleaseCandidatesWithRegionLanguage('three (Japan)', undefined, undefined),
        await buildReleaseCandidatesWithRegionLanguage(['four', 'four four'], undefined, undefined),
      ], ['one (EUR) (DE)', 'two (TAI) (ZH)', 'three (Japan)', 'four']);
    });

    it('should return the first matching candidate when some matching', async () => {
      await expectPreferredCandidates({ preferRegion: ['USA', 'EUR'], single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', ['ES', 'EN']),
        await buildReleaseCandidatesWithRegionLanguage('three', ['EUR', 'USA'], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('four', ['JPN', 'EUR'], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['five (Japan)', 'five (Europe)'], undefined, undefined),
        await buildReleaseCandidatesWithRegionLanguage('six', ['TAI', 'CHN'], 'ZH'),
        await buildReleaseCandidatesWithRegionLanguage(['seven (Taiwan)', 'seven (China)'], undefined, undefined),
      ], ['one (USA) (EN)', 'two (USA) (ES)', 'three (USA) (EN)', 'four (EUR) (EN)', 'five (Europe)', 'six (TAI) (ZH)', 'seven (Taiwan)']);
    });

    it('should return the first candidate when all matching', async () => {
      await expectPreferredCandidates({ preferRegion: ['USA', 'EUR'], single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'USA', ['ES', 'EN']),
        await buildReleaseCandidatesWithRegionLanguage('three', ['EUR', 'USA'], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four (Europe)', 'four (USA)'], undefined, undefined),
      ], ['one (USA) (EN)', 'two (USA) (ES)', 'three (USA) (EN)', 'four (USA)']);
    });
  });

  describe('prefer revision newer', () => {
    it('should return the first candidate when option is false', async () => {
      await expectPreferredCandidates({ preferRevisionNewer: false, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two (Rev 1)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three', 'three (Rev 1)', 'three (Rev2)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four (Rev 1.1)', 'four (Rev 1.2)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['five (Rev 13.37)'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (USA) (EN)', 'four (Rev 1.1) (USA) (EN)', 'five (Rev 13.37) (USA) (EN)']);
    });

    it('should return the first candidate when none matching', async () => {
      await expectPreferredCandidates({ preferRevisionNewer: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two two'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)']);
    });

    it('should return the first matching candidate when some matching', async () => {
      await expectPreferredCandidates({ preferRevisionNewer: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two (Rev 1)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three', 'three (Rev 1)', 'three (Rev2)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four (Rev 1.1)', 'four (Rev 1.2)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['five (Rev 13.37)'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (Rev 1) (USA) (EN)', 'three (Rev2) (USA) (EN)', 'four (Rev 1.2) (USA) (EN)', 'five (Rev 13.37) (USA) (EN)']);
    });

    it('should return the first candidate when all matching', async () => {
      await expectPreferredCandidates({ preferRevisionNewer: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one (Rev 1.1)', 'one (Rev 1.2)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two (Rev 13.37)'], 'USA', 'EN'),
      ], ['one (Rev 1.2) (USA) (EN)', 'two (Rev 13.37) (USA) (EN)']);
    });
  });

  describe('prefer revision older', () => {
    it('should return the first candidate when option is false', async () => {
      await expectPreferredCandidates({ preferRevisionOlder: false, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two (Rev 1)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three', 'three (Rev 1)', 'three (Rev2)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four (Rev 1.1)', 'four (Rev 1.2)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['five (Rev 13.37)'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (USA) (EN)', 'four (Rev 1.1) (USA) (EN)', 'five (Rev 13.37) (USA) (EN)']);
    });

    it('should return the first candidate when none matching', async () => {
      await expectPreferredCandidates({ preferRevisionOlder: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two two'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)']);
    });

    it('should return the first matching candidate when some matching', async () => {
      await expectPreferredCandidates({ preferRevisionOlder: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two (Rev 1)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three', 'three (Rev 1)', 'three (Rev2)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four (Rev 1.1)', 'four (Rev 1.2)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['five (Rev 13.37)'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (USA) (EN)', 'four (Rev 1.1) (USA) (EN)', 'five (Rev 13.37) (USA) (EN)']);
    });

    it('should return the first candidate when all matching', async () => {
      await expectPreferredCandidates({ preferRevisionOlder: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one (Rev 1.1)', 'one (Rev 1.2)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two (Rev 13.37)'], 'USA', 'EN'),
      ], ['one (Rev 1.1) (USA) (EN)', 'two (Rev 13.37) (USA) (EN)']);
    });
  });

  describe('prefer retail', () => {
    it('should return the first candidate when option is false', async () => {
      await expectPreferredCandidates({ preferRetail: false, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two (Aftermarket)', 'two'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three [b]', 'three'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four (Beta)', 'four (Proto)', 'four'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['five (Demo)', 'five', 'five (Sample)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['six (Homebrew)', 'six'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['seven (Proto)', 'seven'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['eight (Sample)', 'eight'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['nine (Test)', 'nine'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (Aftermarket) (USA) (EN)', 'three [b] (USA) (EN)', 'four (Beta) (USA) (EN)', 'five (Demo) (USA) (EN)', 'six (Homebrew) (USA) (EN)', 'seven (Proto) (USA) (EN)', 'eight (Sample) (USA) (EN)', 'nine (Test) (USA) (EN)']);
    });

    it('should return the first candidate when none matching', async () => {
      await expectPreferredCandidates({ preferRetail: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two two'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three', 'three three', 'three three three'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (USA) (EN)']);
    });

    it('should return the first matching candidate when some matching', async () => {
      await expectPreferredCandidates({ preferRetail: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two (Aftermarket)', 'two'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three [b]', 'three'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four (Beta)', 'four (Proto)', 'four'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['five (Demo)', 'five', 'five (Sample)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['six (Homebrew)', 'six'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['seven (Proto)', 'seven'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['eight (Sample)', 'eight'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['nine (Test)', 'nine'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (USA) (EN)', 'four (USA) (EN)', 'five (USA) (EN)', 'six (USA) (EN)', 'seven (USA) (EN)', 'eight (USA) (EN)', 'nine (USA) (EN)']);
    });

    it('should return the first candidate when all matching', async () => {
      await expectPreferredCandidates({ preferRetail: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one (Aftermarket)', 'one'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two [b]', 'two'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three (Beta)', 'three (Proto)', 'three'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four (Demo)', 'four', 'four (Sample)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['five (Homebrew)', 'five'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['six (Proto)', 'six'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['seven (Sample)', 'seven'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['eight (Test)', 'eight'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (USA) (EN)', 'four (USA) (EN)', 'five (USA) (EN)', 'six (USA) (EN)', 'seven (USA) (EN)', 'eight (USA) (EN)']);
    });
  });

  describe('prefer parent', () => {
    it('should return the first candidate when option is false', async () => {
      await expectPreferredCandidates({ preferParent: false, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two two'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three', 'USA', 'EN', { cloneOf: 'zero' }),
        await buildReleaseCandidatesWithRegionLanguage(['four (Parent)', 'four (Clone)'], 'USA', 'EN', [{}, { cloneOf: 'zero' }]),
        await buildReleaseCandidatesWithRegionLanguage(['five (Clone)', 'five (Parent)'], 'USA', 'EN', [{ cloneOf: 'zero' }, {}]),
        await buildReleaseCandidatesWithRegionLanguage(['six (Clone 1)', 'six (Clone 2)'], 'USA', 'EN', [{ cloneOf: 'zero' }, { cloneOf: 'zero' }]),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (USA) (EN)', 'four (Parent) (USA) (EN)', 'five (Clone) (USA) (EN)', 'six (Clone 1) (USA) (EN)']);
    });

    it('should return the first candidate when none matching', async () => {
      await expectPreferredCandidates({ preferParent: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two two'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)']);
    });

    it('should return the first matching candidate when some matching', async () => {
      await expectPreferredCandidates({ preferParent: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two two'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('three', 'USA', 'EN', { cloneOf: 'zero' }),
        await buildReleaseCandidatesWithRegionLanguage(['four (Parent)', 'four (Clone)'], 'USA', 'EN', [{}, { cloneOf: 'zero' }]),
        await buildReleaseCandidatesWithRegionLanguage(['five (Clone)', 'five (Parent)'], 'USA', 'EN', [{ cloneOf: 'zero' }, {}]),
        await buildReleaseCandidatesWithRegionLanguage(['six (Clone 1)', 'six (Clone 2)'], 'USA', 'EN', [{ cloneOf: 'zero' }, { cloneOf: 'zero' }]),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (USA) (EN)', 'four (Parent) (USA) (EN)', 'five (Parent) (USA) (EN)', 'six (Clone 1) (USA) (EN)']);
    });

    it('should return the first candidate when all matching', async () => {
      await expectPreferredCandidates({ preferParent: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { cloneOf: 'zero' }),
        await buildReleaseCandidatesWithRegionLanguage(['two (Parent)', 'two (Clone)'], 'USA', 'EN', [{}, { cloneOf: 'zero' }]),
        await buildReleaseCandidatesWithRegionLanguage(['three (Clone)', 'three (Parent)'], 'USA', 'EN', [{ cloneOf: 'zero' }, {}]),
        await buildReleaseCandidatesWithRegionLanguage(['four (Clone 1)', 'four (Clone 2)'], 'USA', 'EN', [{ cloneOf: 'zero' }, { cloneOf: 'zero' }]),
      ], ['one (USA) (EN)', 'two (Parent) (USA) (EN)', 'three (Parent) (USA) (EN)', 'four (Clone 1) (USA) (EN)']);
    });
  });
});

describe('postFilter', () => {
  describe('single', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ single: false }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'EUR', ['DE', 'FR', 'IT']),
        await buildReleaseCandidatesWithRegionLanguage('three', ['CHN', 'TAI'], 'ZH'),
      ], 6);
    });

    it('should return all candidates with only single releases', async () => {
      await expectFilteredCandidates({ single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'EUR', 'DE'),
        await buildReleaseCandidatesWithRegionLanguage('three', 'CHN', 'ZH'),
      ], 3);
    });

    it('should return some candidates with mixed releases', async () => {
      await expectFilteredCandidates({ single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage('two', 'EUR', ['DE', 'FR', 'IT']),
        await buildReleaseCandidatesWithRegionLanguage('three', ['CHN', 'TAI'], 'ZH'),
      ], 3);
    });

    it('should return some candidates with multiple releases', async () => {
      await expectFilteredCandidates({ single: true }, [
        await buildReleaseCandidatesWithRegionLanguage('one', 'USA', ['EN', 'ES']),
        await buildReleaseCandidatesWithRegionLanguage('two', 'EUR', ['DE', 'FR', 'IT']),
        await buildReleaseCandidatesWithRegionLanguage('three', ['CHN', 'TAI'], 'ZH'),
      ], 3);
    });
  });
});
