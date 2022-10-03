import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import Zip from '../../src/types/archives/zip.js';
import ArchiveEntry from '../../src/types/files/archiveEntry.js';
import File from '../../src/types/files/file.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import Release from '../../src/types/logiqx/release.js';
import ROM from '../../src/types/logiqx/rom.js';
import ProgressBarFake from '../console/progressBarFake.js';

const candidateGenerator = new CandidateGenerator(new ProgressBarFake());

function buildRomMap(files: File[]): Map<string, File> {
  return files.reduce((map, file) => {
    file.hashCodes().forEach((hashCode) => map.set(hashCode, file));
    return map;
  }, new Map<string, File>());
}

it('should return no results with no games in DAT', async () => {
  const dat = new DAT(new Header(), []);
  const fileOne = await File.fileOf('foo', 0, '00000000');
  const fileTwo = await ArchiveEntry.entryOf(new Zip('fizz'), 'buzz', 0, 'ffffffff');

  await expect(candidateGenerator.generate(dat, new Map())).resolves.toHaveProperty('size', 0);
  await expect(candidateGenerator.generate(dat, buildRomMap([fileOne]))).resolves.toHaveProperty('size', 0);
  await expect(candidateGenerator.generate(dat, buildRomMap([fileOne, fileOne]))).resolves.toHaveProperty('size', 0);
  await expect(candidateGenerator.generate(dat, buildRomMap([fileOne, fileTwo]))).resolves.toHaveProperty('size', 0);
});

it('should return no results with no input ROM files', async () => {
  const game = new Game({ name: 'game' });
  const datWithNoGames = new DAT(new Header(), []);
  const datWithOneGame = new DAT(new Header(), [game]);
  const datWithTwoGames = new DAT(new Header(), [game, game]);

  await expect(candidateGenerator.generate(datWithNoGames, new Map())).resolves.toHaveProperty('size', 0);
  await expect(candidateGenerator.generate(datWithOneGame, new Map())).resolves.toHaveProperty('size', 0);
  await expect(candidateGenerator.generate(datWithTwoGames, new Map())).resolves.toHaveProperty('size', 0);
});

it('should return no results with no matching files', async () => {
  const gameOne = new Game({ name: 'one', rom: [new ROM('one.rom', 0, '12345678')] });
  const gameTwo = new Game({
    name: 'two',
    rom: [
      new ROM('two.a', 0, 'abcdef90'),
      new ROM('two.b', 0, '09876543'),
    ],
  });

  const datWithOneGame = new DAT(new Header(), [gameOne]);
  const datWithDuplicateGames = new DAT(new Header(), [gameOne, gameOne]);
  const datWithTwoGames = new DAT(new Header(), [gameOne, gameTwo]);

  const fileOne = await File.fileOf('one.rom', 0, '34567890');
  const fileTwo = await File.fileOf('two.a', 0, 'abcd1234');
  const fileThree = await ArchiveEntry.entryOf(new Zip('three.zip'), 'three.b', 0, '4321fedc');

  const expectCandidates = async (dat: DAT, inputRomFiles: File[]): Promise<void> => {
    // The DAT definitely has some parents
    expect(dat.getParents().length).toBeGreaterThan(0);

    // The number of parents returned equals the number of parents in the input
    const candidates = await candidateGenerator.generate(dat, buildRomMap(inputRomFiles));
    expect(candidates.size).toEqual(dat.getParents().length);

    // No parent had any release candidates
    expect([...candidates.values()].flatMap((c) => c)).toEqual([]);
  };

  await expectCandidates(datWithOneGame, [fileOne]);
  await expectCandidates(datWithOneGame, [fileTwo]);
  await expectCandidates(datWithOneGame, [fileOne, fileOne]);
  await expectCandidates(datWithOneGame, [fileOne, fileTwo]);
  await expectCandidates(datWithOneGame, [fileOne, fileTwo, fileThree]);

  await expectCandidates(datWithDuplicateGames, [fileOne]);
  await expectCandidates(datWithDuplicateGames, [fileTwo]);
  await expectCandidates(datWithDuplicateGames, [fileOne, fileOne]);
  await expectCandidates(datWithDuplicateGames, [fileOne, fileTwo]);
  await expectCandidates(datWithDuplicateGames, [fileOne, fileTwo, fileThree]);

  await expectCandidates(datWithTwoGames, [fileOne]);
  await expectCandidates(datWithTwoGames, [fileTwo]);
  await expectCandidates(datWithTwoGames, [fileOne, fileOne]);
  await expectCandidates(datWithTwoGames, [fileOne, fileTwo]);
  await expectCandidates(datWithTwoGames, [fileOne, fileTwo, fileThree]);
});

it('should return no results with partially matching files', async () => {
  const gameOne = new Game({
    name: 'game one',
    rom: [
      new ROM('one.a', 0, '12345678'),
      new ROM('one.b', 0, '34567890'),
      new ROM('one.c', 0, '5678abcd'),
    ],
  });
  const gameTwo = new Game({
    name: 'game two',
    rom: [
      new ROM('two.a', 0, 'abcdef90'),
      new ROM('two.b', 0, '09876543'),
    ],
    release: [
      new Release('game two (USA)', 'USA', 'EN'),
    ],
  });

  const datWithOneGame = new DAT(new Header(), [gameOne]);
  const datWithDuplicateGames = new DAT(new Header(), [gameOne, gameOne]);
  const datWithTwoGames = new DAT(new Header(), [gameOne, gameTwo]);

  const fileOne = await File.fileOf('one.a', 0, '12345678');
  const fileTwo = await File.fileOf('two.b', 0, '09876543');

  const expectCandidates = async (dat: DAT, inputRomFiles: File[]): Promise<void> => {
    // The DAT definitely has some parents
    expect(dat.getParents().length).toBeGreaterThan(0);

    // The number of parents returned equals the number of parents in the input
    const candidates = await candidateGenerator.generate(dat, buildRomMap(inputRomFiles));
    expect(candidates.size).toEqual(dat.getParents().length);

    // No parent had any release candidates
    expect([...candidates.values()].flatMap((c) => c)).toEqual([]);
  };

  await expectCandidates(datWithOneGame, [fileOne]);
  await expectCandidates(datWithOneGame, [fileTwo]);
  await expectCandidates(datWithOneGame, [fileOne, fileOne]);
  await expectCandidates(datWithOneGame, [fileOne, fileTwo]);

  await expectCandidates(datWithDuplicateGames, [fileOne]);
  await expectCandidates(datWithDuplicateGames, [fileTwo]);
  await expectCandidates(datWithDuplicateGames, [fileOne, fileOne]);
  await expectCandidates(datWithDuplicateGames, [fileOne, fileTwo]);

  await expectCandidates(datWithTwoGames, [fileOne]);
  await expectCandidates(datWithTwoGames, [fileTwo]);
  await expectCandidates(datWithTwoGames, [fileOne, fileOne]);
  await expectCandidates(datWithTwoGames, [fileOne, fileTwo]);
});

it('should return some results with some matching files', async () => {
  const gameOne = new Game({ name: 'one', rom: [new ROM('one.rom', 0, '12345678')] });
  const gameTwo = new Game({
    name: 'two',
    rom: [
      new ROM('two.a', 0, 'abcdef90'),
      new ROM('two.b', 0, '09876543'),
    ],
  });

  const datWithOneGame = new DAT(new Header(), [gameOne]);
  const datWithDuplicateGames = new DAT(new Header(), [gameOne, gameOne]);
  const datWithTwoGames = new DAT(new Header(), [gameOne, gameTwo]);

  const fileOne = await File.fileOf('one.rom', 0, '12345678');
  const fileTwo = await ArchiveEntry.entryOf(new Zip('three.zip'), 'three.b', 0, '4321fedc');

  const expectCandidates = async (dat: DAT, inputRomFiles: File[]): Promise<void> => {
    // The DAT definitely has some parents
    expect(dat.getParents().length).toBeGreaterThan(0);

    // The number of parents returned equals the number of parents in the input
    const candidates = await candidateGenerator.generate(dat, buildRomMap(inputRomFiles));
    expect(candidates.size).toEqual(dat.getParents().length);

    // No parent had any release candidates
    expect([...candidates.values()].flatMap((c) => c)).toHaveLength(1);
  };

  await expectCandidates(datWithOneGame, [fileOne]);
  await expectCandidates(datWithOneGame, [fileOne, fileOne]);
  await expectCandidates(datWithOneGame, [fileOne, fileTwo]);

  await expectCandidates(datWithDuplicateGames, [fileOne]);
  await expectCandidates(datWithDuplicateGames, [fileOne, fileOne]);
  await expectCandidates(datWithDuplicateGames, [fileOne, fileTwo]);

  await expectCandidates(datWithTwoGames, [fileOne]);
  await expectCandidates(datWithTwoGames, [fileOne, fileOne]);
  await expectCandidates(datWithTwoGames, [fileOne, fileTwo]);
});

it('should return all results with all matching files', async () => {
  const gameOne = new Game({ name: 'one', rom: [new ROM('one.rom', 0, '12345678')] });
  const gameTwo = new Game({
    name: 'two',
    rom: [
      new ROM('two.a', 0, 'abcdef90'),
      new ROM('two.b', 0, '09876543'),
    ],
  });

  const datWithGameOne = new DAT(new Header(), [gameOne]);
  const datWithGameOneTwice = new DAT(new Header(), [gameOne, gameOne]);
  const datWithGameTwo = new DAT(new Header(), [gameTwo]);

  const fileOne = await File.fileOf('one.rom', 0, '12345678');
  const fileTwo = await ArchiveEntry.entryOf(new Zip('two.zip'), 'two.a', 0, 'abcdef90');
  const fileThree = await ArchiveEntry.entryOf(new Zip('two.zip'), 'two.b', 0, '09876543');

  const expectCandidates = async (dat: DAT, inputRomFiles: File[]): Promise<void> => {
    // The DAT definitely has some parents
    expect(dat.getParents().length).toBeGreaterThan(0);

    // The number of parents returned equals the number of parents in the input
    const candidates = await candidateGenerator.generate(dat, buildRomMap(inputRomFiles));
    expect(candidates.size).toEqual(dat.getParents().length);

    // No parent had any release candidates
    expect([...candidates.values()].flatMap((c) => c)).toHaveLength(1);
  };

  await expectCandidates(datWithGameOne, [fileOne]);
  await expectCandidates(datWithGameOne, [fileOne, fileOne]);

  await expectCandidates(datWithGameOneTwice, [fileOne]);
  await expectCandidates(datWithGameOneTwice, [fileOne, fileOne]);

  await expectCandidates(datWithGameTwo, [fileTwo, fileThree]);
  await expectCandidates(datWithGameTwo, [fileTwo, fileThree, fileThree]);
});
