import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import Release from '../../src/types/logiqx/release.js';
import ROM from '../../src/types/logiqx/rom.js';
import ROMFile from '../../src/types/romFile.js';
import ProgressBarFake from './progressBar/progressBarFake.js';

describe('CandidateGenerator', () => {
  const candidateGenerator = new CandidateGenerator(new ProgressBarFake());

  it('should return no results with no games in DAT', async () => {
    const dat = new DAT(new Header(), []);
    const romFileOne = new ROMFile('foo', undefined, '00000000');
    const romFileTwo = new ROMFile('fizz', 'buzz', 'ffffffff');

    await expect(candidateGenerator.generate(dat, [])).resolves.toHaveProperty('size', 0);
    await expect(candidateGenerator.generate(dat, [romFileOne])).resolves.toHaveProperty('size', 0);
    await expect(candidateGenerator.generate(dat, [romFileOne, romFileOne])).resolves.toHaveProperty('size', 0);
    await expect(candidateGenerator.generate(dat, [romFileOne, romFileTwo])).resolves.toHaveProperty('size', 0);
  });

  it('should return no results with no input ROM files', async () => {
    const game = new Game('game', []);
    const datWithNoGames = new DAT(new Header(), []);
    const datWithOneGame = new DAT(new Header(), [game]);
    const datWithTwoGames = new DAT(new Header(), [game, game]);

    await expect(candidateGenerator.generate(datWithNoGames, [])).resolves.toHaveProperty('size', 0);
    await expect(candidateGenerator.generate(datWithOneGame, [])).resolves.toHaveProperty('size', 0);
    await expect(candidateGenerator.generate(datWithTwoGames, [])).resolves.toHaveProperty('size', 0);
  });

  it('should return no results with no matching files', async () => {
    const gameOne = new Game('one', [new ROM('one.rom', '12345678')]);
    const gameTwo = new Game('two', [
      new ROM('two.a', 'abcdef90'),
      new ROM('two.b', '09876543'),
    ]);

    const datWithOneGame = new DAT(new Header(), [gameOne]);
    const datWithDuplicateGames = new DAT(new Header(), [gameOne, gameOne]);
    const datWithTwoGames = new DAT(new Header(), [gameOne, gameTwo]);

    const romFileOne = new ROMFile('one.rom', undefined, '34567890');
    const romFileTwo = new ROMFile('two.a', undefined, 'abcd1234');
    const romFileThree = new ROMFile('three.zip', 'three.b', '4321fedc');

    const expectCandidates = async (dat: DAT, inputRomFiles: ROMFile[]) => {
      // The DAT definitely has some parents
      expect(dat.getParents().length).toBeGreaterThan(0);

      // The number of parents returned equals the number of parents in the input
      const candidates = await candidateGenerator.generate(dat, inputRomFiles);
      expect(candidates.size).toEqual(dat.getParents().length);

      // No parent had any release candidates
      expect([...candidates.values()].flatMap((c) => c)).toHaveLength(0);
    };

    await expectCandidates(datWithOneGame, [romFileOne]);
    await expectCandidates(datWithOneGame, [romFileTwo]);
    await expectCandidates(datWithOneGame, [romFileOne, romFileOne]);
    await expectCandidates(datWithOneGame, [romFileOne, romFileTwo]);
    await expectCandidates(datWithOneGame, [romFileOne, romFileTwo, romFileThree]);

    await expectCandidates(datWithDuplicateGames, [romFileOne]);
    await expectCandidates(datWithDuplicateGames, [romFileTwo]);
    await expectCandidates(datWithDuplicateGames, [romFileOne, romFileOne]);
    await expectCandidates(datWithDuplicateGames, [romFileOne, romFileTwo]);
    await expectCandidates(datWithDuplicateGames, [romFileOne, romFileTwo, romFileThree]);

    await expectCandidates(datWithTwoGames, [romFileOne]);
    await expectCandidates(datWithTwoGames, [romFileTwo]);
    await expectCandidates(datWithTwoGames, [romFileOne, romFileOne]);
    await expectCandidates(datWithTwoGames, [romFileOne, romFileTwo]);
    await expectCandidates(datWithTwoGames, [romFileOne, romFileTwo, romFileThree]);
  });

  it('should return no results with partially matching files', async () => {
    const gameOne = new Game('game one', [
      new ROM('one.a', '12345678'),
      new ROM('one.b', '34567890'),
      new ROM('one.c', '5678abcd'),
    ]);
    const gameTwo = new Game('game two', [
      new ROM('two.a', 'abcdef90'),
      new ROM('two.b', '09876543'),
    ], [
      new Release('game two (USA)', 'USA'),
    ]);

    const datWithOneGame = new DAT(new Header(), [gameOne]);
    const datWithDuplicateGames = new DAT(new Header(), [gameOne, gameOne]);
    const datWithTwoGames = new DAT(new Header(), [gameOne, gameTwo]);

    const romFileOne = new ROMFile('one.a', undefined, '12345678');
    const romFileTwo = new ROMFile('two.b', undefined, '09876543');

    const expectCandidates = async (dat: DAT, inputRomFiles: ROMFile[]) => {
      // The DAT definitely has some parents
      expect(dat.getParents().length).toBeGreaterThan(0);

      // The number of parents returned equals the number of parents in the input
      const candidates = await candidateGenerator.generate(dat, inputRomFiles);
      expect(candidates.size).toEqual(dat.getParents().length);

      // No parent had any release candidates
      expect([...candidates.values()].flatMap((c) => c)).toHaveLength(0);
    };

    await expectCandidates(datWithOneGame, [romFileOne]);
    await expectCandidates(datWithOneGame, [romFileTwo]);
    await expectCandidates(datWithOneGame, [romFileOne, romFileOne]);
    await expectCandidates(datWithOneGame, [romFileOne, romFileTwo]);

    await expectCandidates(datWithDuplicateGames, [romFileOne]);
    await expectCandidates(datWithDuplicateGames, [romFileTwo]);
    await expectCandidates(datWithDuplicateGames, [romFileOne, romFileOne]);
    await expectCandidates(datWithDuplicateGames, [romFileOne, romFileTwo]);

    await expectCandidates(datWithTwoGames, [romFileOne]);
    await expectCandidates(datWithTwoGames, [romFileTwo]);
    await expectCandidates(datWithTwoGames, [romFileOne, romFileOne]);
    await expectCandidates(datWithTwoGames, [romFileOne, romFileTwo]);
  });

  it('should return some results with some matching files', async () => {
    const gameOne = new Game('one', [new ROM('one.rom', '12345678')]);
    const gameTwo = new Game('two', [
      new ROM('two.a', 'abcdef90'),
      new ROM('two.b', '09876543'),
    ]);

    const datWithOneGame = new DAT(new Header(), [gameOne]);
    const datWithDuplicateGames = new DAT(new Header(), [gameOne, gameOne]);
    const datWithTwoGames = new DAT(new Header(), [gameOne, gameTwo]);

    const romFileOne = new ROMFile('one.rom', undefined, '12345678');
    const romFileTwo = new ROMFile('three.zip', 'three.b', '4321fedc');

    const expectCandidates = async (dat: DAT, inputRomFiles: ROMFile[]) => {
      // The DAT definitely has some parents
      expect(dat.getParents().length).toBeGreaterThan(0);

      // The number of parents returned equals the number of parents in the input
      const candidates = await candidateGenerator.generate(dat, inputRomFiles);
      expect(candidates.size).toEqual(dat.getParents().length);

      // No parent had any release candidates
      expect([...candidates.values()].flatMap((c) => c)).toHaveLength(1);
    };

    await expectCandidates(datWithOneGame, [romFileOne]);
    await expectCandidates(datWithOneGame, [romFileOne, romFileOne]);
    await expectCandidates(datWithOneGame, [romFileOne, romFileTwo]);

    await expectCandidates(datWithDuplicateGames, [romFileOne]);
    await expectCandidates(datWithDuplicateGames, [romFileOne, romFileOne]);
    await expectCandidates(datWithDuplicateGames, [romFileOne, romFileTwo]);

    await expectCandidates(datWithTwoGames, [romFileOne]);
    await expectCandidates(datWithTwoGames, [romFileOne, romFileOne]);
    await expectCandidates(datWithTwoGames, [romFileOne, romFileTwo]);
  });

  it('should return all results with all matching files', async () => {
    const gameOne = new Game('one', [new ROM('one.rom', '12345678')]);
    const gameTwo = new Game('two', [
      new ROM('two.a', 'abcdef90'),
      new ROM('two.b', '09876543'),
    ]);

    const datWithGameOne = new DAT(new Header(), [gameOne]);
    const datWithGameOneTwice = new DAT(new Header(), [gameOne, gameOne]);
    const datWithGameTwo = new DAT(new Header(), [gameTwo]);

    const romFileOne = new ROMFile('one.rom', undefined, '12345678');
    const romFileTwo = new ROMFile('two.zip', 'two.a', 'abcdef90');
    const romFileThree = new ROMFile('two.zip', 'two.b', '09876543');

    const expectCandidates = async (dat: DAT, inputRomFiles: ROMFile[]) => {
      // The DAT definitely has some parents
      expect(dat.getParents().length).toBeGreaterThan(0);

      // The number of parents returned equals the number of parents in the input
      const candidates = await candidateGenerator.generate(dat, inputRomFiles);
      expect(candidates.size).toEqual(dat.getParents().length);

      // No parent had any release candidates
      expect([...candidates.values()].flatMap((c) => c)).toHaveLength(1);
    };

    await expectCandidates(datWithGameOne, [romFileOne]);
    await expectCandidates(datWithGameOne, [romFileOne, romFileOne]);

    await expectCandidates(datWithGameOneTwice, [romFileOne]);
    await expectCandidates(datWithGameOneTwice, [romFileOne, romFileOne]);

    await expectCandidates(datWithGameTwo, [romFileTwo, romFileThree]);
    await expectCandidates(datWithGameTwo, [romFileTwo, romFileThree, romFileThree]);
  });
});
