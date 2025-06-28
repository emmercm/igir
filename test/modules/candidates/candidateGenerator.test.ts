import os from 'node:os';
import path from 'node:path';

import MappableSemaphore from '../../../src/async/mappableSemaphore.js';
import CandidateGenerator from '../../../src/modules/candidates/candidateGenerator.js';
import ROMIndexer from '../../../src/modules/roms/romIndexer.js';
import ArrayPoly from '../../../src/polyfill/arrayPoly.js';
import DAT from '../../../src/types/dats/dat.js';
import Disk from '../../../src/types/dats/disk.js';
import Game from '../../../src/types/dats/game.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import MameDAT from '../../../src/types/dats/mame/mameDat.js';
import Release from '../../../src/types/dats/release.js';
import ROM from '../../../src/types/dats/rom.js';
import ArchiveEntry from '../../../src/types/files/archives/archiveEntry.js';
import Rar from '../../../src/types/files/archives/rar.js';
import SevenZip from '../../../src/types/files/archives/sevenZip/sevenZip.js';
import Tar from '../../../src/types/files/archives/tar.js';
import Zip from '../../../src/types/files/archives/zip.js';
import File from '../../../src/types/files/file.js';
import ROMHeader from '../../../src/types/files/romHeader.js';
import IndexedFiles from '../../../src/types/indexedFiles.js';
import Options, { GameSubdirMode, GameSubdirModeInverted } from '../../../src/types/options.js';
import WriteCandidate from '../../../src/types/writeCandidate.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const gameWithNoRoms = new Game({
  name: 'game with no ROMs',
});
const gameWithOneRom = new Game({
  name: 'game with one ROM and multiple releases',
  release: [
    new Release('game with one ROM and multiple releases', 'USA', 'En'),
    new Release('game with one ROM and multiple releases', 'EUR', 'En'),
    new Release('game with one ROM and multiple releases', 'JPN', 'Ja'),
  ],
  roms: new ROM({ name: 'one.rom', size: 1, crc32: '12345678' }),
});
const gameWithTwoRomsParent = new Game({
  name: 'game with two ROMs (parent)',
  release: new Release('game with two ROMs (parent)', 'WORLD'),
  roms: [
    new ROM({ name: 'two.a', size: 2, crc32: 'abcdef90' }),
    new ROM({ name: 'two.b', size: 3, crc32: '09876543' }),
  ],
});
const gameWithTwoRomsClone = new Game({
  name: 'game with two ROMs (clone)',
  cloneOf: gameWithTwoRomsParent.getName(),
  release: new Release('game with two ROMs (clone)', 'JPN'),
  roms: [
    new ROM({ name: 'three.a', size: 4, crc32: 'abcd1234' }),
    new ROM({ name: 'three.b', size: 5, crc32: '86753090' }),
  ],
});
const gameWithDuplicateRoms = new Game({
  name: 'game with duplicate ROMs',
  roms: [
    new ROM({ name: 'Disc.cue', size: 0, crc32: 'a8c5c66e' }),
    new ROM({ name: 'Disc (Track 01).cue', size: 1, crc32: '22144d0f' }),
    new ROM({ name: 'Disc (Track 02).cue', size: 2, crc32: '11bf5dbd' }),
    new ROM({ name: 'Disc (Track 03).cue', size: 3, crc32: 'f9188f3a' }),
    new ROM({ name: 'Disc (Track 04).cue', size: 4, crc32: '11bf5dbd' }),
  ],
});
const datWithFourGames = new LogiqxDAT({
  header: new Header(),
  games: [gameWithNoRoms, gameWithOneRom, gameWithTwoRomsParent, gameWithTwoRomsClone],
});

async function candidateGenerator(
  options: Options,
  dat: DAT,
  files: (File | Promise<File>)[],
): Promise<WriteCandidate[]> {
  const resolvedFiles = await Promise.all(files);
  const indexedFiles = new ROMIndexer(options, new ProgressBarFake()).index(resolvedFiles);
  return new CandidateGenerator(
    options,
    new ProgressBarFake(),
    new MappableSemaphore(os.cpus().length),
  ).generate(dat, indexedFiles);
}

describe.each(['zip', 'extract', 'raw'])('command: %s', (command) => {
  const options = new Options({
    commands: ['copy', command],
  });

  it('should return no candidates with no games', async () => {
    // Given
    const datWithoutParents = new LogiqxDAT({ header: new Header() });

    // When
    const candidates = await candidateGenerator(options, datWithoutParents, []);

    // Then
    expect(candidates).toHaveLength(0);
  });

  it('should return no candidates with no games with ROMs', async () => {
    // Given
    const datWithGamesWithNoRoms = new LogiqxDAT({ header: new Header(), games: [gameWithNoRoms] });

    // When
    const candidates = await candidateGenerator(options, datWithGamesWithNoRoms, []);

    // Then
    expect(candidates).toHaveLength(0);
  });

  test.each([
    // Doesn't match anything
    [File.fileOf({ filePath: 'three.rom', size: 4, crc32: '34567890' })],
    // Doesn't match size
    [File.fileOf({ filePath: 'one.rom', size: 999_999, crc32: '12345678' })],
    // Doesn't match CRC
    [File.fileOf({ filePath: 'one.rom', size: 1, crc32: '00000000' })],
    // Matches one ROM of a game with multiple ROMs
    [File.fileOf({ filePath: 'two.a', size: 2, crc32: 'abcdef90' })],
  ])(
    'should only return candidates of games with no ROMs when no game has all of its files matched: %#',
    async (...filePromises) => {
      // Given
      const files = await Promise.all(filePromises);

      // When
      const candidates = await candidateGenerator(options, datWithFourGames, files);

      // Then
      expect(candidates).toHaveLength(1);
      const candidateWithNoRoms = candidates[0];
      expect(candidateWithNoRoms.getRomsWithFiles()).toHaveLength(0);
    },
  );

  it("should return candidates when games don't have all of their ROMs when allowIncompleteSets:true", async () => {
    // Given
    const allowIncompleteOptions = new Options({
      ...options,
      allowIncompleteSets: true,
    });
    const files = [
      // Doesn't match anything
      await File.fileOf({ filePath: 'three.rom', size: 4, crc32: '34567890' }),
      // Doesn't match size
      await File.fileOf({ filePath: 'one.rom', size: 999_999, crc32: '12345678' }),
      // Doesn't match CRC
      await File.fileOf({ filePath: 'one.rom', size: 1, crc32: '00000000' }),
      // Matches one ROM of a game with multiple ROMs
      await File.fileOf({ filePath: 'two.a', size: 2, crc32: 'abcdef90' }),
    ];

    // When
    const candidates = await candidateGenerator(allowIncompleteOptions, datWithFourGames, files);

    // Then
    const incompleteCandidates = candidates.filter(
      (candidate) => candidate.getName() === gameWithTwoRomsParent.getName(),
    );
    expect(incompleteCandidates).toHaveLength(1);
    expect(incompleteCandidates[0].getRomsWithFiles().length).toBeGreaterThan(0);
    expect(incompleteCandidates[0].getRomsWithFiles()).not.toHaveLength(
      incompleteCandidates[0].getGame().getRoms().length,
    );
  });

  it('should return some candidates for some games that have all of their files matched', async () => {
    // Given
    const files = [
      await ArchiveEntry.entryOf({
        archive: new Zip('one.zip'),
        entryPath: 'one.rom',
        size: 1,
        crc32: '12345678',
      }),
      await File.fileOf({ filePath: '1.rom', size: 1, crc32: '12345678' }), // duplicate
      await File.fileOf({ filePath: 'two.a', size: 2, crc32: 'abcdef90' }), // only 1/2 ROMs were found for the game
    ];

    // When
    const candidates = await candidateGenerator(options, datWithFourGames, files);

    // Then
    expect(
      candidates.map((candidate) => [
        candidate.getName(),
        candidate.getRomsWithFiles().map((rwf) => rwf.getInputFile().toString()),
      ]),
    ).toEqual([
      ['game with no ROMs', []],
      // preferred the non-archive when extracting, otherwise are raw-copying
      ['game with one ROM and multiple releases', [command === 'extract' ? '1.rom' : 'one.zip']],
    ]);
  });

  it('should return all candidates for all games that have all of their files matched', async () => {
    // Given
    const oneTwoThreeZip = new Zip('onetwothree.zip');
    const twoSevenZip = new SevenZip('two.7z');
    const files = [
      await File.fileOf({ filePath: 'one.rom', size: 1, crc32: '12345678' }),
      await ArchiveEntry.entryOf({
        archive: oneTwoThreeZip,
        entryPath: 'one.rom',
        size: 1,
        crc32: '12345678',
      }),
      await ArchiveEntry.entryOf({
        archive: oneTwoThreeZip,
        entryPath: 'two.rom',
        size: 2,
        crc32: 'abcdef90',
      }),
      await ArchiveEntry.entryOf({
        archive: oneTwoThreeZip,
        entryPath: 'three.rom',
        size: 4,
        crc32: '34567890',
      }),
      await ArchiveEntry.entryOf({
        archive: twoSevenZip,
        entryPath: 'a.rom',
        size: 2,
        crc32: 'abcdef90',
      }),
      await ArchiveEntry.entryOf({
        archive: twoSevenZip,
        entryPath: 'b.rom',
        size: 3,
        crc32: '09876543',
      }),
    ];

    // When
    const candidates = await candidateGenerator(options, datWithFourGames, files);

    // Then
    expect(
      candidates.map((candidate) => [candidate.getName(), candidate.getRomsWithFiles().length]),
    ).toEqual([
      ['game with no ROMs', 0],
      ['game with one ROM and multiple releases', 1],
      // two.7z contains both ROMs but with the wrong entry names
      ...(command === 'raw' ? [] : [['game with two ROMs (parent)', 2]]),
    ]);
    expect(candidates[1].getRomsWithFiles()[0].getInputFile()).not.toBeInstanceOf(ArchiveEntry); // preferred the non-archive
  });
});

describe('with ROMs with headers', () => {
  const twoSevenZip = new SevenZip('two.7z');
  const filePromises = [
    // Extension doesn't change with header removal
    File.fileOf({
      filePath: 'one.rom',
      size: 1,
      crc32: '12345678',
      fileHeader: ROMHeader.headerFromFilename('dummy.nes'),
    }),
    // Extension does change with header removal
    ArchiveEntry.entryOf({
      archive: twoSevenZip,
      entryPath: 'a.rom',
      size: 2,
      crc32: 'abcdef90',
      fileHeader: ROMHeader.headerFromFilename('dummy.smc'),
    }),
    // Doesn't have a header
    ArchiveEntry.entryOf({
      archive: twoSevenZip,
      entryPath: 'b.rom',
      size: 3,
      crc32: '09876543',
    }),
  ];

  it('zip', async () => {
    // Given
    const options = new Options({
      commands: ['copy', 'zip'],
      removeHeaders: [''], // all
    });

    // When
    const candidates = await candidateGenerator(options, datWithFourGames, filePromises);

    // Then
    expect(candidates).toHaveLength(3);
    expect(
      candidates.map((candidate) => [
        candidate.getName(),
        candidate.getRomsWithFiles().map((rwf) => rwf.getOutputFile().toString()),
      ]),
    ).toEqual([
      ['game with no ROMs', []],
      [
        'game with one ROM and multiple releases',
        ['game with one ROM and multiple releases.zip|one.nes'], // respected headerless extension
      ],
      [
        'game with two ROMs (parent)',
        [
          'game with two ROMs (parent).zip|two.sfc', // respected headerless extension
          'game with two ROMs (parent).zip|two.b', // respected DAT
        ],
      ],
    ]);
  });

  it('extract', async () => {
    // Given
    const options = new Options({
      commands: ['copy', 'extract'],
      removeHeaders: [''], // all
      dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
    });

    // When
    const candidates = await candidateGenerator(options, datWithFourGames, filePromises);

    // Then
    expect(candidates).toHaveLength(3);
    expect(
      candidates.map((candidate) => [
        candidate.getName(),
        candidate.getRomsWithFiles().map((rwf) => rwf.getOutputFile().toString()),
      ]),
    ).toEqual([
      ['game with no ROMs', []],
      ['game with one ROM and multiple releases', ['one.nes']], // respected headerless extension
      [
        'game with two ROMs (parent)',
        [
          path.join('game with two ROMs (parent)', 'two.sfc'), // respected headerless extension
          path.join('game with two ROMs (parent)', 'two.b'), // respected DAT
        ],
      ],
    ]);
  });

  it('raw', async () => {
    // Given
    const options = new Options({
      commands: ['copy'],
      removeHeaders: [''], // all
    });

    // When
    const candidates = await candidateGenerator(options, datWithFourGames, filePromises);

    // Then
    expect(
      candidates.map((candidate) => [
        candidate.getName(),
        candidate.getRomsWithFiles().map((rwf) => rwf.getOutputFile().toString()),
      ]),
    ).toEqual([
      ['game with no ROMs', []],
      // respected headerless extension
      ['game with one ROM and multiple releases', ['one.nes']],
    ]);
  });
});

describe('with different input files for every game ROM', () => {
  const filePromises = [
    File.fileOf({ filePath: 'one.rom', size: 1, crc32: '12345678' }),
    ArchiveEntry.entryOf({
      // duplicate
      archive: new Tar('1.tar'),
      entryPath: '1.rom',
      size: 1,
      crc32: '12345678',
    }),
    ArchiveEntry.entryOf({
      archive: new Rar('a.rar'),
      entryPath: 'a.rom',
      size: 2,
      crc32: 'abcdef90',
    }),
    ArchiveEntry.entryOf({
      archive: new Rar('b.rar'),
      entryPath: 'b.rom',
      size: 3,
      crc32: '09876543',
    }),
  ];

  test.each(['zip', 'extract'])(
    'should generate candidates when all ROMs for a game are in different files: %s',
    async (command) => {
      // Given
      const options = new Options({ commands: ['copy', command] });

      // When
      const candidates = await candidateGenerator(options, datWithFourGames, filePromises);

      // Then there should still be 3 candidates, with the input -> output:
      //  (nothing) -> game with no ROMs
      //  one.rom -> game with one ROM
      //  a.rar|a.rom & b.rar|b.rom -> game with two ROMs (either in a folder or a zip, together)
      expect(
        candidates.map((candidate) => [
          candidate.getName(),
          candidate.getRomsWithFiles().map((rwf) => rwf.getInputFile().toString()),
        ]),
      ).toEqual([
        ['game with no ROMs', []],
        ['game with one ROM and multiple releases', ['one.rom']],
        ['game with two ROMs (parent)', ['a.rar|a.rom', 'b.rar|b.rom']],
      ]);
    },
  );

  it('should generate no candidate when multiple input archives need to raw write to the same output path', async () => {
    // Given
    const options = new Options({ commands: ['copy'] });

    // When
    const candidates = await candidateGenerator(options, datWithFourGames, filePromises);

    // Then there should be 2 candidates, with the input -> output:
    //  (nothing) -> game with no ROMs
    //  one.rom -> one.rom
    //  a.rar|a.rom & b.rar|b.rom -> game with two ROMs.rar -- CONFLICT!
    // Because we're not extracting or zipping, two different input 7z files wanted to write to the
    //  same output file, which is a problem, so the parent resulted in no candidates
    expect(
      candidates.map((candidate) => [
        candidate.getName(),
        candidate.getRomsWithFiles().map((rwf) => rwf.getInputFile().toString()),
      ]),
    ).toEqual([
      ['game with no ROMs', []],
      ['game with one ROM and multiple releases', ['one.rom']],
    ]);
  });
});

describe('token replacement', () => {
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [
      new Game({
        name: 'Advance Wars - Dual Strike (USA, Australia)',
        categories: 'Games',
        roms: new ROM({
          name: 'Advance Wars - Dual Strike (USA, Australia).nds',
          size: 33_554_432,
          crc32: '4d9a91e3',
        }),
      }),
      new Game({
        name: 'Animal Crossing - Wild World (Europe) (En,Fr,De,Es,It) (Demo) (Kiosk)',
        categories: 'Demos',
        roms: new ROM({
          name: 'Animal Crossing - Wild World (Europe) (En,Fr,De,Es,It) (Demo) (Kiosk).nds',
          size: 67_108_864,
          crc32: '0e58ed2c',
        }),
      }),
      new Game({
        name: 'Kirby - Canvas Curse (USA)',
        // No categories on purpose
        roms: new ROM({
          name: 'Kirby - Canvas Curse (USA).nds',
          size: 67_108_864,
          crc32: 'fe7dc5ee',
        }),
      }),
      new Game({
        name: 'Nintendo DS Browser (USA, Europe) (En,Fr,De,Es,It)',
        categories: 'Applications',
        roms: new ROM({
          name: 'Nintendo DS Browser (USA, Europe) (En,Fr,De,Es,It).nds',
          size: 8_388_608,
          crc32: 'd5fce7e1',
        }),
      }),
    ],
  });

  const files = Promise.all(
    dat.getGames().flatMap((game) => game.getRoms().map(async (rom) => rom.toFile())),
  );

  it('should replace {region}', async () => {
    const options = new Options({
      commands: ['copy'],
      output: 'output/{region}',
    });
    const candidates = await candidateGenerator(options, dat, await files);
    const outputFiles = candidates
      .flatMap((candidate) =>
        candidate.getRomsWithFiles().map((rwf) => rwf.getOutputFile().toString()),
      )
      .sort();
    expect(outputFiles).toEqual([
      path.join('output', 'AUS', 'Advance Wars - Dual Strike (USA, Australia).nds'),
      path.join(
        'output',
        'EUR',
        'Animal Crossing - Wild World (Europe) (En,Fr,De,Es,It) (Demo) (Kiosk).nds',
      ),
      path.join('output', 'EUR', 'Nintendo DS Browser (USA, Europe) (En,Fr,De,Es,It).nds'),
      path.join('output', 'USA', 'Advance Wars - Dual Strike (USA, Australia).nds'),
      path.join('output', 'USA', 'Kirby - Canvas Curse (USA).nds'),
      path.join('output', 'USA', 'Nintendo DS Browser (USA, Europe) (En,Fr,De,Es,It).nds'),
    ]);
  });

  it('should replace {language}', async () => {
    const options = new Options({
      commands: ['copy'],
      output: 'output/{language}',
    });
    const candidates = await candidateGenerator(options, dat, await files);
    const outputFiles = candidates
      .flatMap((candidate) =>
        candidate.getRomsWithFiles().map((rwf) => rwf.getOutputFile().toString()),
      )
      .sort();
    expect(outputFiles).toEqual([
      path.join(
        'output',
        'DE',
        'Animal Crossing - Wild World (Europe) (En,Fr,De,Es,It) (Demo) (Kiosk).nds',
      ),
      path.join('output', 'DE', 'Nintendo DS Browser (USA, Europe) (En,Fr,De,Es,It).nds'),
      path.join('output', 'EN', 'Advance Wars - Dual Strike (USA, Australia).nds'),
      path.join(
        'output',
        'EN',
        'Animal Crossing - Wild World (Europe) (En,Fr,De,Es,It) (Demo) (Kiosk).nds',
      ),
      path.join('output', 'EN', 'Kirby - Canvas Curse (USA).nds'),
      path.join('output', 'EN', 'Nintendo DS Browser (USA, Europe) (En,Fr,De,Es,It).nds'),
      path.join(
        'output',
        'ES',
        'Animal Crossing - Wild World (Europe) (En,Fr,De,Es,It) (Demo) (Kiosk).nds',
      ),
      path.join('output', 'ES', 'Nintendo DS Browser (USA, Europe) (En,Fr,De,Es,It).nds'),
      path.join(
        'output',
        'FR',
        'Animal Crossing - Wild World (Europe) (En,Fr,De,Es,It) (Demo) (Kiosk).nds',
      ),
      path.join('output', 'FR', 'Nintendo DS Browser (USA, Europe) (En,Fr,De,Es,It).nds'),
      path.join(
        'output',
        'IT',
        'Animal Crossing - Wild World (Europe) (En,Fr,De,Es,It) (Demo) (Kiosk).nds',
      ),
      path.join('output', 'IT', 'Nintendo DS Browser (USA, Europe) (En,Fr,De,Es,It).nds'),
    ]);
  });

  it('should replace {type}', async () => {
    const options = new Options({
      commands: ['copy'],
      output: 'output/{type}',
    });
    const candidates = await candidateGenerator(options, dat, await files);
    const outputFiles = candidates
      .flatMap((candidate) =>
        candidate.getRomsWithFiles().map((rwf) => rwf.getOutputFile().toString()),
      )
      .sort();
    expect(outputFiles).toEqual([
      path.join(
        'output',
        'Demo',
        'Animal Crossing - Wild World (Europe) (En,Fr,De,Es,It) (Demo) (Kiosk).nds',
      ),
      path.join('output', 'Program', 'Nintendo DS Browser (USA, Europe) (En,Fr,De,Es,It).nds'),
      path.join('output', 'Retail', 'Advance Wars - Dual Strike (USA, Australia).nds'),
      path.join('output', 'Retail', 'Kirby - Canvas Curse (USA).nds'),
    ]);
  });

  it('should replace {category}', async () => {
    const options = new Options({
      commands: ['copy'],
      output: 'output/{category}',
    });
    const candidates = await candidateGenerator(options, dat, await files);
    const outputFiles = candidates
      .flatMap((candidate) =>
        candidate.getRomsWithFiles().map((rwf) => rwf.getOutputFile().toString()),
      )
      .sort();
    expect(outputFiles).toEqual([
      path.join('output', 'Applications', 'Nintendo DS Browser (USA, Europe) (En,Fr,De,Es,It).nds'),
      path.join(
        'output',
        'Demos',
        'Animal Crossing - Wild World (Europe) (En,Fr,De,Es,It) (Demo) (Kiosk).nds',
      ),
      path.join('output', 'Games', 'Advance Wars - Dual Strike (USA, Australia).nds'),
    ]);
  });

  it('should not replace {dummy}', async () => {
    const options = new Options({
      commands: ['copy'],
      output: 'output/{dummy}',
    });
    const candidates = await candidateGenerator(options, dat, await files);
    expect(candidates).toHaveLength(0);
  });
});

describe.each(['copy', 'move'])('raw writing: %s', (command) => {
  const options = new Options({ commands: [command] });

  describe('allow excess sets', () => {
    const archive = new Zip('input.zip');
    const files = [
      // Matches a game with two ROMs
      File.fileOf({ filePath: 'two.a', size: 2, crc32: 'abcdef90' }),
      ArchiveEntry.entryOf({
        archive,
        entryPath: 'two.b',
        size: 3,
        crc32: '09876543',
      }),
      // Excess file
      ArchiveEntry.entryOf({
        archive,
        entryPath: 'ninetynine.rom',
        size: 9,
        crc32: '99999999',
      }),
    ];

    it('should return no candidates when input files have excess files and allowExcessSets:false', async () => {
      // Given
      const allowExcessOptions = new Options({
        ...options,
        allowExcessSets: false,
      });

      // When
      const candidates = await candidateGenerator(allowExcessOptions, datWithFourGames, files);

      // Then
      expect(candidates).toHaveLength(1);
    });

    it('should return candidates when input files have excess files and allowExcessSets:true', async () => {
      // Given
      const allowExcessOptions = new Options({
        ...options,
        allowExcessSets: true,
      });

      // When
      const candidates = await candidateGenerator(allowExcessOptions, datWithFourGames, files);

      // Then
      expect(candidates).toHaveLength(2);
    });
  });

  describe('prefer input files from the same archive', () => {
    it('should behave like normal with only one ROM', async () => {
      // Given
      const datGame = gameWithOneRom;
      expect(datGame.getRoms()).toHaveLength(1);
      const dat = new LogiqxDAT({ header: new Header(), games: [datGame] });

      // And every file is present, both raw and archived
      const rawFiles = await Promise.all(
        dat
          .getGames()
          .flatMap((game) => game.getRoms())
          .map(async (rom) => rom.toFile()),
      );
      const archive = new Zip('archive.zip');
      const archiveEntries = await Promise.all(
        dat
          .getGames()
          .flatMap((game) => game.getRoms())
          .map(async (rom) => rom.toArchiveEntry(archive)),
      );
      const files = [...rawFiles, ...archiveEntries];

      // When
      const candidates = await candidateGenerator(options, dat, files);

      // Then the Archive isn't used for every input file
      expect(candidates).toHaveLength(1);

      const firstCandidate = candidates[0];
      const romsWithFiles = firstCandidate.getRomsWithFiles();
      expect(romsWithFiles).toHaveLength(datGame.getRoms().length);

      for (const romsWithFile of romsWithFiles.values()) {
        const inputFile = romsWithFile.getInputFile();
        expect(inputFile.getFilePath()).toEqual(archive.getFilePath());
      }
    });

    describe.each([gameWithTwoRomsParent, gameWithTwoRomsClone, gameWithDuplicateRoms])(
      'game: %s',
      (datGame) => {
        const dat = new LogiqxDAT({ header: new Header(), games: [datGame] });

        it('should behave like normal with no archives', async () => {
          // Given every file is present, raw
          const rawFiles = await Promise.all(
            dat
              .getGames()
              .flatMap((game) => game.getRoms())
              .map(async (rom) => rom.toFile()),
          );

          // When
          const candidates = await candidateGenerator(options, dat, rawFiles);

          // Then the Archive isn't used for any input file
          expect(candidates).toHaveLength(1);

          const firstCandidate = candidates[0];
          const romsWithFiles = firstCandidate.getRomsWithFiles();
          expect(romsWithFiles).toHaveLength(datGame.getRoms().length);

          for (const [idx, romsWithFile] of romsWithFiles.entries()) {
            const inputFile = romsWithFile.getInputFile();
            expect(inputFile.getFilePath()).toEqual(datGame.getRoms()[idx].getName());
          }
        });

        it('should prefer input files from the same archive if it contains exactly every ROM', async () => {
          // Given every file is present, both raw and archived
          const rawFiles = await Promise.all(
            dat
              .getGames()
              .flatMap((game) => game.getRoms())
              .map(async (rom) => rom.toFile()),
          );
          const archive = new Zip('archive.zip');
          const archiveEntries = await Promise.all(
            dat
              .getGames()
              .flatMap((game) => game.getRoms())
              .map(async (rom) => rom.toArchiveEntry(archive)),
          );
          const files = [...rawFiles, ...archiveEntries];

          // When
          const candidates = await candidateGenerator(options, dat, files);

          // Then the Archive is used for every input file
          expect(candidates).toHaveLength(1);
          const firstCandidate = candidates[0];
          const romsWithFiles = firstCandidate.getRomsWithFiles();
          expect(romsWithFiles).toHaveLength(firstCandidate.getGame().getRoms().length);

          for (const romsWithFile of romsWithFiles) {
            const inputFile = romsWithFile.getInputFile();
            expect(inputFile.getFilePath()).toEqual(archive.getFilePath());
          }
        });

        it('should prefer input archives that contain extra junk files when allowExcessSets:true', async () => {
          const allowExcessOptions = new Options({
            ...options,
            allowExcessSets: true,
          });

          // Given every file is present, both raw and archived, plus extra ArchiveEntries
          const rawFiles = await Promise.all(
            dat
              .getGames()
              .flatMap((game) => game.getRoms())
              .map(async (rom) => rom.toFile()),
          );
          const archive = new Zip('archive.zip');
          const archiveEntries = await Promise.all(
            dat
              .getGames()
              .flatMap((game) => game.getRoms())
              .map(async (rom) => rom.toArchiveEntry(archive)),
          );
          const files = [
            ...rawFiles,
            ...archiveEntries,
            await ArchiveEntry.entryOf({
              archive,
              entryPath: 'junk.rom',
              size: 999,
              crc32: '55555555',
            }),
          ];

          // When
          const candidates = await candidateGenerator(allowExcessOptions, dat, files);

          // Then the Archive is used for every input file
          expect(candidates).toHaveLength(1);
          const firstCandidate = candidates[0];
          const romsWithFiles = firstCandidate.getRomsWithFiles();
          expect(romsWithFiles).toHaveLength(firstCandidate.getGame().getRoms().length);

          for (const romsWithFile of romsWithFiles) {
            const inputFile = romsWithFile.getInputFile();
            expect(inputFile.getFilePath()).toEqual(archive.getFilePath());
          }
        });
      },
    );
  });
});

describe('MAME v0.260', () => {
  const mameDat = new MameDAT({
    machine: [
      new Game({
        name: '2spicy',
        romOf: 'lindbios',
        description: '2 Spicy',
        roms: [
          new ROM({ name: '6.0.0010a.bin', size: 1_048_576, crc32: '10dd9b76' }),
          new ROM({ name: '6.0.0009.bin', size: 1_048_576, crc32: '5ffdfbf8' }),
          new ROM({ name: '6.0.0010.bin', size: 1_048_576, crc32: 'ea2bf888' }),
          new ROM({ name: 'fpr-24370b.ic6', size: 4_194_304, crc32: 'c3b021a4' }),
          new ROM({ name: 'vid_bios.u504', size: 65_536, crc32: 'f78d14d7' }),
          // new ROM({ name: '317-0491-com.bin', size: 8192 }),
        ],
        disks: [
          new Disk({
            name: 'mda-c0004a_revb_lindyellow_v2.4.20_mvl31a_boot_2.01',
            sha1: 'e13da5f827df852e742b594729ee3f933b387410',
          }),
          new Disk({ name: 'dvp-0027a', sha1: 'da1aacee9e32e813844f4d434981e69cc5c80682' }),
        ],
      }),
      new Game({
        name: 'area51mx',
        description: 'Area 51 / Maximum Force Duo v2.0',
        roms: [
          new ROM({ name: '2.0_68020_max-a51_kit_3h.3h', size: 524_288, crc32: '47cbf30b' }),
          new ROM({ name: '2.0_68020_max-a51_kit_3p.3p', size: 524_288, crc32: 'a3c93684' }),
          new ROM({ name: '2.0_68020_max-a51_kit_3m.3m', size: 524_288, crc32: 'd800ac17' }),
          new ROM({ name: '2.0_68020_max-a51_kit_3k.3k', size: 524_288, crc32: '0e78f308' }),
          new ROM({ name: 'jagwave.rom', size: 4096, crc32: '7a25ee5b' }),
        ],
        disks: new Disk({ name: 'area51mx', sha1: '5ff10f4e87094d4449eabf3de7549564ca568c7e' }),
      }),
      new Game({
        name: 'a51mxr3k',
        cloneOf: 'area51mx',
        romOf: 'area51mx',
        description: 'Area 51 / Maximum Force Duo (R3000, 2/10/98)',
        roms: [
          new ROM({ name: '1.0_r3k_max-a51_kit_hh.hh', size: 524_288, crc32: 'a984dab2' }),
          new ROM({ name: '1.0_r3k_max-a51_kit_hl.hl', size: 524_288, crc32: '0af49d74' }),
          new ROM({ name: '1.0_r3k_max-a51_kit_lh.lh', size: 524_288, crc32: 'd7d94dac' }),
          new ROM({ name: '1.0_r3k_max-a51_kit_ll.ll', size: 524_288, crc32: 'ece9e5ae' }),
          new ROM({ name: 'jagwave.rom', size: 4096, crc32: '7a25ee5b' }),
        ],
        disks: new Disk({ name: 'area51mx', sha1: '5ff10f4e87094d4449eabf3de7549564ca568c7e' }),
      }),
    ],
  });

  const mameIndexedFiles = Promise.all(
    mameDat
      .getGames()
      .flatMap((game) => [...game.getRoms(), ...game.getDisks()])
      .map(async (rom) => rom.toFile()),
  )
    .then((files) => files.filter(ArrayPoly.filterUniqueMapped((file) => file.hashCode())))
    .then((files) => IndexedFiles.fromFiles(files));

  it('should include disks by default', async () => {
    const options = new Options({
      commands: ['copy', 'zip'],
      dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
    });

    const candidates = await new CandidateGenerator(
      options,
      new ProgressBarFake(),
      new MappableSemaphore(os.cpus().length),
    ).generate(mameDat, await mameIndexedFiles);

    const outputFiles = candidates
      .flatMap((candidate) => candidate.getRomsWithFiles())
      .map((romWithFiles) => romWithFiles.getOutputFile().toString())
      .sort();
    expect(outputFiles).toEqual([
      '2spicy.zip|6.0.0009.bin',
      '2spicy.zip|6.0.0010.bin',
      '2spicy.zip|6.0.0010a.bin',
      '2spicy.zip|fpr-24370b.ic6',
      '2spicy.zip|vid_bios.u504',
      path.join('2spicy', 'dvp-0027a'),
      path.join('2spicy', 'mda-c0004a_revb_lindyellow_v2.4.20_mvl31a_boot_2.01'),
      'a51mxr3k.zip|1.0_r3k_max-a51_kit_hh.hh',
      'a51mxr3k.zip|1.0_r3k_max-a51_kit_hl.hl',
      'a51mxr3k.zip|1.0_r3k_max-a51_kit_lh.lh',
      'a51mxr3k.zip|1.0_r3k_max-a51_kit_ll.ll',
      'a51mxr3k.zip|jagwave.rom',
      path.join('a51mxr3k', 'area51mx'),
      'area51mx.zip|2.0_68020_max-a51_kit_3h.3h',
      'area51mx.zip|2.0_68020_max-a51_kit_3k.3k',
      'area51mx.zip|2.0_68020_max-a51_kit_3m.3m',
      'area51mx.zip|2.0_68020_max-a51_kit_3p.3p',
      'area51mx.zip|jagwave.rom',
      path.join('area51mx', 'area51mx'),
    ]);
  });

  it('should not include disks', async () => {
    const options = new Options({
      commands: ['copy'],
      dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
      excludeDisks: true,
    });

    const candidates = await new CandidateGenerator(
      options,
      new ProgressBarFake(),
      new MappableSemaphore(os.cpus().length),
    ).generate(mameDat, await mameIndexedFiles);

    const outputFiles = candidates
      .flatMap((candidate) => candidate.getRomsWithFiles())
      .map((romWithFiles) => romWithFiles.getOutputFile().toString())
      .sort();
    expect(outputFiles).toEqual([
      path.join('2spicy', '6.0.0009.bin'),
      path.join('2spicy', '6.0.0010.bin'),
      path.join('2spicy', '6.0.0010a.bin'),
      path.join('2spicy', 'fpr-24370b.ic6'),
      path.join('2spicy', 'vid_bios.u504'),
      path.join('a51mxr3k', '1.0_r3k_max-a51_kit_hh.hh'),
      path.join('a51mxr3k', '1.0_r3k_max-a51_kit_hl.hl'),
      path.join('a51mxr3k', '1.0_r3k_max-a51_kit_lh.lh'),
      path.join('a51mxr3k', '1.0_r3k_max-a51_kit_ll.ll'),
      path.join('a51mxr3k', 'jagwave.rom'),
      path.join('area51mx', '2.0_68020_max-a51_kit_3h.3h'),
      path.join('area51mx', '2.0_68020_max-a51_kit_3k.3k'),
      path.join('area51mx', '2.0_68020_max-a51_kit_3m.3m'),
      path.join('area51mx', '2.0_68020_max-a51_kit_3p.3p'),
      path.join('area51mx', 'jagwave.rom'),
    ]);
  });
});
