import Game from '../../../src/types/dats/game.js';
import Release from '../../../src/types/dats/release.js';
import ROM from '../../../src/types/dats/rom.js';

describe('isBios', () => {
  test.each([
    ['[BIOS] Nintendo Game Boy Boot ROM (World) (Rev 1)', true],
    ['Tetris (World) (Rev 1)', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isBios()).toEqual(expected);
  });

  test.each([true, false])('option: %s', (bios) => {
    expect(new Game({ bios: bios ? 'yes' : 'no' }).isBios()).toEqual(bios);
  });
});

describe('getReleases', () => {
  it('should always return a list', () => {
    const release = new Release('name', 'USA');

    expect(new Game({ release: [release] }).getReleases()).toEqual([release]);
    expect(new Game({ release }).getReleases()).toEqual([release]);
    expect(new Game().getReleases()).toHaveLength(0);
  });
});

describe('getRoms', () => {
  it('should always return a list', () => {
    const rom = new ROM({ name: 'name', size: 0, crc: '00000000' });

    expect(new Game({ rom: [rom] }).getRoms()).toEqual([rom]);
    expect(new Game({ rom }).getRoms()).toEqual([rom]);
    expect(new Game().getRoms()).toHaveLength(0);
  });
});

describe('isAftermarket', () => {
  test.each([
    ['Game Boy Camera (USA, Europe) (SGB Enhanced)', false],
    ['Game Boy Camera Gallery 2022, The (World) (Aftermarket) (Homebrew)', true],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isAftermarket()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('isAlpha', () => {
  test.each([
    ['Isle Quest (World) (v0.1c) (Alpha) (Aftermarket) (Homebrew)', true],
    ['Isolated Warrior (Europe)', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isAlpha()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('isBad', () => {
  test.each([
    ['[MIA] Aprilia - DiTech Interface (Unknown) (Unl) [b]', true],
    ['Arcade Classic No. 1 - Asteroids &amp; Missile Command (USA, Europe) (SGB Enhanced)', false],
    ['1942 (U) [C][b1]', true],
    ['007 - The World is Not Enough (U) [C][!]', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isBad()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('isBeta', () => {
  test.each([
    ['Garfield Labyrinth (Europe) (Beta)', true],
    ['Gargoyle\'s Quest (Europe) (Rev 1)', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isBeta()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('isDemo', () => {
  test.each([
    ['Pocket Monsters Gin (Japan) (Demo) (Spaceworld 1997) (SGB Enhanced)', true],
    ['Pocket Puyo Puyo Tsuu (Japan) (Rev 1) (SGB Enhanced) (NP)', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isDemo()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('isFixed', () => {
  test.each([
    ['Black Bass - Lure Fishing (U) [C][f1]', true],
    ['Digimon 2 (Unl) [C]', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isFixed()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('isHomebrew', () => {
  test.each([
    ['Phobos Dere .GB (World) (Aftermarket) (Homebrew)', true],
    ['Picross 2 (Japan) (SGB Enhanced)', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isHomebrew()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('isOverdump', () => {
  test.each([
    ['Gradius - The Interstellar Assault (U) [o1]', true],
    ['Gremlins Unleashed (E) (M6) [C]', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isOverdump()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('isPendingDump', () => {
  test.each([
    ['Cheetah Men II (Active Enterprises) [!p]', true],
    ['Daffy Duck - Fowl Play (U) [C][!]', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isPendingDump()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('isPirated', () => {
  test.each([
    ['Doraemon - Aruke Aruke Labyrinth (J) [C][p1][!]', true],
    ['Doraemon 2 (J)', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isPirated()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('isPrototype', () => {
  test.each([
    ['Popeye (USA) (Proto)', true],
    ['Popeye 2 (Europe)', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isPrototype()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('isSample', () => {
  test.each([
    ['Aladdin (Europe) (Sample) (SGB Enhanced)', true],
    ['Alfred Chicken (Europe)', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isSample()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('isTest', () => {
  test.each([
    ['Game Boy Test Cartridge (USA, Europe) (Proto) (Test Program)', true],
    ['10-Pin Bowling (USA)', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isTest()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('isTranslated', () => {
  test.each([
    ['Driver - You Are The Wheelman (U) (M5) [C][T-Pol_aRPi]', true],
    ['Duck Tales (E) [T+Ger0.2_Star-trans]', true],
    ['Elevator Action EX (J) [C][T+Chi_ROMMAN]', true],
    ['Elevator Action EX (E) (M5) [C][!]', false],
    ['Gameboy Wars 2 (J) [C][T-Eng_TransBRC][a1]', true],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isTranslated()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('isUnlicensed', () => {
  test.each([
    ['Dragon Ball Z 3 (USA) (SGB Enhanced) (Unl)', true],
    ['Dragon Ball Z - Gokuu Hishouden (Japan) (SGB Enhanced)', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isUnlicensed()).toEqual(expected);
  });
});

describe('isVerified', () => {
  test.each([
    ['Suzuki Alstare Extreme Racing (E) (M6) [C][!]', true],
    ['Swamp Thing (U) [!]', true],
    ['Tarzan (U) [t1]', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).isVerified()).toEqual(expected);
  });
});

describe('hasBungFix', () => {
  test.each([
    ['Gamera - Daikai Jukuchuu Kessen (J) [S][BF]', true],
    ['Gargoyle\'s Quest - Ghosts\'n Goblins (UE) [BF]', true],
    ['Gauntlet II (U) [!]', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).hasBungFix()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('hasHack', () => {
  test.each([
    ['Smurfs, The (UE) (V1.0) (M4) [h1]', true],
    ['Space Invasion (Unl) [C][hIR]', true],
    ['Super Mario 4 (Unl) [p1][h1C]', true],
    ['Survival Kids (U) [C][!]', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).hasHack()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('hasTrainer', () => {
  test.each([
    ['Taxi 2 (F) [C][t1]', true],
    ['Tenchi o Kurau (J)', false],
    ['Tetris (W) (V1.1) [!]', false],
  ])('%s', (name, expected) => {
    expect(new Game({ name }).hasTrainer()).toEqual(expected);
    expect(new Game({ name }).isRetail()).toEqual(!expected);
  });
});

describe('getLanguages', () => {
  test.each([
    [
      new Game({
        name: 'Choplifter (Japan) (En) (Rev 1)',
        release: new Release('Choplifter (Japan) (En) (Rev 1)', 'JPN'),
      }),
      ['EN'],
    ],
    [
      new Game({
        name: 'Flipull - An Exciting Cube Game (Japan) (En) (Rev 1)',
        release: new Release('Flipull - An Exciting Cube Game (Japan) (En) (Rev 1)', 'JPN'),
      }),
      ['EN'],
    ],
    [
      new Game({
        name: 'Legend of Zelda, The - A Link to the Past (Canada) (Fr)',
        release: new Release('Legend of Zelda, The - A Link to the Past (Canada) (Fr)', 'CAN'),
      }),
      ['FR'],
    ],
    [
      new Game({
        name: '1080 Snowboarding (Europe) (En,Ja,Fr,De)',
        release: new Release('1080 Snowboarding (Europe) (En,Ja,Fr,De)', 'EUR'),
      }),
      ['EN', 'JA', 'FR', 'DE'],
    ],
  ])('should prefer explicit languages over region language: %s', (game, expectedLanguages) => {
    expect(game.getLanguages()).toEqual(expectedLanguages);
  });

  test.each([
    [
      new Game({
        name: 'Punch-Out!! (Europe)',
        release: new Release('Punch-Out!! (Europe)', 'EUR'),
      }),
      ['EN'],
    ],
    [
      new Game({ name: 'Mike Tyson\'s Punch-Out!! (Japan, USA) (En) (Rev 1)' }),
      ['EN'],
    ],
    [
      new Game({
        name: 'Legend of Zelda, The - A Link to the Past (Germany)',
        release: new Release('Legend of Zelda, The - A Link to the Past (Germany)', 'GER'),
      }),
      ['DE'],
    ],
  ])('should get language from region: %s', (game, expectedLanguages) => {
    expect(game.getLanguages()).toEqual(expectedLanguages);
  });
});
