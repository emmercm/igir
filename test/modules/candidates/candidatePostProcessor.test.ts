import path from 'node:path';

import CandidatePostProcessor from '../../../src/modules/candidates/candidatePostProcessor.js';
import Game from '../../../src/types/dats/game.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import ROM from '../../../src/types/dats/rom.js';
import Options, { GameSubdirMode, GameSubdirModeInverted } from '../../../src/types/options.js';
import ROMWithFiles from '../../../src/types/romWithFiles.js';
import WriteCandidate from '../../../src/types/writeCandidate.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const singleRomGames = [
  'Admirable',
  'Adorable',
  'Adventurous',
  'Amazing',
  'Awesome',
  'Best',
  'Brilliant',
].map(
  (name) =>
    new Game({
      name,
      rom: new ROM({ name: `${name}.rom`, size: 0, crc32: '00000000' }),
    }),
);
const subDirRomGames = ['Cheerful', 'Confident', 'Cool'].map(
  (name) =>
    new Game({
      name,
      rom: new ROM({ name: `disk1\\${name}.rom`, size: 0, crc32: '00000000' }),
    }),
);
const multiRomGames = ['Dainty', 'Daring', 'Dazzling', 'Dedicated'].map(
  (name) =>
    new Game({
      name,
      rom: [
        new ROM({ name: `${name}.cue`, size: 0, crc32: '00000000' }),
        new ROM({ name: `${name} (Track 01).bin`, size: 0, crc32: '00000000' }),
      ],
    }),
);
const games = [...singleRomGames, ...subDirRomGames, ...multiRomGames];
const dat = new LogiqxDAT(new Header(), games);

async function runCandidatePostProcessor(options: Options): Promise<WriteCandidate[]> {
  const candidates = await Promise.all(
    games.map(
      async (game) =>
        new WriteCandidate(
          game,
          await Promise.all(
            game
              .getRoms()
              .map(async (rom) => new ROMWithFiles(rom, await rom.toFile(), await rom.toFile())),
          ),
        ),
    ),
  );

  return new CandidatePostProcessor(options, new ProgressBarFake()).process(dat, candidates);
}

it('should do nothing with no options', async () => {
  const options = new Options({
    commands: ['copy'],
    output: 'Output',
    dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
  });

  const candidates = await runCandidatePostProcessor(options);

  const outputFilePaths = candidates
    .flatMap((candidate) => candidate.getRomsWithFiles())
    .map((romWithFiles) => romWithFiles.getOutputFile().getFilePath())
    .sort();
  expect(outputFilePaths).toEqual([
    path.join('Output', 'Admirable.rom'),
    path.join('Output', 'Adorable.rom'),
    path.join('Output', 'Adventurous.rom'),
    path.join('Output', 'Amazing.rom'),
    path.join('Output', 'Awesome.rom'),
    path.join('Output', 'Best.rom'),
    path.join('Output', 'Brilliant.rom'),
    path.join('Output', 'Dainty', 'Dainty (Track 01).bin'),
    path.join('Output', 'Dainty', 'Dainty.cue'),
    path.join('Output', 'Daring', 'Daring (Track 01).bin'),
    path.join('Output', 'Daring', 'Daring.cue'),
    path.join('Output', 'Dazzling', 'Dazzling (Track 01).bin'),
    path.join('Output', 'Dazzling', 'Dazzling.cue'),
    path.join('Output', 'Dedicated', 'Dedicated (Track 01).bin'),
    path.join('Output', 'Dedicated', 'Dedicated.cue'),
    path.join('Output', 'disk1', 'Cheerful.rom'),
    path.join('Output', 'disk1', 'Confident.rom'),
    path.join('Output', 'disk1', 'Cool.rom'),
  ]);
});

describe('dirLetterLimit', () => {
  test.each([
    [
      undefined,
      [
        path.join('Output', 'A', 'Admirable.rom'),
        path.join('Output', 'A', 'Adorable.rom'),
        path.join('Output', 'A', 'Adventurous.rom'),
        path.join('Output', 'A', 'Amazing.rom'),
        path.join('Output', 'A', 'Awesome.rom'),
        path.join('Output', 'B', 'Best.rom'),
        path.join('Output', 'B', 'Brilliant.rom'),
        path.join('Output', 'D', 'Dainty', 'Dainty (Track 01).bin'),
        path.join('Output', 'D', 'Dainty', 'Dainty.cue'),
        path.join('Output', 'D', 'Daring', 'Daring (Track 01).bin'),
        path.join('Output', 'D', 'Daring', 'Daring.cue'),
        path.join('Output', 'D', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.join('Output', 'D', 'Dazzling', 'Dazzling.cue'),
        path.join('Output', 'D', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.join('Output', 'D', 'Dedicated', 'Dedicated.cue'),
        path.join('Output', 'D', 'disk1', 'Cheerful.rom'),
        path.join('Output', 'D', 'disk1', 'Confident.rom'),
        path.join('Output', 'D', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      2,
      [
        path.join('Output', 'A1', 'Admirable.rom'),
        path.join('Output', 'A1', 'Adorable.rom'),
        path.join('Output', 'A2', 'Adventurous.rom'),
        path.join('Output', 'A2', 'Amazing.rom'),
        path.join('Output', 'A3', 'Awesome.rom'),
        path.join('Output', 'B', 'Best.rom'),
        path.join('Output', 'B', 'Brilliant.rom'),
        path.join('Output', 'D1', 'Dainty', 'Dainty (Track 01).bin'),
        path.join('Output', 'D1', 'Dainty', 'Dainty.cue'),
        path.join('Output', 'D1', 'Daring', 'Daring (Track 01).bin'),
        path.join('Output', 'D1', 'Daring', 'Daring.cue'),
        path.join('Output', 'D2', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.join('Output', 'D2', 'Dazzling', 'Dazzling.cue'),
        path.join('Output', 'D2', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.join('Output', 'D2', 'Dedicated', 'Dedicated.cue'),
        path.join('Output', 'D3', 'disk1', 'Cheerful.rom'),
        path.join('Output', 'D3', 'disk1', 'Confident.rom'),
        path.join('Output', 'D3', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      3,
      [
        path.join('Output', 'A1', 'Admirable.rom'),
        path.join('Output', 'A1', 'Adorable.rom'),
        path.join('Output', 'A1', 'Adventurous.rom'),
        path.join('Output', 'A2', 'Amazing.rom'),
        path.join('Output', 'A2', 'Awesome.rom'),
        path.join('Output', 'B', 'Best.rom'),
        path.join('Output', 'B', 'Brilliant.rom'),
        path.join('Output', 'D1', 'Dainty', 'Dainty (Track 01).bin'),
        path.join('Output', 'D1', 'Dainty', 'Dainty.cue'),
        path.join('Output', 'D1', 'Daring', 'Daring (Track 01).bin'),
        path.join('Output', 'D1', 'Daring', 'Daring.cue'),
        path.join('Output', 'D1', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.join('Output', 'D1', 'Dazzling', 'Dazzling.cue'),
        path.join('Output', 'D2', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.join('Output', 'D2', 'Dedicated', 'Dedicated.cue'),
        path.join('Output', 'D2', 'disk1', 'Cheerful.rom'),
        path.join('Output', 'D2', 'disk1', 'Confident.rom'),
        path.join('Output', 'D2', 'disk1', 'Cool.rom'),
      ],
    ],
  ])(
    'it should split the letter dirs based on limit: %s',
    async (dirLetterLimit, expectedFilePaths) => {
      const options = new Options({
        commands: ['copy'],
        output: 'Output',
        dirLetter: true,
        dirLetterCount: 1,
        dirLetterLimit,
        dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
      });

      const candidates = await runCandidatePostProcessor(options);

      const outputFilePaths = candidates
        .flatMap((candidate) => candidate.getRomsWithFiles())
        .map((romWithFiles) => romWithFiles.getOutputFile().getFilePath())
        .sort();
      expect(outputFilePaths).toEqual(expectedFilePaths);
    },
  );
});

describe('dirLetterGroup', () => {
  test.each([
    [
      1,
      undefined,
      [
        // This isn't realistic, but we should have a test case for it
        path.join('Output', 'A-D', 'Admirable.rom'),
        path.join('Output', 'A-D', 'Adorable.rom'),
        path.join('Output', 'A-D', 'Adventurous.rom'),
        path.join('Output', 'A-D', 'Amazing.rom'),
        path.join('Output', 'A-D', 'Awesome.rom'),
        path.join('Output', 'A-D', 'Best.rom'),
        path.join('Output', 'A-D', 'Brilliant.rom'),
        path.join('Output', 'A-D', 'Dainty', 'Dainty (Track 01).bin'),
        path.join('Output', 'A-D', 'Dainty', 'Dainty.cue'),
        path.join('Output', 'A-D', 'Daring', 'Daring (Track 01).bin'),
        path.join('Output', 'A-D', 'Daring', 'Daring.cue'),
        path.join('Output', 'A-D', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.join('Output', 'A-D', 'Dazzling', 'Dazzling.cue'),
        path.join('Output', 'A-D', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.join('Output', 'A-D', 'Dedicated', 'Dedicated.cue'),
        path.join('Output', 'A-D', 'disk1', 'Cheerful.rom'),
        path.join('Output', 'A-D', 'disk1', 'Confident.rom'),
        path.join('Output', 'A-D', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      1,
      2,
      [
        path.join('Output', 'A-A1', 'Admirable.rom'),
        path.join('Output', 'A-A1', 'Adorable.rom'),
        path.join('Output', 'A-A2', 'Adventurous.rom'),
        path.join('Output', 'A-A2', 'Amazing.rom'),
        path.join('Output', 'A-B', 'Awesome.rom'),
        path.join('Output', 'A-B', 'Best.rom'),
        path.join('Output', 'B-D', 'Brilliant.rom'),
        path.join('Output', 'B-D', 'Dainty', 'Dainty (Track 01).bin'),
        path.join('Output', 'B-D', 'Dainty', 'Dainty.cue'),
        path.join('Output', 'D-D1', 'Daring', 'Daring (Track 01).bin'),
        path.join('Output', 'D-D1', 'Daring', 'Daring.cue'),
        path.join('Output', 'D-D1', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.join('Output', 'D-D1', 'Dazzling', 'Dazzling.cue'),
        path.join('Output', 'D-D2', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.join('Output', 'D-D2', 'Dedicated', 'Dedicated.cue'),
        path.join('Output', 'D-D2', 'disk1', 'Cheerful.rom'),
        path.join('Output', 'D-D2', 'disk1', 'Confident.rom'),
        path.join('Output', 'D-D2', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      1,
      3,
      [
        path.join('Output', 'A-A', 'Admirable.rom'),
        path.join('Output', 'A-A', 'Adorable.rom'),
        path.join('Output', 'A-A', 'Adventurous.rom'),
        path.join('Output', 'A-B', 'Amazing.rom'),
        path.join('Output', 'A-B', 'Awesome.rom'),
        path.join('Output', 'A-B', 'Best.rom'),
        path.join('Output', 'B-D', 'Brilliant.rom'),
        path.join('Output', 'B-D', 'Dainty', 'Dainty (Track 01).bin'),
        path.join('Output', 'B-D', 'Dainty', 'Dainty.cue'),
        path.join('Output', 'B-D', 'Daring', 'Daring (Track 01).bin'),
        path.join('Output', 'B-D', 'Daring', 'Daring.cue'),
        path.join('Output', 'D-D', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.join('Output', 'D-D', 'Dazzling', 'Dazzling.cue'),
        path.join('Output', 'D-D', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.join('Output', 'D-D', 'Dedicated', 'Dedicated.cue'),
        path.join('Output', 'D-D', 'disk1', 'Cheerful.rom'),
        path.join('Output', 'D-D', 'disk1', 'Confident.rom'),
        path.join('Output', 'D-D', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      2,
      3,
      [
        path.join('Output', 'AD-AD', 'Admirable.rom'),
        path.join('Output', 'AD-AD', 'Adorable.rom'),
        path.join('Output', 'AD-AD', 'Adventurous.rom'),
        path.join('Output', 'AM-BE', 'Amazing.rom'),
        path.join('Output', 'AM-BE', 'Awesome.rom'),
        path.join('Output', 'AM-BE', 'Best.rom'),
        path.join('Output', 'BR-DA', 'Brilliant.rom'),
        path.join('Output', 'BR-DA', 'Dainty', 'Dainty (Track 01).bin'),
        path.join('Output', 'BR-DA', 'Dainty', 'Dainty.cue'),
        path.join('Output', 'BR-DA', 'Daring', 'Daring (Track 01).bin'),
        path.join('Output', 'BR-DA', 'Daring', 'Daring.cue'),
        path.join('Output', 'DA-DI', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.join('Output', 'DA-DI', 'Dazzling', 'Dazzling.cue'),
        path.join('Output', 'DA-DI', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.join('Output', 'DA-DI', 'Dedicated', 'Dedicated.cue'),
        path.join('Output', 'DA-DI', 'disk1', 'Cheerful.rom'),
        path.join('Output', 'DA-DI', 'disk1', 'Confident.rom'),
        path.join('Output', 'DA-DI', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      3,
      4,
      [
        path.join('Output', 'ADM-AMA', 'Admirable.rom'),
        path.join('Output', 'ADM-AMA', 'Adorable.rom'),
        path.join('Output', 'ADM-AMA', 'Adventurous.rom'),
        path.join('Output', 'ADM-AMA', 'Amazing.rom'),
        path.join('Output', 'AWE-DAI', 'Awesome.rom'),
        path.join('Output', 'AWE-DAI', 'Best.rom'),
        path.join('Output', 'AWE-DAI', 'Brilliant.rom'),
        path.join('Output', 'AWE-DAI', 'Dainty', 'Dainty (Track 01).bin'),
        path.join('Output', 'AWE-DAI', 'Dainty', 'Dainty.cue'),
        path.join('Output', 'DAR-DIS', 'Daring', 'Daring (Track 01).bin'),
        path.join('Output', 'DAR-DIS', 'Daring', 'Daring.cue'),
        path.join('Output', 'DAR-DIS', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.join('Output', 'DAR-DIS', 'Dazzling', 'Dazzling.cue'),
        path.join('Output', 'DAR-DIS', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.join('Output', 'DAR-DIS', 'Dedicated', 'Dedicated.cue'),
        path.join('Output', 'DAR-DIS', 'disk1', 'Cheerful.rom'),
        path.join('Output', 'DAR-DIS', 'disk1', 'Confident.rom'),
        path.join('Output', 'DAR-DIS', 'disk1', 'Cool.rom'),
      ],
    ],
  ])(
    'it should group based on count & limit: %s, %s',
    async (dirLetterCount, dirLetterLimit, expectedFilePaths) => {
      const options = new Options({
        commands: ['copy'],
        output: 'Output',
        dirLetter: true,
        dirLetterCount,
        dirLetterLimit,
        dirLetterGroup: true,
        dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
      });

      const candidates = await runCandidatePostProcessor(options);

      const outputFilePaths = candidates
        .flatMap((candidate) => candidate.getRomsWithFiles())
        .map((romWithFiles) => romWithFiles.getOutputFile().getFilePath())
        .sort();
      expect(outputFilePaths).toEqual(expectedFilePaths);
    },
  );
});
