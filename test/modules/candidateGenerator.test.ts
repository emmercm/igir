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

it('should return no results with no games in DAT', async () => {
  const dat = new DAT(new Header(), []);
  const fileOne = new File('foo', '00000000');
  const fileTwo = new ArchiveEntry(new Zip('fizz'), 'buzz', 'ffffffff');

  await expect(candidateGenerator.generate(dat, [])).resolves.toHaveProperty('size', 0);
  await expect(candidateGenerator.generate(dat, [fileOne])).resolves.toHaveProperty('size', 0);
  await expect(candidateGenerator.generate(dat, [fileOne, fileOne])).resolves.toHaveProperty('size', 0);
  await expect(candidateGenerator.generate(dat, [fileOne, fileTwo])).resolves.toHaveProperty('size', 0);
});

it('should return no results with no input ROM files', async () => {
  const game = new Game({ name: 'game' });
  const datWithNoGames = new DAT(new Header(), []);
  const datWithOneGame = new DAT(new Header(), [game]);
  const datWithTwoGames = new DAT(new Header(), [game, game]);

  await expect(candidateGenerator.generate(datWithNoGames, [])).resolves.toHaveProperty('size', 0);
  await expect(candidateGenerator.generate(datWithOneGame, [])).resolves.toHaveProperty('size', 0);
  await expect(candidateGenerator.generate(datWithTwoGames, [])).resolves.toHaveProperty('size', 0);
});

it('should return no results with no matching files', async () => {
  const gameOne = new Game({ name: 'one', rom: [new ROM('one.rom', '12345678')] });
  const gameTwo = new Game({
    name: 'two',
    rom: [
      new ROM('two.a', 'abcdef90'),
      new ROM('two.b', '09876543'),
    ],
  });

  const datWithOneGame = new DAT(new Header(), [gameOne]);
  const datWithDuplicateGames = new DAT(new Header(), [gameOne, gameOne]);
  const datWithTwoGames = new DAT(new Header(), [gameOne, gameTwo]);

  const fileOne = new File('one.rom', '34567890');
  const fileTwo = new File('two.a', 'abcd1234');
  const fileThree = new ArchiveEntry(new Zip('three.zip'), 'three.b', '4321fedc');

  const expectCandidates = async (dat: DAT, inputRomFiles: File[]): Promise<void> => {
    // The DAT definitely has some parents
    expect(dat.getParents().length).toBeGreaterThan(0);

    // The number of parents returned equals the number of parents in the input
    const candidates = await candidateGenerator.generate(dat, inputRomFiles);
    expect(candidates.size).toEqual(dat.getParents().length);

    // No parent had any release candidates
    expect([...candidates.values()].flatMap((c) => c)).toHaveLength(0);
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
      new ROM('one.a', '12345678'),
      new ROM('one.b', '34567890'),
      new ROM('one.c', '5678abcd'),
    ],
  });
  const gameTwo = new Game({
    name: 'game two',
    rom: [
      new ROM('two.a', 'abcdef90'),
      new ROM('two.b', '09876543'),
    ],
    release: [
      new Release('game two (USA)', 'USA', 'EN'),
    ],
  });

  const datWithOneGame = new DAT(new Header(), [gameOne]);
  const datWithDuplicateGames = new DAT(new Header(), [gameOne, gameOne]);
  const datWithTwoGames = new DAT(new Header(), [gameOne, gameTwo]);

  const fileOne = new File('one.a', '12345678');
  const fileTwo = new File('two.b', '09876543');

  const expectCandidates = async (dat: DAT, inputRomFiles: File[]): Promise<void> => {
    // The DAT definitely has some parents
    expect(dat.getParents().length).toBeGreaterThan(0);

    // The number of parents returned equals the number of parents in the input
    const candidates = await candidateGenerator.generate(dat, inputRomFiles);
    expect(candidates.size).toEqual(dat.getParents().length);

    // No parent had any release candidates
    expect([...candidates.values()].flatMap((c) => c)).toHaveLength(0);
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
  const gameOne = new Game({ name: 'one', rom: [new ROM('one.rom', '12345678')] });
  const gameTwo = new Game({
    name: 'two',
    rom: [
      new ROM('two.a', 'abcdef90'),
      new ROM('two.b', '09876543'),
    ],
  });

  const datWithOneGame = new DAT(new Header(), [gameOne]);
  const datWithDuplicateGames = new DAT(new Header(), [gameOne, gameOne]);
  const datWithTwoGames = new DAT(new Header(), [gameOne, gameTwo]);

  const fileOne = new File('one.rom', '12345678');
  const fileTwo = new ArchiveEntry(new Zip('three.zip'), 'three.b', '4321fedc');

  const expectCandidates = async (dat: DAT, inputRomFiles: File[]): Promise<void> => {
    // The DAT definitely has some parents
    expect(dat.getParents().length).toBeGreaterThan(0);

    // The number of parents returned equals the number of parents in the input
    const candidates = await candidateGenerator.generate(dat, inputRomFiles);
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
  const gameOne = new Game({ name: 'one', rom: [new ROM('one.rom', '12345678')] });
  const gameTwo = new Game({
    name: 'two',
    rom: [
      new ROM('two.a', 'abcdef90'),
      new ROM('two.b', '09876543'),
    ],
  });

  const datWithGameOne = new DAT(new Header(), [gameOne]);
  const datWithGameOneTwice = new DAT(new Header(), [gameOne, gameOne]);
  const datWithGameTwo = new DAT(new Header(), [gameTwo]);

  const fileOne = new File('one.rom', '12345678');
  const fileTwo = new ArchiveEntry(new Zip('two.zip'), 'two.a', 'abcdef90');
  const fileThree = new ArchiveEntry(new Zip('two.zip'), 'two.b', '09876543');

  const expectCandidates = async (dat: DAT, inputRomFiles: File[]): Promise<void> => {
    // The DAT definitely has some parents
    expect(dat.getParents().length).toBeGreaterThan(0);

    // The number of parents returned equals the number of parents in the input
    const candidates = await candidateGenerator.generate(dat, inputRomFiles);
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
