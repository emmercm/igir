import CandidatePreferer from '../../src/modules/candidatePreferer.js';
import Game, { GameProps } from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import Parent from '../../src/types/dats/parent.js';
import Release from '../../src/types/dats/release.js';
import ROM from '../../src/types/dats/rom.js';
import Options, { OptionsProps } from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
import ProgressBarFake from '../console/progressBarFake.js';

function buildCandidateFilter(options: OptionsProps = {}): CandidatePreferer {
  return new CandidatePreferer(new Options(options), new ProgressBarFake());
}

async function expectFilteredCandidates(
  options: OptionsProps,
  parentsToCandidates: [Parent, ReleaseCandidate[]][],
  expectedSize: number,
): Promise<void> {
  const dat = new LogiqxDAT(new Header(), []);

  const [filteredParentsToCandidates] = await Promise.all([buildCandidateFilter(options)
    .prefer(dat, new Map(parentsToCandidates))]);

  const totalCandidates = [...filteredParentsToCandidates.values()]
    .reduce((sum, candidate) => sum + candidate.length, 0);
  expect(totalCandidates).toEqual(expectedSize);
}

async function expectPreferredCandidates(
  options: OptionsProps,
  parentsToCandidates: [Parent, ReleaseCandidate[]][],
  expectedNames: string[],
): Promise<void> {
  const dat = new LogiqxDAT(new Header(), []);

  const filteredParentsToCandidates = await buildCandidateFilter(options)
    .prefer(dat, new Map(parentsToCandidates));
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
  for (const expectedName of expectedNames) {
    expect(candidateNames).toContain(expectedName);
  }
}

function arrayCoerce<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) {
    return [];
  }
  return Array.isArray(val) ? val : [val];
}

async function buildReleaseCandidatesWithRegionLanguage(
  gameNames: string | string[],
  regions?: string | string[],
  languages?: string | string[],
  gameOptions?: GameProps | GameProps[],
): Promise<[Parent, ReleaseCandidate[]]> {
  const gameNamesArr = arrayCoerce(gameNames);
  const regionsArr = arrayCoerce(regions);
  const languagesArr = Array.isArray(languages) ? languages : [languages];
  const gameOptionsArr = arrayCoerce(gameOptions);

  // Every different name+language combo is a different ROM+Game
  const games: Game[] = [];
  const releaseCandidates: ReleaseCandidate[] = [];
  for (const [idx, gameName] of gameNamesArr.entries()) {
    for (const language of languagesArr) {
      // Every region is a different Release+ReleaseCandidate
      const releases: Release[] = [];
      for (const region of regionsArr) {
        let releaseName = gameName;
        if (region) {
          releaseName += ` (${region})`;
        }
        if (language) {
          releaseName += ` (${language})`;
        }
        releases.push(new Release(releaseName, region, language));
      }

      const rom = new ROM({ name: `${gameName}.rom`, size: 0, crc: '00000000' });
      const game = new Game({
        name: gameName,
        rom: [rom],
        release: releases,
        ...gameOptionsArr[idx],
      });
      games.push(game);

      /** {@see CandidateGenerator} */
      const releaseCandidateReleases = releases.length > 0 ? releases : [undefined];
      for (const release of releaseCandidateReleases) {
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

  const parent = new Parent(games[0], games);
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

describe('sort', () => {
  describe('prefer game regex', () => {
    it('should return the first candidate when option is empty', async () => {
      await expectPreferredCandidates({ preferGameRegex: undefined, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'three'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four', 'five', 'six'], [], 'EN'),
      ], ['one', 'two', 'four']);
    });

    it('should return the first candidate when none matching', async () => {
      await expectPreferredCandidates({ preferGameRegex: 'NINE', single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'three'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four', 'five', 'six'], [], 'EN'),
      ], ['one', 'two', 'four']);
    });

    it('should return the first matching candidate when some matching', async () => {
      await expectPreferredCandidates({ preferGameRegex: '/THREE|five/i', single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'three'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four', 'five', 'six'], [], 'EN'),
      ], ['one', 'three', 'five']);
    });

    it('should return the first candidate when all matching', async () => {
      await expectPreferredCandidates({ preferGameRegex: '[aeiou]', single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'three'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four', 'five', 'six'], [], 'EN'),
      ], ['one', 'two', 'four']);
    });
  });

  describe('prefer rom regex', () => {
    it('should return the first candidate when option is empty', async () => {
      await expectPreferredCandidates({ preferRomRegex: undefined, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'three'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four', 'five', 'six'], [], 'EN'),
      ], ['one', 'two', 'four']);
    });

    it('should return the first candidate when none matching', async () => {
      await expectPreferredCandidates({ preferRomRegex: '/five\\.nes/i', single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'three'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four', 'five', 'six'], [], 'EN'),
      ], ['one', 'two', 'four']);
    });

    it('should return the first matching candidate when some matching', async () => {
      await expectPreferredCandidates({ preferRomRegex: '/THREE|five\\.rom/i', single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'three'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four', 'five', 'six'], [], 'EN'),
      ], ['one', 'three', 'five']);
    });

    it('should return the first candidate when all matching', async () => {
      await expectPreferredCandidates({ preferRomRegex: '[aeiou]', single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'three'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four', 'five', 'six'], [], 'EN'),
      ], ['one', 'two', 'four']);
    });
  });

  describe('prefer verified', () => {
    it('should return the first candidate when option is false', async () => {
      await expectPreferredCandidates({ preferVerified: false, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two [!]'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three [!]', 'three'], [], 'EN'),
      ], ['one', 'two', 'three [!]']);
    });

    it('should return the first candidate when none matching', async () => {
      await expectPreferredCandidates({ preferVerified: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two two'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three', 'three three'], [], 'EN'),
      ], ['one', 'two', 'three']);
    });

    it('should return the first matching candidate when some matching', async () => {
      await expectPreferredCandidates({ preferVerified: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two [!]'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three [!]', 'three'], [], 'EN'),
      ], ['one', 'two [!]', 'three [!]']);
    });

    it('should return the first candidate when all matching', async () => {
      await expectPreferredCandidates({ preferVerified: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one [!]'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['two [!]', 'two two [!]'], [], 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three [!]', 'three three [!]'], [], 'EN'),
      ], ['one [!]', 'two [!]', 'three [!]']);
    });
  });

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

    it('should treat "World" as English', async () => {
      const gameParent = new Game({ name: 'Akumajou Special - Boku Dracula-kun (Japan)', release: new Release('Akumajou Special - Boku Dracula-kun (Japan)', 'JPN') });
      const gameWorldJa = new Game({ name: 'Akumajou Special - Boku Dracula-kun (World) (Ja) (Castlevania Anniversary Collection)' });
      const gameWorld = new Game({ name: 'Kid Dracula (World) (Castlevania Anniversary Collection)' });
      const games = [gameParent, gameWorldJa, gameWorld];
      const parent = new Parent(gameParent, games);
      const releaseCandidates = games
        .map((game) => new ReleaseCandidate(game, game.getReleases()[0], []));
      await expectPreferredCandidates({ single: true, preferLanguage: ['EN'] }, [[parent, releaseCandidates]], [gameWorld.getName()]);
    });

    test.each([
      [
        // Single language matches both candidates, choose the first
        ['Tintin in Tibet (Europe) (En,Fr,De,Nl)', 'Tintin in Tibet (Europe) (En,Es,Sv)'],
        ['EN'],
        'Tintin in Tibet (Europe) (En,Fr,De,Nl)',
      ],
      [
        // First language matches both, use the second language
        ['Tintin in Tibet (Europe) (En,Fr,De,Nl)', 'Tintin in Tibet (Europe) (En,Es,Sv)'],
        ['EN', 'ES'],
        'Tintin in Tibet (Europe) (En,Es,Sv)',
      ],
      [
        // First language matches both, use the second language (reverse)
        ['Tintin in Tibet (Europe) (En,Fr,De,Nl)', 'Tintin in Tibet (Europe) (En,Es,Sv)'],
        ['EN', 'ES'],
        'Tintin in Tibet (Europe) (En,Es,Sv)',
      ],
      [
        // First and second language match different candidates, choose the first language
        ['Tintin in Tibet (Europe) (En,Fr,De,Nl)', 'Tintin in Tibet (Europe) (En,Es,Sv)'],
        ['SV', 'DE'],
        'Tintin in Tibet (Europe) (En,Es,Sv)',
      ],
    ])('should rank candidates by all preferred languages: %s', async (gameNames, preferLanguage, expectedName) => {
      const games = gameNames.map((gameName) => new Game({ name: gameName }));
      const parent = new Parent(games[0], games);
      const releaseCandidates = games.map((game) => new ReleaseCandidate(game, undefined, []));
      await expectPreferredCandidates({ preferLanguage, single: true }, [
        [parent, releaseCandidates],
      ], [expectedName]);
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
    test.each([
      [['one'], 'one'],
      [['two', 'two (Rev 1)'], 'two'],
      [['three', 'three (Rev 1)', 'three (Rev2)'], 'three'],
      [['four (Rev 1.1)', 'four (Rev 1.2)'], 'four (Rev 1.1)'],
      [['five (Rev 13.37)'], 'five (Rev 13.37)'],
      [['six (Rev B)', 'six (Rev A)', 'six (Rev C)'], 'six (Rev B)'],
      [['seven (RE2)', 'seven (RE3)', 'seven'], 'seven (RE2)'],
    ])('should return the first candidate when option is false: %s', async (names, expectedName) => {
      await expectPreferredCandidates(
        { preferRevisionNewer: false, single: true },
        [await buildReleaseCandidatesWithRegionLanguage(names)],
        [expectedName],
      );
    });

    test.each([
      [['one'], 'one'],
      [['two', 'two two'], 'two'],
    ])('should return the first candidate when none matching: %s', async (names, expectedName) => {
      await expectPreferredCandidates(
        { preferRevisionNewer: true, single: true },
        [await buildReleaseCandidatesWithRegionLanguage(names)],
        [expectedName],
      );
    });

    test.each([
      [['one'], 'one'],
      [['two', 'two (Rev 1)'], 'two (Rev 1)'],
      [['three', 'three (Rev 1)', 'three (Rev2)'], 'three (Rev2)'],
      [['four (Rev 1.1)', 'four (Rev 1.2)'], 'four (Rev 1.2)'],
      [['five (Rev 13.37)'], 'five (Rev 13.37)'],
      [['six (Rev B)', 'six (Rev A)', 'six (Rev C)'], 'six (Rev C)'],
      [['seven (RE2)', 'seven (RE3)', 'seven'], 'seven (RE3)'],
    ])('should return the first matching candidate when some matching: %s', async (names, expectedName) => {
      await expectPreferredCandidates(
        { preferRevisionNewer: true, single: true },
        [await buildReleaseCandidatesWithRegionLanguage(names)],
        [expectedName],
      );
    });

    test.each([
      [['one (Rev 1.1)', 'one (Rev 1.2)'], 'one (Rev 1.2)'],
      [['two (Rev 13.37)'], 'two (Rev 13.37)'],
    ])('should return the first candidate when all matching: %s', async (names, expectedName) => {
      await expectPreferredCandidates(
        { preferRevisionNewer: true, single: true },
        [await buildReleaseCandidatesWithRegionLanguage(names)],
        [expectedName],
      );
    });
  });

  describe('prefer revision older', () => {
    test.each([
      [['one'], 'one'],
      [['two', 'two (Rev 1)'], 'two'],
      [['three', 'three (Rev 1)', 'three (Rev2)'], 'three'],
      [['four (Rev 1.1)', 'four (Rev 1.2)'], 'four (Rev 1.1)'],
      [['five (Rev 13.37)'], 'five (Rev 13.37)'],
      [['six (Rev B)', 'six (Rev A)', 'six (Rev C)'], 'six (Rev B)'],
      [['seven (RE2)', 'seven (RE3)', 'seven'], 'seven (RE2)'],
    ])('should return the first candidate when option is false: %s', async (names, expectedName) => {
      await expectPreferredCandidates(
        { preferRevisionOlder: false, single: true },
        [await buildReleaseCandidatesWithRegionLanguage(names)],
        [expectedName],
      );
    });

    test.each([
      [['one'], 'one'],
      [['two', 'two two'], 'two'],
    ])('should return the first candidate when none matching: %s', async (names, expectedName) => {
      await expectPreferredCandidates(
        { preferRevisionOlder: true, single: true },
        [await buildReleaseCandidatesWithRegionLanguage(names)],
        [expectedName],
      );
    });

    test.each([
      [['one'], 'one'],
      [['two', 'two (Rev 1)'], 'two'],
      [['three', 'three (Rev 1)', 'three (Rev2)'], 'three'],
      [['four (Rev 1.2)', 'four (Rev 1.1)'], 'four (Rev 1.1)'],
      [['five (Rev 13.37)'], 'five (Rev 13.37)'],
      [['six (Rev B)', 'six (Rev A)', 'six (Rev C)'], 'six (Rev A)'],
      [['seven (RE2)', 'seven (RE3)', 'seven'], 'seven'],
    ])('should return the first matching candidate when some matching: %s', async (names, expectedName) => {
      await expectPreferredCandidates(
        { preferRevisionOlder: true, single: true },
        [await buildReleaseCandidatesWithRegionLanguage(names)],
        [expectedName],
      );
    });

    test.each([
      [['one (Rev 1.2)', 'one (Rev 1.1)'], 'one (Rev 1.1)'],
      [['two (Rev 13.37)'], 'two (Rev 13.37)'],
    ])('should return the first candidate when all matching: %s', async (names, expectedName) => {
      await expectPreferredCandidates(
        { preferRevisionOlder: true, single: true },
        [await buildReleaseCandidatesWithRegionLanguage(names)],
        [expectedName],
      );
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
        await buildReleaseCandidatesWithRegionLanguage(['nine (Program)', 'nine'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['ten (Debug)', 'ten'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (Aftermarket) (USA) (EN)', 'three [b] (USA) (EN)', 'four (Beta) (USA) (EN)', 'five (Demo) (USA) (EN)', 'six (Homebrew) (USA) (EN)', 'seven (Proto) (USA) (EN)', 'eight (Sample) (USA) (EN)', 'nine (Program) (USA) (EN)', 'ten (Debug) (USA) (EN)']);
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
        await buildReleaseCandidatesWithRegionLanguage(['nine (Program)', 'nine'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['ten (Debug)', 'ten'], 'USA', 'EN'),
      ], ['one (USA) (EN)', 'two (USA) (EN)', 'three (USA) (EN)', 'four (USA) (EN)', 'five (USA) (EN)', 'six (USA) (EN)', 'seven (USA) (EN)', 'eight (USA) (EN)', 'nine (USA) (EN)', 'ten (USA) (EN)']);
    });

    it('should return the first candidate when all matching', async () => {
      await expectPreferredCandidates({ preferRetail: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['two (Aftermarket)', 'two'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['three [b]', 'three'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['four (Beta)', 'four (Proto)', 'four'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['five (Demo)', 'five', 'five (Sample)'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['six (Homebrew)', 'six'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['seven (Proto)', 'seven'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['eight (Sample)', 'eight'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['nine (Program)', 'nine'], 'USA', 'EN'),
        await buildReleaseCandidatesWithRegionLanguage(['ten (Debug)', 'ten'], 'USA', 'EN'),
      ], ['two (USA) (EN)', 'three (USA) (EN)', 'four (USA) (EN)', 'five (USA) (EN)', 'six (USA) (EN)', 'seven (USA) (EN)', 'eight (USA) (EN)', 'nine (USA) (EN)', 'ten (USA) (EN)']);
    });
  });

  describe('prefer NTSC', () => {
    it('should return the first candidate when option is false', async () => {
      await expectPreferredCandidates({ preferNTSC: false, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one']),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two (NTSC)']),
        await buildReleaseCandidatesWithRegionLanguage(['three (NTSC)', 'three']),
      ], ['one', 'two', 'three (NTSC)']);
    });

    it('should return the first candidate when none matching', async () => {
      await expectPreferredCandidates({ preferNTSC: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one']),
        await buildReleaseCandidatesWithRegionLanguage(['four', 'four (Demo)']),
      ], ['one', 'four']);
    });

    it('should return the first matching candidate when some matching', async () => {
      await expectPreferredCandidates({ preferNTSC: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one']),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two (NTSC)']),
        await buildReleaseCandidatesWithRegionLanguage(['three (NTSC)', 'three']),
      ], ['one', 'two (NTSC)', 'three (NTSC)']);
    });

    it('should return the first candidate when all matching', async () => {
      await expectPreferredCandidates({ preferNTSC: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two (NTSC)']),
        await buildReleaseCandidatesWithRegionLanguage(['three (NTSC)', 'three']),
      ], ['two (NTSC)', 'three (NTSC)']);
    });
  });

  describe('prefer PAL', () => {
    it('should return the first candidate when option is false', async () => {
      await expectPreferredCandidates({ preferPAL: false, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one']),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two (PAL)']),
        await buildReleaseCandidatesWithRegionLanguage(['three', 'three (PAL 60Hz)']),
        await buildReleaseCandidatesWithRegionLanguage(['four (PAL)', 'four']),
      ], ['one', 'two', 'three', 'four (PAL)']);
    });

    it('should return the first candidate when none matching', async () => {
      await expectPreferredCandidates({ preferPAL: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one']),
        await buildReleaseCandidatesWithRegionLanguage(['five', 'five (Demo)']),
      ], ['one', 'five']);
    });

    it('should return the first matching candidate when some matching', async () => {
      await expectPreferredCandidates({ preferPAL: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['one']),
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two (PAL)']),
        await buildReleaseCandidatesWithRegionLanguage(['three', 'three (PAL 60Hz)']),
        await buildReleaseCandidatesWithRegionLanguage(['four (PAL)', 'four']),
      ], ['one', 'two (PAL)', 'three (PAL 60Hz)', 'four (PAL)']);
    });

    it('should return the first candidate when all matching', async () => {
      await expectPreferredCandidates({ preferPAL: true, single: true }, [
        await buildReleaseCandidatesWithRegionLanguage(['two', 'two (PAL)']),
        await buildReleaseCandidatesWithRegionLanguage(['three', 'three (PAL 60Hz)']),
        await buildReleaseCandidatesWithRegionLanguage(['four (PAL)', 'four']),
      ], ['two (PAL)', 'three (PAL 60Hz)', 'four (PAL)']);
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

describe('filter', () => {
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
