import Game from '../../src/types/logiqx/game.js';
import Release from '../../src/types/logiqx/release.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';

describe('getRegion', () => {
  test.each(ReleaseCandidate.getRegions())('should return the release region: %s', (region) => {
    const release = new Release('release', region, undefined);
    const releaseCandidate = new ReleaseCandidate(new Game(), release, [], []);
    expect(releaseCandidate.getRegion()).toEqual(region);
  });

  test.each([
    ['Japan', 'JPN'],
    ['USA, Europe', 'USA'],
    ['Europe, Australia', 'EUR'],
    ['United Kingdom, France', 'UK'],
  ])('should return the region from game name: %s', (countryNames, expectedRegion) => {
    const releaseCandidate = new ReleaseCandidate(new Game({ name: `game (${countryNames})` }), undefined, [], []);
    expect(releaseCandidate.getRegion()).toEqual(expectedRegion);
  });

  it('should return null when region can\'t be inferred', () => {
    const releaseCandidate = new ReleaseCandidate(new Game({ name: 'game' }), undefined, [], []);
    expect(releaseCandidate.getRegion()).toBeNull();
  });
});

describe('getLanguages', () => {
  test.each(ReleaseCandidate.getLanguages())('should return the release language; %s', (language) => {
    const release = new Release('release', 'UNK', language);
    const releaseCandidate = new ReleaseCandidate(new Game(), release, [], []);
    expect(releaseCandidate.getLanguages()).toEqual([language]);
  });

  test.each([
    ['Jp', ['JP']],
    ['En,Fr,De', ['EN', 'FR', 'DE']],
    ['It+En,Fr,De,Es,It,Nl,Sv,Da', ['IT', 'EN', 'FR', 'DE', 'ES', 'NL', 'SV', 'DA']],
    ['En,Fr,It+Es,It', ['EN', 'FR', 'IT', 'ES']],
  ])('should return the language from game name; %s', (languages, expectedLanguages) => {
    const releaseCandidate = new ReleaseCandidate(new Game({ name: `game (${languages})` }), undefined, [], []);
    expect(releaseCandidate.getLanguages()).toEqual(expectedLanguages);
  });

  test.each([
    ['CAN', 'EN'],
    ['EUR', 'EN'],
    ['TAI', 'ZH'],
  ])('should return the default language for the region: %s', (region, expectedLanguage) => {
    const release = new Release('release', region, undefined);
    const releaseCandidate = new ReleaseCandidate(new Game(), release, [], []);
    expect(releaseCandidate.getLanguages()).toEqual([expectedLanguage]);
  });

  it('should return an empty list when languages can\'t be inferred', () => {
    const releaseCandidate = new ReleaseCandidate(new Game({ name: 'game' }), undefined, [], []);
    expect(releaseCandidate.getLanguages()).toEqual([]);
  });
});
