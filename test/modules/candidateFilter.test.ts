import CandidateFilter from '../../src/modules/candidateFilter.js';
import Game, { GameProps } from '../../src/types/logiqx/game.js';
import Parent from '../../src/types/logiqx/parent.js';
import Release from '../../src/types/logiqx/release.js';
import ROM from '../../src/types/logiqx/rom.js';
import Options, { OptionsProps } from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ProgressBarFake from './progressBar/progressBarFake.js';

function buildCandidateFilter(options: object = {}): CandidateFilter {
  return new CandidateFilter(Options.fromObject(options), new ProgressBarFake());
}

async function expectFilteredCandidates(
  options: OptionsProps,
  parentsToCandidates: [Parent, ReleaseCandidate[]][],
  expectedSize: number,
) {
  const filteredParentsToCandidates = await buildCandidateFilter(options)
    .filter(new Map(parentsToCandidates));
  expect(filteredParentsToCandidates.size).toEqual(parentsToCandidates.length); // sanity check

  const totalCandidates = [...filteredParentsToCandidates.values()]
    .reduce((sum, candidate) => sum + candidate.length, 0);
  expect(totalCandidates).toEqual(expectedSize);
}

async function expectPreferredCandidates(
  options: OptionsProps,
  parentsToCandidates: [Parent, ReleaseCandidate[]][],
  expectedNames: string[],
) {
  const filteredParentsToCandidates = await buildCandidateFilter(options)
    .filter(new Map(parentsToCandidates));
  expect(filteredParentsToCandidates.size).toEqual(parentsToCandidates.length); // sanity check

  const totalCandidates = [...filteredParentsToCandidates.values()]
    .reduce((sum, candidate) => sum + candidate.length, 0);
  expect(totalCandidates).toEqual(parentsToCandidates.length); // sanity check

  const candidateNames = [...filteredParentsToCandidates.values()]
    .flatMap((candidate) => candidate.map((c) => c.getName()));
  expect(candidateNames).toHaveLength(parentsToCandidates.length); // sanity check
  for (let i = 0; i < expectedNames.length; i += 1) {
    const expectedName = expectedNames[i];
    expect(candidateNames).toContain(expectedName);
  }
}

function buildReleaseCandidatesWithRegionLanguage(
  names: string | string[],
  regions: string | string[],
  languages: string | string[],
  gameOptions?: GameProps,
): [Parent, ReleaseCandidate[]] {
  const namesArr = Array.isArray(names) ? names : [names];
  const regionsArr = Array.isArray(regions) ? regions : [regions];
  const languagesArr = Array.isArray(languages) ? languages : [languages];

  // Every different name+language combo is a different ROM+Game
  const games: Game[] = [];
  const releaseCandidates: ReleaseCandidate[] = [];
  for (let i = 0; i < namesArr.length; i += 1) {
    const name = namesArr[i];

    for (let j = 0; j < languagesArr.length; j += 1) {
      const language = languagesArr[j];

      // Every region is a different Release+ReleaseCandidate
      const releases: Release[] = [];
      for (let k = 0; k < regionsArr.length; k += 1) {
        const region = regionsArr[k];
        releases.push(new Release(`${name} (${region}) (${language})`, region, language));
      }

      const rom = new ROM(`${name}.rom`, '00000000');
      const game = new Game({
        name, rom: [rom], release: releases, ...gameOptions,
      });
      games.push(game);

      /** {@see CandidateGenerator} */
      for (let k = 0; k < releases.length; k += 1) {
        const release = releases[k];
        releaseCandidates.push(new ReleaseCandidate(
          game,
          release,
          game.getRoms(),
          game.getRoms().map((gameRom) => gameRom.toRomFile()),
        ));
      }
    }
  }

  const parent = new Parent(namesArr[0], games);
  return [parent, releaseCandidates];
}

describe('preFilter', () => {
  it('should return all candidates if no filter', async () => {
    await expectFilteredCandidates({}, [], 0);

    await expectFilteredCandidates({}, [
      buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
    ], 1);

    await expectFilteredCandidates({}, [
      buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
      buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JP'),
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
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
      ], 0);

      await expectFilteredCandidates({
        languageFilter: ['ZH'],
      }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JP'),
        buildReleaseCandidatesWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({
        languageFilter: ['ZH'],
      }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'CHN', 'ZH'),
        buildReleaseCandidatesWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ], 1);

      await expectFilteredCandidates({
        languageFilter: ['EN', 'ZH'],
      }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JP'),
        buildReleaseCandidatesWithRegionLanguage('three', 'ASI', ['JP', 'KO', 'ZH']),
      ], 2);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({
        languageFilter: ['EN'],
      }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
      ], 1);

      await expectFilteredCandidates({
        languageFilter: ['EN', 'ZH'],
      }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'CHN', 'ZH'),
      ], 2);

      await expectFilteredCandidates({
        languageFilter: ['EN', 'JP'],
      }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JP'),
        buildReleaseCandidatesWithRegionLanguage('three', 'ASI', ['JP', 'KO', 'ZH']),
      ], 3);
    });
  });

  describe('region filter', () => {
    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({
        regionFilter: ['EUR'],
      }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
      ], 0);

      await expectFilteredCandidates({
        regionFilter: ['CHN'],
      }, [
        buildReleaseCandidatesWithRegionLanguage('one', ['USA', 'CAN'], 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JP'),
        buildReleaseCandidatesWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({
        regionFilter: ['USA'],
      }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'CHN', 'ZH'),
        buildReleaseCandidatesWithRegionLanguage('three', 'EUR', ['DE', 'IT', 'EN']),
      ], 1);

      await expectFilteredCandidates({
        regionFilter: ['CAN', 'ASI'],
      }, [
        buildReleaseCandidatesWithRegionLanguage('one', ['USA', 'CAN'], 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JP'),
        buildReleaseCandidatesWithRegionLanguage('three', 'ASI', ['JP', 'KO', 'ZH']),
      ], 4);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({
        regionFilter: ['USA'],
      }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
      ], 1);

      await expectFilteredCandidates({
        regionFilter: ['USA', 'CHN'],
      }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'CHN', 'ZH'),
      ], 2);

      await expectFilteredCandidates({
        regionFilter: ['USA', 'JPN'],
      }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'JPN', 'JP'),
        buildReleaseCandidatesWithRegionLanguage('three', ['ASI', 'JPN'], ['JP', 'KO', 'ZH']),
      ], 5);
    });
  });

  describe('only bios', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ onlyBios: false }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
        buildReleaseCandidatesWithRegionLanguage('three', 'USA', 'EN', { bios: 'no' }),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ onlyBios: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'no' }),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ onlyBios: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
        buildReleaseCandidatesWithRegionLanguage('three', 'USA', 'EN', { bios: 'no' }),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ onlyBios: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'yes' }),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
      ], 2);
    });
  });

  describe('no bios', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noBios: false }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
        buildReleaseCandidatesWithRegionLanguage('three', 'USA', 'EN', { bios: 'no' }),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noBios: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'yes' }),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noBios: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'yes' }),
        buildReleaseCandidatesWithRegionLanguage('three', 'USA', 'EN', { bios: 'no' }),
      ], 2);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noBios: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN', { bios: 'no' }),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN', { bios: 'no' }),
      ], 2);
    });
  });

  describe('no unlicensed', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noUnlicensed: false }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Unl)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Unlicensed)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noUnlicensed: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Unl)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Unlicensed)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noUnlicensed: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Unlicensed)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Unl)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noUnlicensed: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('only retail', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ onlyRetail: false }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three [b]', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('four (Beta)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('five (Demo)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('six (Homebrew)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('seven (Proto)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('eight (Sample)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('nine (Test)', 'USA', 'EN'),
      ], 9);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ onlyRetail: true }, [
        buildReleaseCandidatesWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three [b]', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('four (Beta)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('five (Demo)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('six (Homebrew)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('seven (Proto)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('eight (Sample)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('nine (Test)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ onlyRetail: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three [b]', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('four (Beta)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('five (Demo)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('six (Homebrew)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('seven (Proto)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('eight (Sample)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('nine (Test)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('ten', 'USA', 'EN'),
      ], 2);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ onlyRetail: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no demo', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noDemo: false }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Demo)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Demo 2000)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noDemo: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Demo)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Demo 2000)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noDemo: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Demo 2000)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Demo)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noDemo: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no beta', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noBeta: false }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Beta)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Beta v1.0)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noBeta: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Beta)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Beta v1.0)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noBeta: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Beta v1.0)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Beta)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noBeta: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no sample', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noSample: false }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Sample)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Sample Copy)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noSample: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Sample)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Sample Copy)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noSample: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Sample Copy)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Sample)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noSample: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no prototype', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noPrototype: false }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Proto)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Prototype)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noPrototype: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Proto)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Prototype)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noPrototype: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Prototype)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Proto)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noPrototype: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no test roms', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noTestRoms: false }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Test)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Test Copy)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noTestRoms: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Test)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Test Copy)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noTestRoms: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Test Copy)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Test)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noTestRoms: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no aftermarket', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noAftermarket: false }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Aftermarket)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Aftermarket Version)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noAftermarket: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Aftermarket)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Aftermarket Version)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noAftermarket: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Aftermarket Version)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Aftermarket)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noAftermarket: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no homebrew', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noHomebrew: false }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Homebrew)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Homebrew Edition)', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noHomebrew: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Homebrew)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two (Homebrew Edition)', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noHomebrew: true }, [
        buildReleaseCandidatesWithRegionLanguage('one (Homebrew Edition)', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three (Homebrew)', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noHomebrew: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });

  describe('no bad', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noBad: false }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two [b]', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three [b]', 'USA', 'EN'),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noBad: true }, [
        buildReleaseCandidatesWithRegionLanguage('one [b]', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two [b]', 'USA', 'EN'),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noBad: true }, [
        buildReleaseCandidatesWithRegionLanguage('one [b]', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('three [b]', 'USA', 'EN'),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noBad: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'USA', 'EN'),
      ], 2);
    });
  });
});

describe('sort', () => {
  describe('prefer good', () => {
    it('should return the first candidate when option is false', async () => {
      await expectPreferredCandidates({ preferGood: false, single: true }, [
        buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage(['two', 'two [b]'], 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage(['three [b]', 'three'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three [b] (USA) (EN)']);
    });

    it('should return the first candidate when none matching', async () => {
      await expectPreferredCandidates({ preferGood: true, single: true }, [
        buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage(['two', 'two two'], 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage(['three', 'three three'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (USA) (EN)']);
    });

    it('should return the first matching candidate when some matching', async () => {
      await expectPreferredCandidates({ preferGood: true, single: true }, [
        buildReleaseCandidatesWithRegionLanguage(['one'], 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage(['two', 'two [b]'], 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage(['three [b]', 'three'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (USA) (EN)']);
    });

    it('should return the first candidate when all matching', async () => {
      await expectPreferredCandidates({ preferGood: true, single: true }, [
        buildReleaseCandidatesWithRegionLanguage(['one [b]'], 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage(['two [b]', 'two two [b]'], 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage(['three [b]', 'three three [b]'], 'USA', 'EN'),
      ], ['one [b] (USA) (EN)', 'two [b] (USA) (EN)', 'three [b] (USA) (EN)']);
    });
  });

  describe('prefer languages', () => {
    // TODO(cemmer)
  });

  describe('prefer regions', () => {
    // TODO(cemmer)
  });

  describe('prefer revision newer', () => {
    // TODO(cemmer)
  });

  describe('prefer revision older', () => {
    // TODO(cemmer)
  });

  describe('prefer retail', () => {
    // TODO(cemmer)
  });

  describe('prefer parent', () => {
    // TODO(cemmer)
  });
});

describe('postFilter', () => {
  describe('single', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ single: false }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'EUR', ['DE', 'FR', 'IT']),
        buildReleaseCandidatesWithRegionLanguage('three', ['CHN', 'TAI'], 'ZH'),
      ], 6);
    });

    it('should return all candidates with only single releases', async () => {
      await expectFilteredCandidates({ single: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'EUR', 'DE'),
        buildReleaseCandidatesWithRegionLanguage('three', 'CHN', 'ZH'),
      ], 3);
    });

    it('should return some candidates with mixed releases', async () => {
      await expectFilteredCandidates({ single: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', 'EN'),
        buildReleaseCandidatesWithRegionLanguage('two', 'EUR', ['DE', 'FR', 'IT']),
        buildReleaseCandidatesWithRegionLanguage('three', ['CHN', 'TAI'], 'ZH'),
      ], 3);
    });

    it('should return some candidates with multiple releases', async () => {
      await expectFilteredCandidates({ single: true }, [
        buildReleaseCandidatesWithRegionLanguage('one', 'USA', ['EN', 'ES']),
        buildReleaseCandidatesWithRegionLanguage('two', 'EUR', ['DE', 'FR', 'IT']),
        buildReleaseCandidatesWithRegionLanguage('three', ['CHN', 'TAI'], 'ZH'),
      ], 3);
    });
  });
});
