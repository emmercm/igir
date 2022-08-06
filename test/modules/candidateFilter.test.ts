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
  expect(filteredParentsToCandidates.size).toEqual(parentsToCandidates.length);

  const totalCandidates = [...filteredParentsToCandidates.values()]
    .reduce((sum, candidate) => sum + candidate.length, 0);
  expect(totalCandidates).toEqual(expectedSize);
}

function buildParentToReleaseCandidates(
  name: string,
  regions: string[],
  languages: string[],
  gameOptions?: GameProps,
): [Parent, ReleaseCandidate[]] {
  const releases = regions
    .flatMap((region) => languages.map((language) => new Release(name, region, language)));

  const rom = new ROM(`${name}.rom`, '00000000');
  const game = new Game({
    name, rom: [rom], release: releases, ...gameOptions,
  });

  const parent = new Parent(name, game);
  const releaseCandidates = releases.map((release) => new ReleaseCandidate(
    game,
    release,
    game.getRoms(),
    game.getRoms().map((gameRom) => gameRom.toRomFile()),
  ));
  return [parent, releaseCandidates];
}

describe('preFilter', () => {
  it('should return all candidates if no filter', async () => {
    await expectFilteredCandidates({}, [], 0);

    await expectFilteredCandidates({}, [
      buildParentToReleaseCandidates('one', ['USA'], ['EN']),
    ], 1);

    await expectFilteredCandidates({}, [
      buildParentToReleaseCandidates('one', ['USA'], ['EN']),
      buildParentToReleaseCandidates('two', ['JPN'], ['JP']),
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
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
      ], 0);

      await expectFilteredCandidates({
        languageFilter: ['ZH'],
      }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['JPN'], ['JP']),
        buildParentToReleaseCandidates('three', ['EUR'], ['DE', 'IT', 'EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({
        languageFilter: ['ZH'],
      }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['CHN'], ['ZH']),
        buildParentToReleaseCandidates('three', ['EUR'], ['DE', 'IT', 'EN']),
      ], 1);

      await expectFilteredCandidates({
        languageFilter: ['EN', 'ZH'],
      }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['JPN'], ['JP']),
        buildParentToReleaseCandidates('three', ['ASI'], ['JP', 'KO', 'ZH']),
      ], 2);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({
        languageFilter: ['EN'],
      }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
      ], 1);

      await expectFilteredCandidates({
        languageFilter: ['EN', 'ZH'],
      }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['CHN'], ['ZH']),
      ], 2);

      await expectFilteredCandidates({
        languageFilter: ['EN', 'JP'],
      }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['JPN'], ['JP']),
        buildParentToReleaseCandidates('three', ['ASI'], ['JP', 'KO', 'ZH']),
      ], 3);
    });
  });

  describe('region filter', () => {
    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({
        regionFilter: ['EUR'],
      }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
      ], 0);

      await expectFilteredCandidates({
        regionFilter: ['CHN'],
      }, [
        buildParentToReleaseCandidates('one', ['USA', 'CAN'], ['EN']),
        buildParentToReleaseCandidates('two', ['JPN'], ['JP']),
        buildParentToReleaseCandidates('three', ['EUR'], ['DE', 'IT', 'EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({
        regionFilter: ['USA'],
      }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['CHN'], ['ZH']),
        buildParentToReleaseCandidates('three', ['EUR'], ['DE', 'IT', 'EN']),
      ], 1);

      await expectFilteredCandidates({
        regionFilter: ['CAN', 'ASI'],
      }, [
        buildParentToReleaseCandidates('one', ['USA', 'CAN'], ['EN']),
        buildParentToReleaseCandidates('two', ['JPN'], ['JP']),
        buildParentToReleaseCandidates('three', ['ASI'], ['JP', 'KO', 'ZH']),
      ], 4);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({
        regionFilter: ['USA'],
      }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
      ], 1);

      await expectFilteredCandidates({
        regionFilter: ['USA', 'CHN'],
      }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['CHN'], ['ZH']),
      ], 2);

      await expectFilteredCandidates({
        regionFilter: ['USA', 'JPN'],
      }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['JPN'], ['JP']),
        buildParentToReleaseCandidates('three', ['ASI', 'JPN'], ['JP', 'KO', 'ZH']),
      ], 5);
    });
  });

  describe('only bios', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ onlyBios: false }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN'], { bios: 'no' }),
        buildParentToReleaseCandidates('two', ['USA'], ['EN'], { bios: 'yes' }),
        buildParentToReleaseCandidates('three', ['USA'], ['EN'], { bios: 'no' }),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ onlyBios: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN'], { bios: 'no' }),
        buildParentToReleaseCandidates('two', ['USA'], ['EN'], { bios: 'no' }),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ onlyBios: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN'], { bios: 'no' }),
        buildParentToReleaseCandidates('two', ['USA'], ['EN'], { bios: 'yes' }),
        buildParentToReleaseCandidates('three', ['USA'], ['EN'], { bios: 'no' }),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ onlyBios: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN'], { bios: 'yes' }),
        buildParentToReleaseCandidates('two', ['USA'], ['EN'], { bios: 'yes' }),
      ], 2);
    });
  });

  describe('no bios', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noBios: false }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN'], { bios: 'no' }),
        buildParentToReleaseCandidates('two', ['USA'], ['EN'], { bios: 'yes' }),
        buildParentToReleaseCandidates('three', ['USA'], ['EN'], { bios: 'no' }),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noBios: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN'], { bios: 'yes' }),
        buildParentToReleaseCandidates('two', ['USA'], ['EN'], { bios: 'yes' }),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noBios: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN'], { bios: 'no' }),
        buildParentToReleaseCandidates('two', ['USA'], ['EN'], { bios: 'yes' }),
        buildParentToReleaseCandidates('three', ['USA'], ['EN'], { bios: 'no' }),
      ], 2);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noBios: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN'], { bios: 'no' }),
        buildParentToReleaseCandidates('two', ['USA'], ['EN'], { bios: 'no' }),
      ], 2);
    });
  });

  describe('no unlicensed', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noUnlicensed: false }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Unl)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Unlicensed)', ['USA'], ['EN']),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noUnlicensed: true }, [
        buildParentToReleaseCandidates('one (Unl)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Unlicensed)', ['USA'], ['EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noUnlicensed: true }, [
        buildParentToReleaseCandidates('one (Unlicensed)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Unl)', ['USA'], ['EN']),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noUnlicensed: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
      ], 2);
    });
  });

  describe('only retail', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ onlyRetail: false }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Aftermarket)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three [b]', ['USA'], ['EN']),
        buildParentToReleaseCandidates('four (Beta)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('five (Demo)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('six (Homebrew)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('seven (Proto)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('eight (Sample)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('nine (Test)', ['USA'], ['EN']),
      ], 9);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ onlyRetail: true }, [
        buildParentToReleaseCandidates('two (Aftermarket)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three [b]', ['USA'], ['EN']),
        buildParentToReleaseCandidates('four (Beta)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('five (Demo)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('six (Homebrew)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('seven (Proto)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('eight (Sample)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('nine (Test)', ['USA'], ['EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ onlyRetail: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Aftermarket)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three [b]', ['USA'], ['EN']),
        buildParentToReleaseCandidates('four (Beta)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('five (Demo)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('six (Homebrew)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('seven (Proto)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('eight (Sample)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('nine (Test)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('ten', ['USA'], ['EN']),
      ], 2);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ onlyRetail: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
      ], 2);
    });
  });

  describe('no demo', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noDemo: false }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Demo)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Demo 2000)', ['USA'], ['EN']),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noDemo: true }, [
        buildParentToReleaseCandidates('one (Demo)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Demo 2000)', ['USA'], ['EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noDemo: true }, [
        buildParentToReleaseCandidates('one (Demo 2000)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Demo)', ['USA'], ['EN']),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noDemo: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
      ], 2);
    });
  });

  describe('no beta', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noBeta: false }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Beta)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Beta v1.0)', ['USA'], ['EN']),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noBeta: true }, [
        buildParentToReleaseCandidates('one (Beta)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Beta v1.0)', ['USA'], ['EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noBeta: true }, [
        buildParentToReleaseCandidates('one (Beta v1.0)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Beta)', ['USA'], ['EN']),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noBeta: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
      ], 2);
    });
  });

  describe('no sample', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noSample: false }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Sample)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Sample Copy)', ['USA'], ['EN']),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noSample: true }, [
        buildParentToReleaseCandidates('one (Sample)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Sample Copy)', ['USA'], ['EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noSample: true }, [
        buildParentToReleaseCandidates('one (Sample Copy)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Sample)', ['USA'], ['EN']),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noSample: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
      ], 2);
    });
  });

  describe('no prototype', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noPrototype: false }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Proto)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Prototype)', ['USA'], ['EN']),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noPrototype: true }, [
        buildParentToReleaseCandidates('one (Proto)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Prototype)', ['USA'], ['EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noPrototype: true }, [
        buildParentToReleaseCandidates('one (Prototype)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Proto)', ['USA'], ['EN']),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noPrototype: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
      ], 2);
    });
  });

  describe('no test roms', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noTestRoms: false }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Test)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Test Copy)', ['USA'], ['EN']),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noTestRoms: true }, [
        buildParentToReleaseCandidates('one (Test)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Test Copy)', ['USA'], ['EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noTestRoms: true }, [
        buildParentToReleaseCandidates('one (Test Copy)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Test)', ['USA'], ['EN']),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noTestRoms: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
      ], 2);
    });
  });

  describe('no aftermarket', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noAftermarket: false }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Aftermarket)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Aftermarket Version)', ['USA'], ['EN']),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noAftermarket: true }, [
        buildParentToReleaseCandidates('one (Aftermarket)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Aftermarket Version)', ['USA'], ['EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noAftermarket: true }, [
        buildParentToReleaseCandidates('one (Aftermarket Version)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Aftermarket)', ['USA'], ['EN']),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noAftermarket: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
      ], 2);
    });
  });

  describe('no homebrew', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noHomebrew: false }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Homebrew)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Homebrew Edition)', ['USA'], ['EN']),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noHomebrew: true }, [
        buildParentToReleaseCandidates('one (Homebrew)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two (Homebrew Edition)', ['USA'], ['EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noHomebrew: true }, [
        buildParentToReleaseCandidates('one (Homebrew Edition)', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three (Homebrew)', ['USA'], ['EN']),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noHomebrew: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
      ], 2);
    });
  });

  describe('no bad', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ noBad: false }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two [b]', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three [b]', ['USA'], ['EN']),
      ], 3);
    });

    it('should return no candidates if none matching', async () => {
      await expectFilteredCandidates({ noBad: true }, [
        buildParentToReleaseCandidates('one [b]', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two [b]', ['USA'], ['EN']),
      ], 0);
    });

    it('should return some candidates if some matching', async () => {
      await expectFilteredCandidates({ noBad: true }, [
        buildParentToReleaseCandidates('one [b]', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
        buildParentToReleaseCandidates('three [b]', ['USA'], ['EN']),
      ], 1);
    });

    it('should return all candidates if all matching', async () => {
      await expectFilteredCandidates({ noBad: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['USA'], ['EN']),
      ], 2);
    });
  });
});

describe('sort', () => {
  // TODO(cemmer)

  describe('prefer good', () => {});

  describe('prefer languages', () => {});

  describe('prefer regions', () => {});

  describe('prefer revision newer', () => {});

  describe('prefer revision older', () => {});

  describe('prefer retail', () => {});

  describe('prefer parent', () => {});
});

describe('postFilter', () => {
  describe('single', () => {
    it('should return all candidates when option is false', async () => {
      await expectFilteredCandidates({ single: false }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['EUR'], ['DE', 'FR', 'IT']),
        buildParentToReleaseCandidates('three', ['CHN', 'TAI'], ['ZH']),
      ], 6);
    });

    it('should return all candidates with only single releases', async () => {
      await expectFilteredCandidates({ single: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['EUR'], ['DE']),
        buildParentToReleaseCandidates('three', ['CHN'], ['ZH']),
      ], 3);
    });

    it('should return some candidates with mixed releases', async () => {
      await expectFilteredCandidates({ single: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN']),
        buildParentToReleaseCandidates('two', ['EUR'], ['DE', 'FR', 'IT']),
        buildParentToReleaseCandidates('three', ['CHN', 'TAI'], ['ZH']),
      ], 3);
    });

    it('should return some candidates with multiple releases', async () => {
      await expectFilteredCandidates({ single: true }, [
        buildParentToReleaseCandidates('one', ['USA'], ['EN', 'ES']),
        buildParentToReleaseCandidates('two', ['EUR'], ['DE', 'FR', 'IT']),
        buildParentToReleaseCandidates('three', ['CHN', 'TAI'], ['ZH']),
      ], 3);
    });
  });
});
