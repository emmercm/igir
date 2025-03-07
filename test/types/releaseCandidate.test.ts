import Game from '../../src/types/dats/game.js';
import Release from '../../src/types/dats/release.js';
import Internationalization from '../../src/types/internationalization.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';

describe('getRegion', () => {
  test.each(Internationalization.REGION_CODES)('should return the release region: %s', (region) => {
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
    ['Golf (W) [o3]', 'WORLD'],
  ])('should return the region from game name: %s', (name, expectedRegion) => {
    const releaseCandidate = new ReleaseCandidate(new Game({ name }), undefined, []);
    expect(releaseCandidate.getRegion()).toEqual(expectedRegion);
  });

  it("should return null when region can't be inferred", () => {
    const releaseCandidate = new ReleaseCandidate(new Game({ name: 'game' }), undefined, []);
    expect(releaseCandidate.getRegion()).toBeUndefined();
  });
});

describe('getLanguages', () => {
  test.each(Internationalization.LANGUAGES)(
    'should return the release language: %s',
    (language) => {
      const release = new Release('release', 'UNK', language);
      const releaseCandidate = new ReleaseCandidate(new Game(), release, []);
      expect(releaseCandidate.getLanguages()).toEqual([language]);
    },
  );

  test.each([
    // No-Intro style
    ['Sa-Ga 2 - Hihou Densetsu (World) (Ja) (Rev 1) (Collection of SaGa)', ['JA']],
    ['Smurfs, The (USA, Europe) (En,Fr,De) (Rev 1) (SGB Enhanced)', ['EN', 'FR', 'DE']],
    ['Dr. Franken (Europe) (En,Fr,De,Es,It,Nl,Sv)', ['EN', 'FR', 'DE', 'ES', 'IT', 'NL', 'SV']],
    [
      '2 Games in 1 - Disney Princesas + Hermano Oso (Spain) (Es+En,Fr,De,Es,It,Nl,Sv,Da)',
      ['ES', 'EN', 'FR', 'DE', 'IT', 'NL', 'SV', 'DA'],
    ],
    ["Bob the Builder - Bob's Busy Day (Europe) (En-GB).bin", ['EN']],
    ['Thomas & Friends - Engines Working Together (USA) (En-US).bin', ['EN']],
    // GoodTools style
    ['Atlantis - The Lost Empire (E) (M3) (Eng-Spa-Ita) [C][!]', ['EN', 'ES', 'IT']],
    ['Casper (E) (M3) (Eng-Fre-Ger) [C][!]', ['EN', 'FR', 'DE']],
    ['Obelix (E) (M2) (Eng-Spa) [S][!]', ['EN', 'ES']],
  ])('should return the language from game name: %s', (name, expectedLanguages) => {
    const releaseCandidate = new ReleaseCandidate(new Game({ name }), undefined, []);
    expect(releaseCandidate.getLanguages()).toEqual(expectedLanguages);
  });

  it("should return an empty list when languages can't be inferred", () => {
    const releaseCandidate = new ReleaseCandidate(new Game({ name: 'game' }), undefined, []);
    expect(releaseCandidate.getLanguages()).toHaveLength(0);
  });
});
