import Game from '../../src/types/logiqx/game.js';
import Release from '../../src/types/logiqx/release.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';

describe('getRegion', () => {
  test.each(ReleaseCandidate.getRegions())('should return the release region: %s', (region) => {
    const release = new Release('release', region, undefined);
    const releaseCandidate = new ReleaseCandidate(new Game(), release, []);
    expect(releaseCandidate.getRegion()).toEqual(region);
  });

  test.each([
    // No-Intro style
    ['Astro Rabby (Japan)', 'JPN'],
    ['Attack of the Killer Tomatoes (USA, Europe)', 'USA'],
    ['Soccer (Europe, Australia) (En,Fr,De) (SGB Enhanced)', 'EUR'],
    ['Secret of Mana (United Kingdom, Australia) (Rev 1)', 'UK'],
    // GoodTools style
    ['Agro Soar (A) [!]', 'AUS'],
    ['Doug - Le Grande Aventure (F) [C][!]', 'FRA'],
    ['102 Dalmatiner (G) [C][!]', 'GER'],
    ['Barbie - Diepzee Avontuur (Nl) [C][!]', 'HOL'],
    ['Dragon Ball Z - I Leggendari Super Guerrieri (I) [C][!]', 'ITA'],
    ['Ace Striker (J) [b1]', 'JPN'],
    ['Bomberman Selection (K) [C][h1]', 'KOR'],
    ['Yu-Gi-Oh! - Duelo en las Tinieblas (S) [C][!]', 'SPA'],
    ['Bob the Builder - Fix It Fun! (Sw) (M5) [C][!]', 'SWE'],
    ['Bomberman GB (U) [S][b2]', 'USA'],
    ['Games Frenzy (E) (M3) [C][!]', 'EUR'],
    ['Golf (W) [o3]', 'UNK'],
  ])('should return the region from game name: %s', (name, expectedRegion) => {
    const releaseCandidate = new ReleaseCandidate(new Game({ name }), undefined, []);
    expect(releaseCandidate.getRegion()).toEqual(expectedRegion);
  });

  it('should return null when region can\'t be inferred', () => {
    const releaseCandidate = new ReleaseCandidate(new Game({ name: 'game' }), undefined, []);
    expect(releaseCandidate.getRegion()).toBeNull();
  });
});

describe('getLanguages', () => {
  test.each(ReleaseCandidate.getLanguages())('should return the release language: %s', (language) => {
    const release = new Release('release', 'UNK', language);
    const releaseCandidate = new ReleaseCandidate(new Game(), release, []);
    expect(releaseCandidate.getLanguages()).toEqual([language]);
  });

  test.each([
    ['Jp', ['JP']],
    ['En,Fr,De', ['EN', 'FR', 'DE']],
    ['It+En,Fr,De,Es,It,Nl,Sv,Da', ['IT', 'EN', 'FR', 'DE', 'ES', 'NL', 'SV', 'DA']],
    ['En,Fr,It+Es,It', ['EN', 'FR', 'IT', 'ES']],
  ])('should return the language from game name: %s', (languages, expectedLanguages) => {
    const releaseCandidate = new ReleaseCandidate(new Game({ name: `game (${languages})` }), undefined, []);
    expect(releaseCandidate.getLanguages()).toEqual(expectedLanguages);
  });

  test.each([
    ['CAN', 'EN'],
    ['EUR', 'EN'],
    ['TAI', 'ZH'],
  ])('should return the default language for the region: %s', (region, expectedLanguage) => {
    const release = new Release('release', region, undefined);
    const releaseCandidate = new ReleaseCandidate(new Game(), release, []);
    expect(releaseCandidate.getLanguages()).toEqual([expectedLanguage]);
  });

  it('should return an empty list when languages can\'t be inferred', () => {
    const releaseCandidate = new ReleaseCandidate(new Game({ name: 'game' }), undefined, []);
    expect(releaseCandidate.getLanguages()).toEqual([]);
  });
});
