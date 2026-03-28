import DATParentInferrer from '../../../src/modules/dats/datParentInferrer.js';
import DATPreferer from '../../../src/modules/dats/datPreferer.js';
import Game from '../../../src/types/dats/game.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import Release from '../../../src/types/dats/release.js';
import ROM from '../../../src/types/dats/rom.js';
import Options, { PreferRevision, PreferRevisionInverted } from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const testGameWarlocked: Game[] = [
  new Game({
    name: 'Warlocked (USA)',
    description: 'Warlocked (USA)',
    release: new Release('Warlocked (USA)', 'USA'),
    roms: new ROM({ name: 'Warlocked (USA).gbc', size: 2_097_152 }),
  }),
];

const testGameAdvanceWars: Game[] = [
  // https://github.com/emmercm/igir/issues/1390
  new Game({
    name: 'Advance Wars (Europe) (En,Fr,De,Es)',
    description: 'Advance Wars (Europe) (En,Fr,De,Es)',
    release: new Release('Advance Wars (Europe) (En,Fr,De,Es)', 'EUR'),
    roms: new ROM({
      name: 'Advance Wars (Europe) (En,Fr,De,Es).gba',
      size: 8_388_608,
    }),
  }),
  new Game({
    name: 'Advance Wars (USA)',
    cloneOf: 'Advance Wars (Europe) (En,Fr,De,Es)',
    description: 'Advance Wars (USA)',
    // No release
    roms: new ROM({
      name: 'Advance Wars (USA).gba',
      size: 4_194_304,
    }),
  }),
  new Game({
    name: 'Advance Wars (USA) (Rev 1)',
    cloneOf: 'Advance Wars (Europe) (En,Fr,De,Es)',
    description: 'Advance Wars (USA) (Rev 1)',
    release: new Release('Advance Wars (USA) (Rev 1)', 'USA'),
    roms: new ROM({
      name: 'Advance Wars (USA) (Rev 1).gba',
      size: 4_194_304,
    }),
  }),
  new Game({
    name: 'Advance Wars (USA) (Virtual Console)',
    cloneOf: 'Advance Wars (Europe) (En,Fr,De,Es)',
    description: 'Advance Wars (USA) (Virtual Console)',
    // No release
    roms: new ROM({
      name: 'Advance Wars (USA) (Virtual Console).gba',
      size: 4_194_304,
    }),
  }),
  new Game({
    name: 'Advance Wars (Europe) (En,Fr,De,Es) (Virtual Console)',
    cloneOf: 'Advance Wars (Europe) (En,Fr,De,Es)',
    description: 'Advance Wars (Europe) (En,Fr,De,Es) (Virtual Console)',
    // No release
    roms: new ROM({
      name: 'Advance Wars (Europe) (En,Fr,De,Es) (Virtual Console).gba',
      size: 8_388_608,
    }),
  }),
];

const testGameDaveMirraFreestyleBmx2: Game[] = [
  // https://github.com/emmercm/igir/issues/1392
  new Game({
    name: 'Dave Mirra Freestyle BMX 2 (Europe) (En,Fr,De,Es,It) (Rev 1)',
    description: 'Dave Mirra Freestyle BMX 2 (Europe) (En,Fr,De,Es,It) (Rev 1)',
    release: new Release('Dave Mirra Freestyle BMX 2 (Europe) (En,Fr,De,Es,It) (Rev 1)', 'EUR'),
    roms: new ROM({
      name: 'Dave Mirra Freestyle BMX 2 (Europe) (En,Fr,De,Es,It) (Rev 1).gba',
      size: 8_388_608,
    }),
  }),
  new Game({
    name: 'Dave Mirra Freestyle BMX 2 (USA)',
    cloneOf: 'Dave Mirra Freestyle BMX 2 (Europe) (En,Fr,De,Es,It) (Rev 1)',
    description: 'Dave Mirra Freestyle BMX 2 (USA)',
    release: new Release('Dave Mirra Freestyle BMX 2 (USA)', 'USA'),
    roms: new ROM({
      name: 'Dave Mirra Freestyle BMX 2 (USA).gba',
      size: 8_388_608,
    }),
  }),
  new Game({
    name: 'Dave Mirra Freestyle BMX 2 (Europe) (En,Fr,De,Es,It)',
    cloneOf: 'Dave Mirra Freestyle BMX 2 (Europe) (En,Fr,De,Es,It) (Rev 1)',
    description: 'Dave Mirra Freestyle BMX 2 (Europe) (En,Fr,De,Es,It)',
    // No release
    roms: new ROM({
      name: 'Dave Mirra Freestyle BMX 2 (Europe) (En,Fr,De,Es,It).gba',
      size: 8_388_608,
    }),
  }),
];

test.each([[true], [false]])('should return nothing with no parents, single: %s', (single) => {
  const options = new Options({ single });
  const dat = new LogiqxDAT({ header: new Header() });
  const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
  expect(preferredDat.getGames()).toHaveLength(0);
});

it('should do nothing when not applying 1G1R', () => {
  const options = new Options({ single: false });
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [...testGameWarlocked, ...testGameAdvanceWars, ...testGameDaveMirraFreestyleBmx2],
  });
  const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
  expect(preferredDat.getGames()).toEqual(dat.getGames());
});

it('should return the parent when no other options given', () => {
  const options = new Options({ single: true });
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [...testGameWarlocked, ...testGameAdvanceWars, ...testGameDaveMirraFreestyleBmx2],
  });
  const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
  expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
    'Warlocked (USA)',
    'Advance Wars (Europe) (En,Fr,De,Es)',
    'Dave Mirra Freestyle BMX 2 (Europe) (En,Fr,De,Es,It) (Rev 1)',
  ]);
});

describe('game name regex', () => {
  it('should return the parent when no game matches', () => {
    const options = new Options({ single: true, preferGameRegex: 'ABCDEFG' });
    const dat = new LogiqxDAT({ header: new Header(), games: testGameAdvanceWars });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
      testGameAdvanceWars[0].getName(),
    ]);
  });

  it('should prefer with case sensitivity', () => {
    const options = new Options({ single: true, preferGameRegex: '/usa/i' });
    const dat = new LogiqxDAT({ header: new Header(), games: testGameAdvanceWars });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual(['Advance Wars (USA)']);
  });

  it('should prefer without case sensitivity', () => {
    const options = new Options({ single: true, preferGameRegex: 'Virtual' });
    const dat = new LogiqxDAT({ header: new Header(), games: testGameAdvanceWars });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
      'Advance Wars (USA) (Virtual Console)',
    ]);
  });
});

describe('ROM name regex', () => {
  it('should return the parent when no game matches', () => {
    const options = new Options({ single: true, preferRomRegex: 'ABCDEFG' });
    const dat = new LogiqxDAT({ header: new Header(), games: testGameAdvanceWars });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
      testGameAdvanceWars[0].getName(),
    ]);
  });

  it('should prefer with case sensitivity', () => {
    const options = new Options({ single: true, preferRomRegex: '/usa/i' });
    const dat = new LogiqxDAT({ header: new Header(), games: testGameAdvanceWars });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual(['Advance Wars (USA)']);
  });

  it('should prefer without case sensitivity', () => {
    const options = new Options({ single: true, preferRomRegex: 'Virtual' });
    const dat = new LogiqxDAT({ header: new Header(), games: testGameAdvanceWars });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
      'Advance Wars (USA) (Virtual Console)',
    ]);
  });
});

it('should prefer verified games', () => {
  const options = new Options({ single: true, preferVerified: true });
  const datWithoutParents = new LogiqxDAT({
    header: new Header(),
    games: [
      new Game({ name: 'Chu Chu Rocket (J) (M5) [f1]' }),
      new Game({ name: 'Chu Chu Rocket (J) (M5) [f2]' }),
      new Game({ name: 'Chu Chu Rocket (J) (M5) [f3]' }),
      new Game({ name: 'Chu Chu Rocket (U) (M5) [f1]' }),
      new Game({ name: 'Chu Chu Rocket (U) (M5) [f2]' }),
      // Verified games are last
      new Game({ name: 'Chu Chu Rocket (E) (M5) [!]' }),
      new Game({ name: 'Chu Chu Rocket (J) (M5) [!]' }),
      new Game({ name: 'Chu Chu Rocket (U) (M5) [!]' }),
    ],
  });
  const dat = new DATParentInferrer(options, new ProgressBarFake()).infer(datWithoutParents);
  const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
  expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
    'Chu Chu Rocket (E) (M5) [!]',
  ]);
});

it('should prefer "good" games', () => {
  const options = new Options({ single: true, preferVerified: true });
  const datWithoutParents = new LogiqxDAT({
    header: new Header(),
    games: [
      new Game({ name: 'Ballblazer (J) [b1]' }),
      new Game({ name: 'Ballblazer (J) [b1][o1]' }),
      new Game({ name: 'Ballblazer (J) [b1][o2]' }),
      new Game({ name: 'Ballblazer (J) [b1][o3]' }),
      new Game({ name: 'Ballblazer (J) [b2]' }),
      new Game({ name: 'Ballblazer (J) [b3]' }),
      // Good games are last
      new Game({ name: 'Ballblazer (J) [!]' }),
    ],
  });
  const dat = new DATParentInferrer(options, new ProgressBarFake()).infer(datWithoutParents);
  const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
  expect(preferredDat.getGames().map((game) => game.getName())).toEqual(['Ballblazer (J) [!]']);
});

describe('prefer languages', () => {
  const languageGames: Game[] = [
    // Nintendo 64
    new Game({ name: '1080 Snowboarding (Europe) (En,Ja,Fr,De)' }),
    new Game({ name: '1080 Snowboarding (Japan, USA) (En,Ja)' }),
    new Game({ name: '1080 Snowboarding (USA) (En,Ja) (LodgeNet)' }),
    new Game({ name: 'Carmageddon 64 (Europe) (En,Fr,Es,It)' }),
    new Game({ name: 'Carmageddon 64 (Europe) (En,Fr,De,Es)' }),
    new Game({ name: 'Carmageddon 64 (USA)' }),
    new Game({ name: 'Drakkhen (Germany)' }),
    new Game({ name: 'Drakkhen (Japan)' }),
    new Game({ name: 'Drakkhen (World) (Evercade)' }),
    new Game({ name: 'Extreme-G (Europe) (En,Fr,De,Es,It)' }),
    new Game({ name: 'Extreme-G (Japan)' }),
    new Game({ name: 'Extreme-G (USA)' }),
    new Game({ name: 'Hexen (Europe)' }),
    new Game({ name: 'Hexen (France)' }),
    new Game({ name: 'Hexen (Germany)' }),
    new Game({ name: 'Hexen (Japan)' }),
    new Game({ name: 'Hexen (USA)' }),
  ];
  const datWithoutParents = new LogiqxDAT({ header: new Header(), games: languageGames });
  const dat = new DATParentInferrer(new Options(), new ProgressBarFake()).infer(datWithoutParents);

  it('should prefer a single language', () => {
    const options = new Options({ single: true, preferLanguage: ['De'] });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
      '1080 Snowboarding (Europe) (En,Ja,Fr,De)',
      'Carmageddon 64 (Europe) (En,Fr,De,Es)',
      'Drakkhen (Germany)',
      'Extreme-G (Europe) (En,Fr,De,Es,It)',
      'Hexen (Germany)',
    ]);
  });

  it('should prefer an ordered list of language', () => {
    const options = new Options({ single: true, preferLanguage: ['Ja', 'De'] });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
      '1080 Snowboarding (Europe) (En,Ja,Fr,De)',
      'Carmageddon 64 (Europe) (En,Fr,De,Es)',
      'Drakkhen (Japan)',
      'Extreme-G (Japan)',
      'Hexen (Japan)',
    ]);
  });

  it('should treat "Europe" and "World" as English', () => {
    const options = new Options({ single: true, preferLanguage: ['En'] });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
      '1080 Snowboarding (Europe) (En,Ja,Fr,De)',
      'Carmageddon 64 (Europe) (En,Fr,Es,It)',
      'Drakkhen (World) (Evercade)',
      'Extreme-G (Europe) (En,Fr,De,Es,It)',
      'Hexen (Europe)',
    ]);
  });
});

describe('prefer regions', () => {
  const regionGames: Game[] = [
    new Game({ name: 'Pokemon Snap (Europe)' }),
    new Game({ name: 'Pokemon Snap (Japan)' }),
    new Game({ name: 'Pokemon Snap (Australia)' }),
    new Game({ name: 'Pokemon Snap (France)' }),
    new Game({ name: 'Pokemon Snap (Germany)' }),
    new Game({ name: 'Pokemon Snap (Italy)' }),
    new Game({ name: 'Pokemon Snap (Spain)' }),
    new Game({ name: 'Pokemon Snap (USA)' }),
    new Game({ name: 'Star Wars Episode I - Racer (Europe) (En,Fr,De)' }),
    new Game({ name: 'Star Wars Episode I - Racer (Japan)' }),
    new Game({ name: 'Star Wars Episode I - Racer (USA)' }),
    new Game({ name: 'Star Wars Episode I - Racer (USA) (Limited Run Games)' }),
    new Game({ name: 'StarCraft 64 (USA)' }),
    new Game({ name: 'StarCraft 64 (Australia)' }),
    new Game({ name: 'StarCraft 64 (USA) (Beta)' }),
    new Game({ name: 'StarCraft 64 (Germany) (Proto)' }),
  ];
  const datWithoutParents = new LogiqxDAT({ header: new Header(), games: regionGames });
  const dat = new DATParentInferrer(new Options(), new ProgressBarFake()).infer(datWithoutParents);

  it('should prefer a single region', () => {
    const options = new Options({ single: true, preferRegion: ['USA'] });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
      'Pokemon Snap (USA)',
      'Star Wars Episode I - Racer (USA)',
      'StarCraft 64 (USA)',
    ]);
  });

  it('should prefer an ordered list of regions', () => {
    const options = new Options({ single: true, preferRegion: ['JPN', 'AUS', 'USA'] });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
      'Pokemon Snap (Japan)',
      'Star Wars Episode I - Racer (Japan)',
      'StarCraft 64 (Australia)',
    ]);
  });
});

describe('revisions', () => {
  const revisionGames: Game[] = [
    // Game with many regions with many revisions
    new Game({ name: 'Donkey Kong Country (Europe) (En,Fr,De) (Rev 1)' }),
    new Game({
      name: 'Donkey Kong Country (Europe) (En,Fr,De)',
      cloneOf: 'Donkey Kong Country (Europe) (En,Fr,De) (Rev 1)',
    }),
    new Game({
      name: 'Donkey Kong Country (USA)',
      cloneOf: 'Donkey Kong Country (Europe) (En,Fr,De) (Rev 1)',
    }),
    new Game({
      name: 'Donkey Kong Country (USA) (Rev 1)',
      cloneOf: 'Donkey Kong Country (Europe) (En,Fr,De) (Rev 1)',
    }),
    new Game({
      name: 'Donkey Kong Country (USA) (Rev 2)',
      cloneOf: 'Donkey Kong Country (Europe) (En,Fr,De) (Rev 1)',
    }),
    new Game({
      name: 'Donkey Kong Country (USA, Europe) (Rev 2) (Virtual Console, Classic Mini, Switch Online)',
      cloneOf: 'Donkey Kong Country (Europe) (En,Fr,De) (Rev 1)',
    }),
    new Game({
      name: 'Donkey Kong Country - Competition Cartridge (USA) (Competition Cart, Nintendo Power mail-order)',
      cloneOf: 'Donkey Kong Country (Europe) (En,Fr,De) (Rev 1)',
    }),
    new Game({
      name: 'Super Donkey Kong (Japan)',
      cloneOf: 'Donkey Kong Country (Europe) (En,Fr,De) (Rev 1)',
    }),
    new Game({
      name: 'Super Donkey Kong (Japan) (Rev 1)',
      cloneOf: 'Donkey Kong Country (Europe) (En,Fr,De) (Rev 1)',
    }),
    new Game({
      name: 'Super Donkey Kong (Japan) (Rev 1) (Virtual Console, Classic Mini, Switch Online)',
      cloneOf: 'Donkey Kong Country (Europe) (En,Fr,De) (Rev 1)',
    }),
    // Game with many regions with many revisions
    new Game({ name: 'Starwing (Europe) (Rev 1)' }),
    new Game({ name: 'Star Fox (Japan)', cloneOf: 'Starwing (Europe) (Rev 1)' }),
    new Game({ name: 'Star Fox (USA)', cloneOf: 'Starwing (Europe) (Rev 1)' }),
    new Game({ name: 'Star Fox (USA) (Rev 2)', cloneOf: 'Starwing (Europe) (Rev 1)' }),
    new Game({ name: 'Star Fox (Japan) (Rev 1)', cloneOf: 'Starwing (Europe) (Rev 1)' }),
    new Game({ name: 'Star Fox (USA) (Rev 1)', cloneOf: 'Starwing (Europe) (Rev 1)' }),
    new Game({
      name: 'Star Glider (Japan) (Beta) (1992-09-23)',
      cloneOf: 'Starwing (Europe) (Rev 1)',
    }),
    new Game({ name: 'Starwing (Europe)', cloneOf: 'Starwing (Europe) (Rev 1)' }),
    new Game({ name: 'Starwing (Germany)', cloneOf: 'Starwing (Europe) (Rev 1)' }),
    new Game({
      name: 'Starwing (Germany) (Beta) (1993-03-17)',
      cloneOf: 'Starwing (Europe) (Rev 1)',
    }),
    new Game({
      name: 'Starwing - Competition (Europe) (Competition Cart)',
      cloneOf: 'Starwing (Europe) (Rev 1)',
    }),
    new Game({
      name: 'Starwing - Competition (Germany) (Competition Cart)',
      cloneOf: 'Starwing (Europe) (Rev 1)',
    }),
    new Game({
      name: 'Super Star Fox Weekend (USA) (Competition Cart, Nintendo Power mail-order)',
      cloneOf: 'Starwing (Europe) (Rev 1)',
    }),
    // Game with Redump-style revisions
    new Game({ name: 'World Cup Golf - In Hyatt Dorado Beach (Japan) (En,Ja)' }),
    new Game({
      name: 'World Cup Golf - Professional Edition (Germany) (Rev A)',
      cloneOf: 'World Cup Golf - In Hyatt Dorado Beach (Japan) (En,Ja)',
    }),
    new Game({
      name: 'World Cup Golf - Professional Edition (Europe) (3S)',
      cloneOf: 'World Cup Golf - In Hyatt Dorado Beach (Japan) (En,Ja)',
    }),
    new Game({
      name: 'World Cup Golf - Professional Edition (France)',
      cloneOf: 'World Cup Golf - In Hyatt Dorado Beach (Japan) (En,Ja)',
    }),
    new Game({
      name: 'World Cup Golf - Professional Edition (USA) (RE2)',
      cloneOf: 'World Cup Golf - In Hyatt Dorado Beach (Japan) (En,Ja)',
    }),
    new Game({
      name: 'World Cup Golf - Professional Edition (Europe) (1S)',
      cloneOf: 'World Cup Golf - In Hyatt Dorado Beach (Japan) (En,Ja)',
    }),
    // Game with Redump-style revisions
    new Game({ name: 'Eternal Champions - Challenge from the Dark Side (USA)' }),
    new Game({
      name: 'Eternal Champions - Challenge from the Dark Side (USA) (RE)',
      cloneOf: 'Eternal Champions - Challenge from the Dark Side (USA)',
    }),
    new Game({
      name: 'Eternal Champions - Challenge from the Dark Side (USA) (Beta) (1995-05-11)',
      cloneOf: 'Eternal Champions - Challenge from the Dark Side (USA)',
    }),
    // Game with Redump-style revisions
    new Game({ name: 'Bug! (Europe)' }),
    new Game({ name: 'Bug! (USA)', cloneOf: 'Bug! (Europe)' }),
    new Game({ name: 'Bug! (USA) (Demo) (1S)', cloneOf: 'Bug! (Europe)' }),
    new Game({ name: 'Bug! (USA) (Demo) (3S)', cloneOf: 'Bug! (Europe)' }),
    new Game({ name: 'Bug! (USA) (R)', cloneOf: 'Bug! (Europe)' }),
    // Game with Redump-style versions
    new Game({ name: "Bram Stoker's Dracula (USA) (Alt 2)" }),
    new Game({
      name: "Bram Stoker's Dracula (USA)",
      cloneOf: "Bram Stoker's Dracula (USA) (Alt 2)",
    }),
    new Game({
      name: "Bram Stoker's Dracula (USA) (Version 2.0)",
      cloneOf: "Bram Stoker's Dracula (USA) (Alt 2)",
    }),
    new Game({
      name: "Bram Stoker's Dracula (USA) (Alt 1)",
      cloneOf: "Bram Stoker's Dracula (USA) (Alt 2)",
    }),
    // Game without any revisions
    new Game({
      name: 'Super Metroid (Europe) (En,Fr,De)',
      cloneOf: 'Super Metroid (Europe) (En,Fr,De)',
    }),
    new Game({
      name: 'Super Metroid (Japan, USA) (En,Ja)',
      cloneOf: 'Super Metroid (Europe) (En,Fr,De)',
    }),
    new Game({
      name: 'Super Metroid (Japan) (En,Ja) (Virtual Console, Switch Online)',
      cloneOf: 'Super Metroid (Europe) (En,Fr,De)',
    }),
    new Game({
      name: 'Super Metroid (USA, Europe) (En,Ja) (Virtual Console, Classic Mini, Switch Online)',
      cloneOf: 'Super Metroid (Europe) (En,Fr,De)',
    }),
  ];
  const dat = new LogiqxDAT({ header: new Header(), games: revisionGames });

  it('should prefer newer revisions', () => {
    const options = new Options({
      single: true,
      preferRevision: PreferRevisionInverted[PreferRevision.NEWER].toLowerCase(),
    });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
      'Donkey Kong Country (USA) (Rev 2)',
      'Star Fox (USA) (Rev 2)',
      'World Cup Golf - Professional Edition (USA) (RE2)',
      'Eternal Champions - Challenge from the Dark Side (USA) (RE)',
      'Bug! (USA) (R)',
      "Bram Stoker's Dracula (USA) (Version 2.0)",
      'Super Metroid (Europe) (En,Fr,De)',
    ]);
  });

  it('should prefer older revisions', () => {
    const options = new Options({
      single: true,
      preferRevision: PreferRevisionInverted[PreferRevision.OLDER].toLowerCase(),
    });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
      'Donkey Kong Country (Europe) (En,Fr,De)',
      'Star Fox (Japan)',
      'World Cup Golf - In Hyatt Dorado Beach (Japan) (En,Ja)',
      'Eternal Champions - Challenge from the Dark Side (USA)',
      'Bug! (Europe)',
      "Bram Stoker's Dracula (USA) (Alt 2)",
      'Super Metroid (Europe) (En,Fr,De)',
    ]);
  });
});

it('should prefer "retail" games', () => {
  const options = new Options({ single: true, preferRetail: true });
  const games: Game[] = [
    // Game with an aftermarket release
    // Game with an alpha
    // Game with a bad dump
    // Game with a cracked version
    // Game with a debug version
    new Game({ name: 'Perfect Dark (Europe) (2000-04-26) (Debug)' }),
    new Game({ name: 'Perfect Dark (USA) (2000-03-22) (Debug)' }),
    new Game({ name: 'Perfect Dark (Europe) (En,Fr,De,Es,It)' }),
    new Game({ name: 'Perfect Dark (Japan)' }),
    new Game({ name: 'Perfect Dark (USA)' }),
    new Game({ name: 'Perfect Dark (USA) (Rev 1)' }),
    // Game with a demo
    new Game({ name: 'Turok - Dinosaur Hunter (USA) (Demo) (Kiosk, E3 1997)' }),
    new Game({ name: 'Turok - Dinosaur Hunter (Europe)' }),
    new Game({ name: 'Turok - Dinosaur Hunter (Europe) (Rev 1)' }),
    new Game({ name: 'Turok - Dinosaur Hunter (Germany)' }),
    new Game({ name: 'Turok - Dinosaur Hunter (USA)' }),
    new Game({ name: 'Turok - Dinosaur Hunter (USA) (Rev 1)' }),
    new Game({ name: 'Turok - Dinosaur Hunter (USA) (Rev 2)' }),
    new Game({ name: 'Turok - Dinosaur Hunter (Germany) (Rev 1)' }),
    new Game({ name: 'Turok - Dinosaur Hunter (Germany) (Rev 2)' }),
    // Game with a fixed version
    // Game with an over-dump
    // Game with a pirated version
    // Game with a program version
    // Game with a prototype
    new Game({ name: 'Firemen, The (USA) (Proto)' }),
    new Game({ name: 'Firemen, The (Europe) (En,Fr,De)' }),
    new Game({ name: 'Firemen, The (Japan)' }),
    // Game with a sample
    // Game with a translated version
    // Game with a Bung fix version
    // Game with a hacked version
    // Game with a trainer version
  ];
  const datWithoutParents = new LogiqxDAT({ header: new Header(), games });
  const dat = new DATParentInferrer(options, new ProgressBarFake()).infer(datWithoutParents);
  const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
  expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
    'Firemen, The (Europe) (En,Fr,De)',
    'Perfect Dark (Europe) (En,Fr,De,Es,It)',
    'Turok - Dinosaur Hunter (Europe)',
  ]);
});

it('should prefer parents', () => {
  const options = new Options({ single: true });
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [
      ...testGameWarlocked,
      ...testGameAdvanceWars,
      ...testGameDaveMirraFreestyleBmx2,
    ].toReversed(),
  });
  const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
  expect(
    preferredDat
      .getGames()
      .toReversed()
      .map((game) => game.getName()),
  ).toEqual([
    'Warlocked (USA)',
    'Advance Wars (Europe) (En,Fr,De,Es)',
    'Dave Mirra Freestyle BMX 2 (Europe) (En,Fr,De,Es,It) (Rev 1)',
  ]);
});

describe('preference combinations', () => {
  // https://github.com/emmercm/igir/issues/1390
  it('should prioritize prefer-language over prefer-region', () => {
    const options = new Options({
      filterLanguage: ['DE'],
      preferLanguage: ['DE'],
      preferRegion: ['GER', 'USA', 'EUR'],
      single: true,
    });
    const dat = new LogiqxDAT({ header: new Header(), games: testGameAdvanceWars });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
      'Advance Wars (Europe) (En,Fr,De,Es)',
    ]);
  });

  // https://github.com/emmercm/igir/issues/1392
  it('should prefer languages in some game names over releases', () => {
    const options = new Options({
      preferLanguage: ['DE', 'EN'],
      preferRegion: ['GER', 'EUR', 'USA', 'WORLD'],
      preferRevision: PreferRevisionInverted[PreferRevision.NEWER].toLowerCase(),
      single: true,
    });
    const dat = new LogiqxDAT({ header: new Header(), games: testGameDaveMirraFreestyleBmx2 });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
      'Dave Mirra Freestyle BMX 2 (Europe) (En,Fr,De,Es,It) (Rev 1)',
    ]);
  });

  // https://github.com/emmercm/igir/discussions/1496#discussioncomment-12514981
  it('should prefer regions in some game names over releases', () => {
    const options = new Options({
      single: true,
      preferRevision: PreferRevisionInverted[PreferRevision.NEWER].toLowerCase(),
      preferRegion: ['USA'],
    });
    const dat = new LogiqxDAT({
      header: new Header(),
      games: [
        new Game({
          name: 'Tetris 2 (USA, Europe) (Rev 1) (SGB Enhanced)',
          description: 'Tetris 2 (USA, Europe) (Rev 1) (SGB Enhanced)',
          release: new Release('Tetris 2 (USA, Europe) (Rev 1) (SGB Enhanced)', 'EUR'),
          roms: new ROM({
            name: 'Tetris 2 (USA, Europe) (Rev 1) (SGB Enhanced).gb',
            size: 131_072,
          }),
        }),
        new Game({
          name: 'Tetris 2 (USA, Europe) (SGB Enhanced)',
          cloneOf: 'Tetris 2 (USA, Europe) (Rev 1) (SGB Enhanced)',
          description: 'Tetris 2 (USA, Europe) (SGB Enhanced)',
          roms: new ROM({ name: 'Tetris 2 (USA, Europe) (SGB Enhanced).gb', size: 131_072 }),
        }),
        new Game({
          name: 'Tetris 2 (USA)',
          cloneOf: 'Tetris 2 (USA, Europe) (Rev 1) (SGB Enhanced)',
          description: 'Tetris 2 (USA)',
          release: new Release('Tetris 2 (USA)', 'USA'),
          roms: new ROM({ name: 'Tetris 2 (USA).gb', size: 131_072 }),
        }),
      ],
    });
    const preferredDat = new DATPreferer(options, new ProgressBarFake()).prefer(dat);
    expect(preferredDat.getGames().map((game) => game.getName())).toEqual([
      'Tetris 2 (USA, Europe) (Rev 1) (SGB Enhanced)',
    ]);
  });
});
