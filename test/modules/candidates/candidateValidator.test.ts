import type DAT from '../../../src/models/dats/dat.js';
import Game from '../../../src/models/dats/game.js';
import Header from '../../../src/models/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/models/dats/logiqx/logiqxDat.js';
import ROM from '../../../src/models/dats/rom.js';
import Options from '../../../src/models/options.js';
import ROMWithFiles from '../../../src/models/romWithFiles.js';
import WriteCandidate from '../../../src/models/writeCandidate.js';
import CandidateValidator from '../../../src/modules/candidates/candidateValidator.js';
import ProgressBarFake from '../../console/progressBarFake.js';

async function datToCandidates(dat: DAT): Promise<WriteCandidate[]> {
  return await Promise.all(
    dat.getGames().map(
      async (game) =>
        new WriteCandidate(
          new Game({ ...game }),
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

  const invalidCandidateNames = invalidCandidates
    .map((candidate) => candidate.getName())
    .toSorted((a, b) => a.localeCompare(b));
  expect(invalidCandidateNames).toEqual(['game four', 'game three', 'game two']);
});
