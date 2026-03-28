import path from 'node:path';

import CandidatePostProcessor from '../../../src/modules/candidates/candidatePostProcessor.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import ROM from '../../../src/types/dats/rom.js';
import SingleValueGame from '../../../src/types/dats/singleValueGame.js';
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
    new SingleValueGame({
      name,
      roms: new ROM({ name: `${name}.rom`, size: 0, crc32: '00000000' }),
    }),
);
const subDirRomGames = ['Cheerful', 'Confident', 'Cool'].map(
  (name) =>
    new SingleValueGame({
      name,
      roms: new ROM({ name: `disk1\\${name}.rom`, size: 0, crc32: '00000000' }),
    }),
);
const multiRomGames = ['Dainty', 'Daring', 'Dazzling', 'Dedicated'].map(
  (name) =>
    new SingleValueGame({
      name,
      roms: [
        new ROM({ name: `${name}.cue`, size: 0, crc32: '00000000' }),
        new ROM({ name: `${name} (Track 01).bin`, size: 0, crc32: '00000000' }),
      ],
    }),
);
const games = [...singleRomGames, ...subDirRomGames, ...multiRomGames];
const dat = new LogiqxDAT({ header: new Header(), games });

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
    .toSorted();
  expect(outputFilePaths).toEqual([
    path.resolve('Output', 'Admirable.rom'),
    path.resolve('Output', 'Adorable.rom'),
    path.resolve('Output', 'Adventurous.rom'),
    path.resolve('Output', 'Amazing.rom'),
    path.resolve('Output', 'Awesome.rom'),
    path.resolve('Output', 'Best.rom'),
    path.resolve('Output', 'Brilliant.rom'),
    path.resolve('Output', 'Dainty', 'Dainty (Track 01).bin'),
    path.resolve('Output', 'Dainty', 'Dainty.cue'),
    path.resolve('Output', 'Daring', 'Daring (Track 01).bin'),
    path.resolve('Output', 'Daring', 'Daring.cue'),
    path.resolve('Output', 'Dazzling', 'Dazzling (Track 01).bin'),
    path.resolve('Output', 'Dazzling', 'Dazzling.cue'),
    path.resolve('Output', 'Dedicated', 'Dedicated (Track 01).bin'),
    path.resolve('Output', 'Dedicated', 'Dedicated.cue'),
    path.resolve('Output', 'disk1', 'Cheerful.rom'),
    path.resolve('Output', 'disk1', 'Confident.rom'),
    path.resolve('Output', 'disk1', 'Cool.rom'),
  ]);
});

describe('dirLetterLimit', () => {
  test.each([
    [
      undefined,
      [
        path.resolve('Output', 'A', 'Admirable.rom'),
        path.resolve('Output', 'A', 'Adorable.rom'),
        path.resolve('Output', 'A', 'Adventurous.rom'),
        path.resolve('Output', 'A', 'Amazing.rom'),
        path.resolve('Output', 'A', 'Awesome.rom'),
        path.resolve('Output', 'B', 'Best.rom'),
        path.resolve('Output', 'B', 'Brilliant.rom'),
        path.resolve('Output', 'D', 'Dainty', 'Dainty (Track 01).bin'),
        path.resolve('Output', 'D', 'Dainty', 'Dainty.cue'),
        path.resolve('Output', 'D', 'Daring', 'Daring (Track 01).bin'),
        path.resolve('Output', 'D', 'Daring', 'Daring.cue'),
        path.resolve('Output', 'D', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.resolve('Output', 'D', 'Dazzling', 'Dazzling.cue'),
        path.resolve('Output', 'D', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.resolve('Output', 'D', 'Dedicated', 'Dedicated.cue'),
        path.resolve('Output', 'D', 'disk1', 'Cheerful.rom'),
        path.resolve('Output', 'D', 'disk1', 'Confident.rom'),
        path.resolve('Output', 'D', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      2,
      [
        path.resolve('Output', 'A1', 'Admirable.rom'),
        path.resolve('Output', 'A1', 'Adorable.rom'),
        path.resolve('Output', 'A2', 'Adventurous.rom'),
        path.resolve('Output', 'A2', 'Amazing.rom'),
        path.resolve('Output', 'A3', 'Awesome.rom'),
        path.resolve('Output', 'B', 'Best.rom'),
        path.resolve('Output', 'B', 'Brilliant.rom'),
        path.resolve('Output', 'D1', 'Dainty', 'Dainty (Track 01).bin'),
        path.resolve('Output', 'D1', 'Dainty', 'Dainty.cue'),
        path.resolve('Output', 'D1', 'Daring', 'Daring (Track 01).bin'),
        path.resolve('Output', 'D1', 'Daring', 'Daring.cue'),
        path.resolve('Output', 'D2', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.resolve('Output', 'D2', 'Dazzling', 'Dazzling.cue'),
        path.resolve('Output', 'D2', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.resolve('Output', 'D2', 'Dedicated', 'Dedicated.cue'),
        path.resolve('Output', 'D3', 'disk1', 'Cheerful.rom'),
        path.resolve('Output', 'D3', 'disk1', 'Confident.rom'),
        path.resolve('Output', 'D3', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      3,
      [
        path.resolve('Output', 'A1', 'Admirable.rom'),
        path.resolve('Output', 'A1', 'Adorable.rom'),
        path.resolve('Output', 'A1', 'Adventurous.rom'),
        path.resolve('Output', 'A2', 'Amazing.rom'),
        path.resolve('Output', 'A2', 'Awesome.rom'),
        path.resolve('Output', 'B', 'Best.rom'),
        path.resolve('Output', 'B', 'Brilliant.rom'),
        path.resolve('Output', 'D1', 'Dainty', 'Dainty (Track 01).bin'),
        path.resolve('Output', 'D1', 'Dainty', 'Dainty.cue'),
        path.resolve('Output', 'D1', 'Daring', 'Daring (Track 01).bin'),
        path.resolve('Output', 'D1', 'Daring', 'Daring.cue'),
        path.resolve('Output', 'D1', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.resolve('Output', 'D1', 'Dazzling', 'Dazzling.cue'),
        path.resolve('Output', 'D2', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.resolve('Output', 'D2', 'Dedicated', 'Dedicated.cue'),
        path.resolve('Output', 'D2', 'disk1', 'Cheerful.rom'),
        path.resolve('Output', 'D2', 'disk1', 'Confident.rom'),
        path.resolve('Output', 'D2', 'disk1', 'Cool.rom'),
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
        .toSorted();
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
        path.resolve('Output', 'A-D', 'Admirable.rom'),
        path.resolve('Output', 'A-D', 'Adorable.rom'),
        path.resolve('Output', 'A-D', 'Adventurous.rom'),
        path.resolve('Output', 'A-D', 'Amazing.rom'),
        path.resolve('Output', 'A-D', 'Awesome.rom'),
        path.resolve('Output', 'A-D', 'Best.rom'),
        path.resolve('Output', 'A-D', 'Brilliant.rom'),
        path.resolve('Output', 'A-D', 'Dainty', 'Dainty (Track 01).bin'),
        path.resolve('Output', 'A-D', 'Dainty', 'Dainty.cue'),
        path.resolve('Output', 'A-D', 'Daring', 'Daring (Track 01).bin'),
        path.resolve('Output', 'A-D', 'Daring', 'Daring.cue'),
        path.resolve('Output', 'A-D', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.resolve('Output', 'A-D', 'Dazzling', 'Dazzling.cue'),
        path.resolve('Output', 'A-D', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.resolve('Output', 'A-D', 'Dedicated', 'Dedicated.cue'),
        path.resolve('Output', 'A-D', 'disk1', 'Cheerful.rom'),
        path.resolve('Output', 'A-D', 'disk1', 'Confident.rom'),
        path.resolve('Output', 'A-D', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      1,
      2,
      [
        path.resolve('Output', 'A-A1', 'Admirable.rom'),
        path.resolve('Output', 'A-A1', 'Adorable.rom'),
        path.resolve('Output', 'A-A2', 'Adventurous.rom'),
        path.resolve('Output', 'A-A2', 'Amazing.rom'),
        path.resolve('Output', 'A-B', 'Awesome.rom'),
        path.resolve('Output', 'A-B', 'Best.rom'),
        path.resolve('Output', 'B-D', 'Brilliant.rom'),
        path.resolve('Output', 'B-D', 'Dainty', 'Dainty (Track 01).bin'),
        path.resolve('Output', 'B-D', 'Dainty', 'Dainty.cue'),
        path.resolve('Output', 'D-D1', 'Daring', 'Daring (Track 01).bin'),
        path.resolve('Output', 'D-D1', 'Daring', 'Daring.cue'),
        path.resolve('Output', 'D-D1', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.resolve('Output', 'D-D1', 'Dazzling', 'Dazzling.cue'),
        path.resolve('Output', 'D-D2', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.resolve('Output', 'D-D2', 'Dedicated', 'Dedicated.cue'),
        path.resolve('Output', 'D-D2', 'disk1', 'Cheerful.rom'),
        path.resolve('Output', 'D-D2', 'disk1', 'Confident.rom'),
        path.resolve('Output', 'D-D2', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      1,
      3,
      [
        path.resolve('Output', 'A-A', 'Admirable.rom'),
        path.resolve('Output', 'A-A', 'Adorable.rom'),
        path.resolve('Output', 'A-A', 'Adventurous.rom'),
        path.resolve('Output', 'A-B', 'Amazing.rom'),
        path.resolve('Output', 'A-B', 'Awesome.rom'),
        path.resolve('Output', 'A-B', 'Best.rom'),
        path.resolve('Output', 'B-D', 'Brilliant.rom'),
        path.resolve('Output', 'B-D', 'Dainty', 'Dainty (Track 01).bin'),
        path.resolve('Output', 'B-D', 'Dainty', 'Dainty.cue'),
        path.resolve('Output', 'B-D', 'Daring', 'Daring (Track 01).bin'),
        path.resolve('Output', 'B-D', 'Daring', 'Daring.cue'),
        path.resolve('Output', 'D-D', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.resolve('Output', 'D-D', 'Dazzling', 'Dazzling.cue'),
        path.resolve('Output', 'D-D', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.resolve('Output', 'D-D', 'Dedicated', 'Dedicated.cue'),
        path.resolve('Output', 'D-D', 'disk1', 'Cheerful.rom'),
        path.resolve('Output', 'D-D', 'disk1', 'Confident.rom'),
        path.resolve('Output', 'D-D', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      2,
      3,
      [
        path.resolve('Output', 'AD-AD', 'Admirable.rom'),
        path.resolve('Output', 'AD-AD', 'Adorable.rom'),
        path.resolve('Output', 'AD-AD', 'Adventurous.rom'),
        path.resolve('Output', 'AM-BE', 'Amazing.rom'),
        path.resolve('Output', 'AM-BE', 'Awesome.rom'),
        path.resolve('Output', 'AM-BE', 'Best.rom'),
        path.resolve('Output', 'BR-DA', 'Brilliant.rom'),
        path.resolve('Output', 'BR-DA', 'Dainty', 'Dainty (Track 01).bin'),
        path.resolve('Output', 'BR-DA', 'Dainty', 'Dainty.cue'),
        path.resolve('Output', 'BR-DA', 'Daring', 'Daring (Track 01).bin'),
        path.resolve('Output', 'BR-DA', 'Daring', 'Daring.cue'),
        path.resolve('Output', 'DA-DI', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.resolve('Output', 'DA-DI', 'Dazzling', 'Dazzling.cue'),
        path.resolve('Output', 'DA-DI', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.resolve('Output', 'DA-DI', 'Dedicated', 'Dedicated.cue'),
        path.resolve('Output', 'DA-DI', 'disk1', 'Cheerful.rom'),
        path.resolve('Output', 'DA-DI', 'disk1', 'Confident.rom'),
        path.resolve('Output', 'DA-DI', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      3,
      4,
      [
        path.resolve('Output', 'ADM-AMA', 'Admirable.rom'),
        path.resolve('Output', 'ADM-AMA', 'Adorable.rom'),
        path.resolve('Output', 'ADM-AMA', 'Adventurous.rom'),
        path.resolve('Output', 'ADM-AMA', 'Amazing.rom'),
        path.resolve('Output', 'AWE-DAI', 'Awesome.rom'),
        path.resolve('Output', 'AWE-DAI', 'Best.rom'),
        path.resolve('Output', 'AWE-DAI', 'Brilliant.rom'),
        path.resolve('Output', 'AWE-DAI', 'Dainty', 'Dainty (Track 01).bin'),
        path.resolve('Output', 'AWE-DAI', 'Dainty', 'Dainty.cue'),
        path.resolve('Output', 'DAR-DIS', 'Daring', 'Daring (Track 01).bin'),
        path.resolve('Output', 'DAR-DIS', 'Daring', 'Daring.cue'),
        path.resolve('Output', 'DAR-DIS', 'Dazzling', 'Dazzling (Track 01).bin'),
        path.resolve('Output', 'DAR-DIS', 'Dazzling', 'Dazzling.cue'),
        path.resolve('Output', 'DAR-DIS', 'Dedicated', 'Dedicated (Track 01).bin'),
        path.resolve('Output', 'DAR-DIS', 'Dedicated', 'Dedicated.cue'),
        path.resolve('Output', 'DAR-DIS', 'disk1', 'Cheerful.rom'),
        path.resolve('Output', 'DAR-DIS', 'disk1', 'Confident.rom'),
        path.resolve('Output', 'DAR-DIS', 'disk1', 'Cool.rom'),
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
        .toSorted();
      expect(outputFilePaths).toEqual(expectedFilePaths);
    },
  );
});
