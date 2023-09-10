import path from 'path';

import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import FileIndexer from '../../src/modules/fileIndexer.js';
import ArchiveEntry from '../../src/types/files/archives/archiveEntry.js';
import Rar from '../../src/types/files/archives/rar.js';
import SevenZip from '../../src/types/files/archives/sevenZip.js';
import Tar from '../../src/types/files/archives/tar.js';
import Zip from '../../src/types/files/archives/zip.js';
import File from '../../src/types/files/file.js';
import ROMHeader from '../../src/types/files/romHeader.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import Parent from '../../src/types/logiqx/parent.js';
import Release from '../../src/types/logiqx/release.js';
import ROM from '../../src/types/logiqx/rom.js';
import Options from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ProgressBarFake from '../console/progressBarFake.js';

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
  rom: new ROM('one.rom', 1, '12345678'),
});
const gameWithTwoRomsParent = new Game({
  name: 'game with two ROMs (parent)',
  release: new Release('game with two ROMs (parent)', 'WORLD'),
  rom: [
    new ROM('two.a', 2, 'abcdef90'),
    new ROM('two.b', 3, '09876543'),
  ],
});
const gameWithTwoRomsClone = new Game({
  name: 'game with two ROMs (clone)',
  cloneOf: gameWithTwoRomsParent.getName(),
  release: new Release('game with two ROMs (clone)', 'JPN'),
  rom: [
    new ROM('three.a', 4, 'abcd1234'),
    new ROM('three.b', 5, '86753090'),
  ],
});
const gameWithDuplicateRoms = new Game({
  name: 'game with duplicate ROMs',
  rom: [
    new ROM('Disc.cue', 0, 'a8c5c66e'),
    new ROM('Disc (Track 01).cue', 1, '22144d0f'),
    new ROM('Disc (Track 02).cue', 2, '11bf5dbd'),
    new ROM('Disc (Track 03).cue', 3, 'f9188f3a'),
    new ROM('Disc (Track 04).cue', 4, '11bf5dbd'),
  ],
});
const datWithFourGames = new DAT(new Header(), [
  gameWithNoRoms,
  gameWithOneRom,
  gameWithTwoRomsParent,
  gameWithTwoRomsClone,
]);

async function candidateGenerator(
  options: Options,
  dat: DAT,
  files: (File | Promise<File>)[],
): Promise<Map<Parent, ReleaseCandidate[]>> {
  const resolvedFiles = await Promise.all(files);
  const indexedFiles = await new FileIndexer(options, new ProgressBarFake()).index(resolvedFiles);
  return new CandidateGenerator(options, new ProgressBarFake()).generate(dat, indexedFiles);
}

describe.each(['zip', 'extract', 'raw'])('command: %s', (command) => {
  const options = new Options({
    commands: ['copy', command],
  });

  it('should return no candidates with no parents', async () => {
    // Given
    const datWithoutParents = new DAT(new Header(), []);

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithoutParents, []);

    // Then
    expect(parentsToCandidates.size).toEqual(0);
  });

  it('should return no candidates with no games with ROMs', async () => {
    // Given
    const datWithGamesWithNoRoms = new DAT(new Header(), [gameWithNoRoms]);

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithGamesWithNoRoms, []);

    // Then
    expect(parentsToCandidates.size).toEqual(0);
  });

  test.each([
    // Doesn't match anything
    [File.fileOf('three.rom', 4, { crc32: '34567890' })],
    // Doesn't match size
    [File.fileOf('one.rom', 999999, { crc32: '12345678' })],
    // Doesn't match CRC
    [File.fileOf('one.rom', 1, { crc32: '00000000' })],
    // Matches one ROM of a game with multiple ROMs
    [File.fileOf('two.a', 2, { crc32: 'abcdef90' })],
  ])('should only return candidates of games with no ROMs when no game has all of its files matched: %#', async (...filePromises) => {
    // Given
    const files = await Promise.all(filePromises);

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithFourGames, files);

    // Then
    expect(parentsToCandidates.size).toEqual(3);
    const candidates = [...parentsToCandidates.values()].flatMap((c) => c);
    expect(candidates).toHaveLength(1);
    const candidateWithNoRoms = candidates[0];
    expect(candidateWithNoRoms.getRomsWithFiles()).toHaveLength(0);
  });

  it('should return some candidates for some games that have all of their files matched', async () => {
    // Given
    const files = [
      await ArchiveEntry.entryOf(new Zip('one.zip'), 'one.rom', 1, { crc32: '12345678' }),
      await File.fileOf('1.rom', 1, { crc32: '12345678' }), // duplicate
      await File.fileOf('two.a', 2, { crc32: 'abcdef90' }), // only 1/2 ROMs were found for the game
    ];

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithFourGames, files);

    // Then
    expect(parentsToCandidates.size).toEqual(3);
    const candidates = [...parentsToCandidates.values()];

    const candidateWithNoRoms = candidates[0];
    expect(candidateWithNoRoms).toHaveLength(1);
    candidateWithNoRoms.forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(0);
    });

    const candidateWithOneRom = candidates[1];
    expect(candidateWithOneRom).toHaveLength(3);
    candidateWithOneRom.forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(1);
      expect(candidate.getRomsWithFiles()[0].getInputFile())
        .not.toBeInstanceOf(ArchiveEntry); // preferred the non-archive
    });

    const candidateWithTwoRoms = candidates[2];
    expect(candidateWithTwoRoms).toHaveLength(0);
  });

  it('should return all candidates for all games that have all of their files matched', async () => {
    // Given
    const oneTwoThreeZip = new Zip('onetwothree.zip');
    const twoSevenZip = new SevenZip('two.7z');
    const files = [
      await File.fileOf('one.rom', 1, { crc32: '12345678' }),
      await ArchiveEntry.entryOf(oneTwoThreeZip, 'one.rom', 1, { crc32: '12345678' }),
      await ArchiveEntry.entryOf(oneTwoThreeZip, 'two.rom', 2, { crc32: 'abcdef90' }),
      await ArchiveEntry.entryOf(oneTwoThreeZip, 'three.rom', 4, { crc32: '34567890' }),
      await ArchiveEntry.entryOf(twoSevenZip, 'a.rom', 2, { crc32: 'abcdef90' }),
      await ArchiveEntry.entryOf(twoSevenZip, 'b.rom', 3, { crc32: '09876543' }),
    ];

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithFourGames, files);

    // Then
    expect(parentsToCandidates.size).toEqual(3);
    const candidates = [...parentsToCandidates.values()];

    const candidateWithNoRoms = candidates[0];
    expect(candidateWithNoRoms).toHaveLength(1);
    candidateWithNoRoms.forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(0);
    });

    const candidateWithOneRom = candidates[1];
    expect(candidateWithOneRom).toHaveLength(3);
    candidateWithOneRom.forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(1);
      expect(candidate.getRomsWithFiles()[0].getInputFile())
        .not.toBeInstanceOf(ArchiveEntry); // preferred the non-archive
    });

    const candidateWithTwoRoms = candidates[2];
    expect(candidateWithTwoRoms).toHaveLength(1);
    candidateWithTwoRoms.forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(2);
    });
  });
});

describe('with ROMs with headers', () => {
  const twoSevenZip = new SevenZip('two.7z');
  const filePromises = [
    // Extension doesn't change with header removal
    File.fileOf('one.rom', 1, { crc32: '12345678' }, undefined, ROMHeader.headerFromFilename('dummy.nes')),
    // Extension does change with header removal
    ArchiveEntry.entryOf(twoSevenZip, 'a.rom', 2, { crc32: 'abcdef90' }, undefined, ROMHeader.headerFromFilename('dummy.smc')),
    // Doesn't have a header
    ArchiveEntry.entryOf(twoSevenZip, 'b.rom', 3, { crc32: '09876543' }),
  ];

  it('zip', async () => {
    // Given
    const options = new Options({
      commands: ['copy', 'zip'],
      removeHeaders: [''], // all
    });

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithFourGames, filePromises);

    // Then
    expect(parentsToCandidates.size).toEqual(3);
    const candidates = [...parentsToCandidates.values()];

    const candidateWithOneRom = candidates[1];
    expect(candidateWithOneRom).toHaveLength(3);
    candidateWithOneRom.forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(1);
      const candidateWithOneRomOutput = candidate.getRomsWithFiles()[0]
        .getOutputFile() as ArchiveEntry<Zip>;
      expect(candidateWithOneRomOutput.getFilePath()).toEqual('game with one ROM and multiple releases.zip'); // respected DAT
      expect(candidateWithOneRomOutput.getEntryPath()).toEqual('one.nes'); // respected un-headered extension
    });

    const candidateWithTwoRoms = candidates[2];
    expect(candidateWithTwoRoms).toHaveLength(1);
    candidateWithTwoRoms.forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(2);
      const candidateWithTwoRomsOutputOne = candidate.getRomsWithFiles()[0]
        .getOutputFile() as ArchiveEntry<Zip>;
      expect(candidateWithTwoRomsOutputOne.getFilePath()).toEqual('game with two ROMs (parent).zip'); // respected DAT
      expect(candidateWithTwoRomsOutputOne.getEntryPath()).toEqual('two.sfc'); // respected un-headered extension
      const candidateWithTwoRomsOutputTwo = candidate.getRomsWithFiles()[1]
        .getOutputFile() as ArchiveEntry<Zip>;
      expect(candidateWithTwoRomsOutputTwo.getFilePath()).toEqual('game with two ROMs (parent).zip'); // respected DAT
      expect(candidateWithTwoRomsOutputTwo.getEntryPath()).toEqual('two.b'); // respected DAT
    });
  });

  it('extract', async () => {
    // Given
    const options = new Options({
      commands: ['copy', 'extract'],
      removeHeaders: [''], // all
    });

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithFourGames, filePromises);

    // Then
    expect(parentsToCandidates.size).toEqual(3);
    const candidates = [...parentsToCandidates.values()];

    const candidateWithOneRom = candidates[1];
    expect(candidateWithOneRom).toHaveLength(3);
    candidateWithOneRom.forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(1);
      expect(candidate.getRomsWithFiles()[0].getOutputFile().getFilePath()).toEqual('one.nes'); // respected un-headered extension
    });

    const candidateWithTwoRoms = candidates[2];
    expect(candidateWithTwoRoms).toHaveLength(1);
    candidateWithTwoRoms.forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(2);
      expect(candidate.getRomsWithFiles()[0].getOutputFile().getFilePath()).toEqual(path.join('game with two ROMs (parent)', 'two.sfc')); // respected un-headered extension
      expect(candidate.getRomsWithFiles()[1].getOutputFile().getFilePath()).toEqual(path.join('game with two ROMs (parent)', 'two.b')); // respected DAT
    });
  });

  it('raw', async () => {
    // Given
    const options = new Options({
      commands: ['copy'],
      removeHeaders: [''], // all
    });

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithFourGames, filePromises);

    // Then
    expect(parentsToCandidates.size).toEqual(3);
    const candidates = [...parentsToCandidates.values()];

    const candidateWithOneRom = candidates[1];
    expect(candidateWithOneRom).toHaveLength(3);
    candidateWithOneRom.forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(1);
      expect(candidate.getRomsWithFiles()[0].getOutputFile().getFilePath()).toEqual('one.nes'); // respected un-headered extension
    });

    const candidateWithTwoRoms = candidates[2];
    expect(candidateWithTwoRoms).toHaveLength(1);
    candidateWithTwoRoms.forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(2);
      const candidateWithTwoRomsOutputOne = candidate.getRomsWithFiles()[0].getOutputFile();
      expect(candidateWithTwoRomsOutputOne.getFilePath()).toEqual('game with two ROMs (parent).7z'); // respected DAT and input extension
      const candidateWithTwoRomsOutputTwo = candidate.getRomsWithFiles()[1].getOutputFile();
      expect(candidateWithTwoRomsOutputTwo.getFilePath()).toEqual('game with two ROMs (parent).7z'); // respected DAT and input extension
    });
  });
});

describe('with different input files for every game ROM', () => {
  const filePromises = [
    File.fileOf('one.rom', 1, { crc32: '12345678' }),
    ArchiveEntry.entryOf(new Tar('1.tar'), '1.rom', 1, { crc32: '12345678' }), // duplicate
    ArchiveEntry.entryOf(new Rar('a.7z'), 'a.rom', 2, { crc32: 'abcdef90' }),
    ArchiveEntry.entryOf(new Rar('b.7z'), 'b.rom', 3, { crc32: '09876543' }),
  ];

  test.each(['zip', 'extract'])('should generate candidates when all ROMs for a game are in different files: %s', async (command) => {
    // Given
    const options = new Options({ commands: ['copy', command] });

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithFourGames, filePromises);

    // Then there should still be 3 parents, with the input -> output:
    //  (nothing) -> game with no ROMs
    //  one.rom -> game with one ROM
    //  a.7z|a.rom & b.7z|b.rom -> game with two ROMs (either in a folder or a zip, together)
    expect(parentsToCandidates.size).toEqual(3);
    const candidates = [...parentsToCandidates.values()];

    expect(candidates[0]).toHaveLength(1);
    candidates[0].forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(0);
    });

    expect(candidates[1]).toHaveLength(3);
    candidates[1].forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(1);
    });

    expect(candidates[2]).toHaveLength(1);
    candidates[2].forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(2);
    });
  });

  it('should generate no candidate when multiple input archives need to raw write to the same output path', async () => {
    // Given
    const options = new Options({ commands: ['copy'] });

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithFourGames, filePromises);

    // Then there should still be 3 parents, with the input -> output:
    //  (nothing) -> game with no ROMs
    //  one.rom -> one.rom
    //  a.7z|a.rom & b.7z|b.rom -> game with two ROMs.7z -- CONFLICT!
    // Because we're not extracting or zipping, two different input 7z files wanted to write to the
    //  same output file, which is a problem, so the parent resulted in no candidates
    expect(parentsToCandidates.size).toEqual(3);
    const candidates = [...parentsToCandidates.values()];

    expect(candidates[0]).toHaveLength(1);
    candidates[0].forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(0);
    });

    expect(candidates[1]).toHaveLength(3);
    candidates[1].forEach((candidate) => {
      expect(candidate.getRomsWithFiles()).toHaveLength(1);
    });

    expect(candidates[2]).toHaveLength(0);
  });
});

describe.each(['copy', 'move'])('prefer input files from the same archive when raw writing: %s', (command) => {
  const options = new Options({ commands: [command] });

  it('should behave like normal with only one ROM', async () => {
    // Given
    const datGame = gameWithOneRom;
    expect(datGame.getRoms()).toHaveLength(1);
    const dat = new DAT(new Header(), [datGame]);

    // And every file is present, both raw and archived
    const rawFiles = await Promise.all(dat.getGames()
      .flatMap((game) => game.getRoms())
      .map(async (rom) => rom.toFile()));
    const archive = new Zip('archive.zip');
    const archiveEntries = await Promise.all(dat.getGames()
      .flatMap((game) => game.getRoms())
      .map(async (rom) => rom.toArchiveEntry(archive)));
    const files = [
      ...rawFiles,
      ...archiveEntries,
    ];

    // When
    const parentsToCandidates = await candidateGenerator(options, dat, files);

    // Then the Archive isn't used for any input file
    expect(parentsToCandidates.size).toEqual(1);
    const candidates = [...parentsToCandidates.values()];
    expect(candidates[0]).toHaveLength(Math.max(datGame.getReleases().length, 1));

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i][0];
      const romsWithFiles = candidate.getRomsWithFiles();
      expect(romsWithFiles).toHaveLength(datGame.getRoms().length);

      for (let j = 0; j < romsWithFiles.length; j += 1) {
        const inputFile = romsWithFiles[j].getInputFile();
        expect(inputFile.getFilePath()).toEqual(datGame.getRoms()[j].getName());
      }
    }
  });

  describe.each([
    gameWithTwoRomsParent,
    gameWithTwoRomsClone,
    gameWithDuplicateRoms,
  ])('game: %s', (datGame) => {
    const dat = new DAT(new Header(), [datGame]);

    it('should behave like normal with no archives', async () => {
      // Given every file is present, raw
      const rawFiles = await Promise.all(dat.getGames()
        .flatMap((game) => game.getRoms())
        .map(async (rom) => rom.toFile()));

      // When
      const parentsToCandidates = await candidateGenerator(options, dat, rawFiles);

      // Then the Archive isn't used for any input file
      expect(parentsToCandidates.size).toEqual(1);
      const candidates = [...parentsToCandidates.values()];
      expect(candidates[0]).toHaveLength(Math.max(datGame.getReleases().length, 1));

      for (let i = 0; i < candidates.length; i += 1) {
        const candidate = candidates[i][0];
        const romsWithFiles = candidate.getRomsWithFiles();
        expect(romsWithFiles).toHaveLength(datGame.getRoms().length);

        for (let j = 0; j < romsWithFiles.length; j += 1) {
          const inputFile = romsWithFiles[j].getInputFile();
          expect(inputFile.getFilePath()).toEqual(datGame.getRoms()[j].getName());
        }
      }
    });

    it('should prefer input files from the same archive if it contains exactly every ROM', async () => {
      // Given every file is present, both raw and archived
      const rawFiles = await Promise.all(dat.getGames()
        .flatMap((game) => game.getRoms())
        .map(async (rom) => rom.toFile()));
      const archive = new Zip('archive.zip');
      const archiveEntries = await Promise.all(dat.getGames()
        .flatMap((game) => game.getRoms())
        .map(async (rom) => rom.toArchiveEntry(archive)));
      const files = [
        ...rawFiles,
        ...archiveEntries,
      ];

      // When
      const parentsToCandidates = await candidateGenerator(options, dat, files);

      // Then the Archive is used for every input file
      expect(parentsToCandidates.size).toEqual(1);
      const candidates = [...parentsToCandidates.values()];
      expect(candidates[0]).toHaveLength(Math.max(datGame.getReleases().length, 1));

      for (let i = 0; i < candidates.length; i += 1) {
        const candidate = candidates[i][0];
        const romsWithFiles = candidate.getRomsWithFiles();
        expect(romsWithFiles).toHaveLength(datGame.getRoms().length);

        for (let j = 0; j < romsWithFiles.length; j += 1) {
          const inputFile = romsWithFiles[j].getInputFile();
          expect(inputFile.getFilePath()).toEqual(archive.getFilePath());
        }
      }
    });

    it('should still prefer input archives that contain extra junk files', async () => {
      // Given every file is present, both raw and archived, plus extra ArchiveEntries
      const rawFiles = await Promise.all(dat.getGames()
        .flatMap((game) => game.getRoms())
        .map(async (rom) => rom.toFile()));
      const archive = new Zip('archive.zip');
      const archiveEntries = await Promise.all(dat.getGames()
        .flatMap((game) => game.getRoms())
        .map(async (rom) => rom.toArchiveEntry(archive)));
      const files = [
        ...rawFiles,
        ...archiveEntries,
        await ArchiveEntry.entryOf(archive, 'junk.rom', 999, { crc32: '55555555' }),
      ];

      // When
      const parentsToCandidates = await candidateGenerator(options, dat, files);

      // Then the Archive is used for every input file
      expect(parentsToCandidates.size).toEqual(1);
      const candidates = [...parentsToCandidates.values()];
      expect(candidates[0]).toHaveLength(Math.max(datGame.getReleases().length, 1));

      for (let i = 0; i < candidates.length; i += 1) {
        const candidate = candidates[i][0];
        const romsWithFiles = candidate.getRomsWithFiles();
        expect(romsWithFiles).toHaveLength(datGame.getRoms().length);

        for (let j = 0; j < romsWithFiles.length; j += 1) {
          const inputFile = romsWithFiles[j].getInputFile();
          expect(inputFile.getFilePath()).toEqual(archive.getFilePath());
        }
      }
    });
  });
});
