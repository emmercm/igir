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

// TODO(cemmer): test parent/clone behavior
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
const gameWithTwoRoms = new Game({
  name: 'game with two ROMs',
  release: new Release('game with two ROMs', 'WORLD'),
  rom: [
    new ROM('two.a', 2, 'abcdef90'),
    new ROM('two.b', 3, '09876543'),
  ],
});
const datWithThreeGames = new DAT(new Header(), [gameWithNoRoms, gameWithOneRom, gameWithTwoRoms]);

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
    [File.fileOf('three.rom', 4, '34567890')],
    // Doesn't match size
    [File.fileOf('one.rom', 999999, '12345678')],
    // Doesn't match CRC
    [File.fileOf('one.rom', 1, '00000000')],
    // Matches one ROM of a game with multiple ROMs
    [File.fileOf('two.a', 2, 'abcdef90')],
  ])('should only return candidates of games with no ROMs when no game has all of its files matched: %#', async (...filePromises) => {
    // Given
    const files = await Promise.all(filePromises);

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithThreeGames, files);

    // Then
    expect(parentsToCandidates.size).toEqual(3);
    const candidates = [...parentsToCandidates.values()].flatMap((c) => c);
    expect(candidates).toHaveLength(1);
    const candidateWithNoRoms = candidates[0];
    expect(candidateWithNoRoms.getRomsWithFiles()).toHaveLength(0);
  });

  it('should return some candidates for some games that have all of their files matched: %#', async () => {
    // Given
    const files = [
      await ArchiveEntry.entryOf(new Zip('one.zip'), 'one.rom', 1, '12345678'),
      await File.fileOf('1.rom', 1, '12345678'), // duplicate
      await File.fileOf('two.a', 2, 'abcdef90'), // only 1/2 ROMs were found for the game
    ];

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithThreeGames, files);

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

  it('should return all candidates for all games that have all of their files matched: %#', async () => {
    // Given
    const files = [
      await File.fileOf('one.rom', 1, '12345678'),
      await ArchiveEntry.entryOf(new Zip('onetwothree.zip'), 'one.rom', 1, '12345678'),
      await ArchiveEntry.entryOf(new Zip('onetwothree.zip'), 'two.rom', 2, 'abcdef90'),
      await ArchiveEntry.entryOf(new Zip('onetwothree.zip'), 'three.rom', 4, '34567890'),
      await ArchiveEntry.entryOf(new SevenZip('two.7z'), 'a.rom', 2, 'abcdef90'),
      await ArchiveEntry.entryOf(new SevenZip('two.7z'), 'b.rom', 3, '09876543'),
    ];

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithThreeGames, files);

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
  const filePromises = [
    // Extension doesn't change with header removal
    File.fileOf('one.rom', 1, '12345678', ROMHeader.headerFromFilename('dummy.nes')),
    // Extension does change with header removal
    ArchiveEntry.entryOf(new SevenZip('two.7z'), 'a.rom', 2, 'abcdef90', ROMHeader.headerFromFilename('dummy.smc')),
    // Doesn't have a header
    ArchiveEntry.entryOf(new SevenZip('two.7z'), 'b.rom', 3, '09876543'),
  ];

  test('zip', async () => {
    // Given
    const options = new Options({
      commands: ['copy', 'zip'],
      removeHeaders: [''], // all
    });

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithThreeGames, filePromises);

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
      expect(candidateWithTwoRomsOutputOne.getFilePath()).toEqual('game with two ROMs.zip'); // respected DAT
      expect(candidateWithTwoRomsOutputOne.getEntryPath()).toEqual('two.sfc'); // respected un-headered extension
      const candidateWithTwoRomsOutputTwo = candidate.getRomsWithFiles()[1]
        .getOutputFile() as ArchiveEntry<Zip>;
      expect(candidateWithTwoRomsOutputTwo.getFilePath()).toEqual('game with two ROMs.zip'); // respected DAT
      expect(candidateWithTwoRomsOutputTwo.getEntryPath()).toEqual('two.b'); // respected DAT
    });
  });

  test('extract', async () => {
    // Given
    const options = new Options({
      commands: ['copy', 'extract'],
      removeHeaders: [''], // all
    });

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithThreeGames, filePromises);

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
      expect(candidate.getRomsWithFiles()[0].getOutputFile().getFilePath()).toEqual(path.join('game with two ROMs', 'two.sfc')); // respected un-headered extension
      expect(candidate.getRomsWithFiles()[1].getOutputFile().getFilePath()).toEqual(path.join('game with two ROMs', 'two.b')); // respected DAT
    });
  });

  test('raw', async () => {
    // Given
    const options = new Options({
      commands: ['copy'],
      removeHeaders: [''], // all
    });

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithThreeGames, filePromises);

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
      expect(candidateWithTwoRomsOutputOne.getFilePath()).toEqual('game with two ROMs.7z'); // respected DAT and input extension
      const candidateWithTwoRomsOutputTwo = candidate.getRomsWithFiles()[1].getOutputFile();
      expect(candidateWithTwoRomsOutputTwo.getFilePath()).toEqual('game with two ROMs.7z'); // respected DAT and input extension
    });
  });
});

describe('with different input files for every game ROM', () => {
  const filePromises = [
    File.fileOf('one.rom', 1, '12345678'),
    ArchiveEntry.entryOf(new Tar('1.tar'), '1.rom', 1, '12345678'), // duplicate
    ArchiveEntry.entryOf(new Rar('a.7z'), 'a.rom', 2, 'abcdef90'),
    ArchiveEntry.entryOf(new Rar('b.7z'), 'b.rom', 3, '09876543'),
  ];

  test.each(['zip', 'extract'])('%s', async (command) => {
    // Given
    const options = new Options({ commands: ['copy', command] });

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithThreeGames, filePromises);

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

  test('raw', async () => {
    // Given
    const options = new Options({ commands: ['copy'] });

    // When
    const parentsToCandidates = await candidateGenerator(options, datWithThreeGames, filePromises);

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
