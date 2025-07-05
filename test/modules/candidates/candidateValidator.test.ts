import CandidateValidator from '../../../src/modules/candidates/candidateValidator.js';
import type DAT from '../../../src/types/dats/dat.js';
import Game from '../../../src/types/dats/game.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import ROM from '../../../src/types/dats/rom.js';
import SingleValueGame from '../../../src/types/dats/singleValueGame.js';
import Options from '../../../src/types/options.js';
import ROMWithFiles from '../../../src/types/romWithFiles.js';
import WriteCandidate from '../../../src/types/writeCandidate.js';
import ProgressBarFake from '../../console/progressBarFake.js';

async function datToCandidates(dat: DAT): Promise<WriteCandidate[]> {
  return Promise.all(
    dat.getGames().map(
      async (game) =>
        new WriteCandidate(
          new SingleValueGame({ ...game }),
          await Promise.all(
            game.getRoms().map(async (rom) => {
              const dummyFile = await rom.toFile();
              return new ROMWithFiles(rom, dummyFile, dummyFile);
            }),
          ),
        ),
    ),
  );
}

it('should do nothing with no candidates', async () => {
  const dat = new LogiqxDAT({ header: new Header() });
  const candidates = await datToCandidates(dat);

  const invalidCandidates = new CandidateValidator(
    new Options({ commands: ['copy'] }),
    new ProgressBarFake(),
  ).validate(dat, candidates);

  expect(invalidCandidates).toHaveLength(0);
});

it('should return nothing if all candidates have unique paths', async () => {
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [
      new Game({
        name: 'game with no ROMs',
      }),
      new Game({
        name: 'game with one ROM',
        roms: [new ROM({ name: 'one', size: 1 })],
      }),
      new Game({
        name: 'game with two ROMs',
        roms: [new ROM({ name: 'two', size: 2 }), new ROM({ name: 'three', size: 3 })],
      }),
    ],
  });
  const candidates = await datToCandidates(dat);

  const invalidCandidates = new CandidateValidator(
    new Options({ commands: ['copy'] }),
    new ProgressBarFake(),
  ).validate(dat, candidates);

  expect(invalidCandidates).toHaveLength(0);
});

it('should return something if some candidates have conflicting paths', async () => {
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [
      new Game({
        name: 'game with no ROMs',
      }),
      new Game({
        name: 'game one',
        roms: [new ROM({ name: 'one', size: 1 })],
      }),
      new Game({
        name: 'game two',
        roms: [new ROM({ name: 'two', size: 2 }), new ROM({ name: 'three', size: 3 })],
      }),
      new Game({
        name: 'game three',
        roms: [new ROM({ name: 'three', size: 3 }), new ROM({ name: 'four', size: 4 })],
      }),
      new Game({
        name: 'game four',
        roms: [new ROM({ name: 'four', size: 4 }), new ROM({ name: 'five', size: 5 })],
      }),
    ],
  });
  const candidates = await datToCandidates(dat);

  const invalidCandidates = new CandidateValidator(
    new Options({ commands: ['copy'] }),
    new ProgressBarFake(),
  ).validate(dat, candidates);

  const invalidCandidateNames = invalidCandidates.map((candidate) => candidate.getName()).sort();
  expect(invalidCandidateNames).toEqual(['game four', 'game three', 'game two']);
});
