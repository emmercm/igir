import Game from '../../../src/models/dats/game.js';
import Header from '../../../src/models/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/models/dats/logiqx/logiqxDat.js';
import ROM from '../../../src/models/dats/rom.js';
import Options, { GameSubdirMode, GameSubdirModeInverted } from '../../../src/models/options.js';
import ROMWithFiles from '../../../src/models/romWithFiles.js';
import WriteCandidate from '../../../src/models/writeCandidate.js';
import CandidatePostProcessor from '../../../src/modules/candidates/candidatePostProcessor.js';
import PathUtil from '../../../src/utils/pathUtil.js';
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
      roms: new ROM({ name: `${name}.rom`, size: 0, crc32: '00000000' }),
    }),
);
const subDirRomGames = ['Cheerful', 'Confident', 'Cool'].map(
  (name) =>
    new Game({
      name,
      roms: new ROM({ name: `disk1\\${name}.rom`, size: 0, crc32: '00000000' }),
    }),
);
const multiRomGames = ['Dainty', 'Daring', 'Dazzling', 'Dedicated'].map(
  (name) =>
    new Game({
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
    .toSorted((a, b) => a.localeCompare(b));
  expect(outputFilePaths).toEqual([
    PathUtil.resolve('Output', 'Admirable.rom'),
    PathUtil.resolve('Output', 'Adorable.rom'),
    PathUtil.resolve('Output', 'Adventurous.rom'),
    PathUtil.resolve('Output', 'Amazing.rom'),
    PathUtil.resolve('Output', 'Awesome.rom'),
    PathUtil.resolve('Output', 'Best.rom'),
    PathUtil.resolve('Output', 'Brilliant.rom'),
    PathUtil.resolve('Output', 'Dainty', 'Dainty (Track 01).bin'),
    PathUtil.resolve('Output', 'Dainty', 'Dainty.cue'),
    PathUtil.resolve('Output', 'Daring', 'Daring (Track 01).bin'),
    PathUtil.resolve('Output', 'Daring', 'Daring.cue'),
    PathUtil.resolve('Output', 'Dazzling', 'Dazzling (Track 01).bin'),
    PathUtil.resolve('Output', 'Dazzling', 'Dazzling.cue'),
    PathUtil.resolve('Output', 'Dedicated', 'Dedicated (Track 01).bin'),
    PathUtil.resolve('Output', 'Dedicated', 'Dedicated.cue'),
    PathUtil.resolve('Output', 'disk1', 'Cheerful.rom'),
    PathUtil.resolve('Output', 'disk1', 'Confident.rom'),
    PathUtil.resolve('Output', 'disk1', 'Cool.rom'),
  ]);
});

describe('dirLetterLimit', () => {
  test.each([
    [
      undefined,
      [
        PathUtil.resolve('Output', 'A', 'Admirable.rom'),
        PathUtil.resolve('Output', 'A', 'Adorable.rom'),
        PathUtil.resolve('Output', 'A', 'Adventurous.rom'),
        PathUtil.resolve('Output', 'A', 'Amazing.rom'),
        PathUtil.resolve('Output', 'A', 'Awesome.rom'),
        PathUtil.resolve('Output', 'B', 'Best.rom'),
        PathUtil.resolve('Output', 'B', 'Brilliant.rom'),
        PathUtil.resolve('Output', 'D', 'Dainty', 'Dainty (Track 01).bin'),
        PathUtil.resolve('Output', 'D', 'Dainty', 'Dainty.cue'),
        PathUtil.resolve('Output', 'D', 'Daring', 'Daring (Track 01).bin'),
        PathUtil.resolve('Output', 'D', 'Daring', 'Daring.cue'),
        PathUtil.resolve('Output', 'D', 'Dazzling', 'Dazzling (Track 01).bin'),
        PathUtil.resolve('Output', 'D', 'Dazzling', 'Dazzling.cue'),
        PathUtil.resolve('Output', 'D', 'Dedicated', 'Dedicated (Track 01).bin'),
        PathUtil.resolve('Output', 'D', 'Dedicated', 'Dedicated.cue'),
        PathUtil.resolve('Output', 'D', 'disk1', 'Cheerful.rom'),
        PathUtil.resolve('Output', 'D', 'disk1', 'Confident.rom'),
        PathUtil.resolve('Output', 'D', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      2,
      [
        PathUtil.resolve('Output', 'A1', 'Admirable.rom'),
        PathUtil.resolve('Output', 'A1', 'Adorable.rom'),
        PathUtil.resolve('Output', 'A2', 'Adventurous.rom'),
        PathUtil.resolve('Output', 'A2', 'Amazing.rom'),
        PathUtil.resolve('Output', 'A3', 'Awesome.rom'),
        PathUtil.resolve('Output', 'B', 'Best.rom'),
        PathUtil.resolve('Output', 'B', 'Brilliant.rom'),
        PathUtil.resolve('Output', 'D1', 'Dainty', 'Dainty (Track 01).bin'),
        PathUtil.resolve('Output', 'D1', 'Dainty', 'Dainty.cue'),
        PathUtil.resolve('Output', 'D1', 'Daring', 'Daring (Track 01).bin'),
        PathUtil.resolve('Output', 'D1', 'Daring', 'Daring.cue'),
        PathUtil.resolve('Output', 'D2', 'Dazzling', 'Dazzling (Track 01).bin'),
        PathUtil.resolve('Output', 'D2', 'Dazzling', 'Dazzling.cue'),
        PathUtil.resolve('Output', 'D2', 'Dedicated', 'Dedicated (Track 01).bin'),
        PathUtil.resolve('Output', 'D2', 'Dedicated', 'Dedicated.cue'),
        PathUtil.resolve('Output', 'D3', 'disk1', 'Cheerful.rom'),
        PathUtil.resolve('Output', 'D3', 'disk1', 'Confident.rom'),
        PathUtil.resolve('Output', 'D3', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      3,
      [
        PathUtil.resolve('Output', 'A1', 'Admirable.rom'),
        PathUtil.resolve('Output', 'A1', 'Adorable.rom'),
        PathUtil.resolve('Output', 'A1', 'Adventurous.rom'),
        PathUtil.resolve('Output', 'A2', 'Amazing.rom'),
        PathUtil.resolve('Output', 'A2', 'Awesome.rom'),
        PathUtil.resolve('Output', 'B', 'Best.rom'),
        PathUtil.resolve('Output', 'B', 'Brilliant.rom'),
        PathUtil.resolve('Output', 'D1', 'Dainty', 'Dainty (Track 01).bin'),
        PathUtil.resolve('Output', 'D1', 'Dainty', 'Dainty.cue'),
        PathUtil.resolve('Output', 'D1', 'Daring', 'Daring (Track 01).bin'),
        PathUtil.resolve('Output', 'D1', 'Daring', 'Daring.cue'),
        PathUtil.resolve('Output', 'D1', 'Dazzling', 'Dazzling (Track 01).bin'),
        PathUtil.resolve('Output', 'D1', 'Dazzling', 'Dazzling.cue'),
        PathUtil.resolve('Output', 'D2', 'Dedicated', 'Dedicated (Track 01).bin'),
        PathUtil.resolve('Output', 'D2', 'Dedicated', 'Dedicated.cue'),
        PathUtil.resolve('Output', 'D2', 'disk1', 'Cheerful.rom'),
        PathUtil.resolve('Output', 'D2', 'disk1', 'Confident.rom'),
        PathUtil.resolve('Output', 'D2', 'disk1', 'Cool.rom'),
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
        .toSorted((a, b) => a.localeCompare(b));
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
        PathUtil.resolve('Output', 'A-D', 'Admirable.rom'),
        PathUtil.resolve('Output', 'A-D', 'Adorable.rom'),
        PathUtil.resolve('Output', 'A-D', 'Adventurous.rom'),
        PathUtil.resolve('Output', 'A-D', 'Amazing.rom'),
        PathUtil.resolve('Output', 'A-D', 'Awesome.rom'),
        PathUtil.resolve('Output', 'A-D', 'Best.rom'),
        PathUtil.resolve('Output', 'A-D', 'Brilliant.rom'),
        PathUtil.resolve('Output', 'A-D', 'Dainty', 'Dainty (Track 01).bin'),
        PathUtil.resolve('Output', 'A-D', 'Dainty', 'Dainty.cue'),
        PathUtil.resolve('Output', 'A-D', 'Daring', 'Daring (Track 01).bin'),
        PathUtil.resolve('Output', 'A-D', 'Daring', 'Daring.cue'),
        PathUtil.resolve('Output', 'A-D', 'Dazzling', 'Dazzling (Track 01).bin'),
        PathUtil.resolve('Output', 'A-D', 'Dazzling', 'Dazzling.cue'),
        PathUtil.resolve('Output', 'A-D', 'Dedicated', 'Dedicated (Track 01).bin'),
        PathUtil.resolve('Output', 'A-D', 'Dedicated', 'Dedicated.cue'),
        PathUtil.resolve('Output', 'A-D', 'disk1', 'Cheerful.rom'),
        PathUtil.resolve('Output', 'A-D', 'disk1', 'Confident.rom'),
        PathUtil.resolve('Output', 'A-D', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      1,
      2,
      [
        PathUtil.resolve('Output', 'A1', 'Admirable.rom'),
        PathUtil.resolve('Output', 'A1', 'Adorable.rom'),
        PathUtil.resolve('Output', 'A2', 'Adventurous.rom'),
        PathUtil.resolve('Output', 'A2', 'Amazing.rom'),
        PathUtil.resolve('Output', 'A3', 'Awesome.rom'),
        PathUtil.resolve('Output', 'B', 'Best.rom'),
        PathUtil.resolve('Output', 'B', 'Brilliant.rom'),
        PathUtil.resolve('Output', 'D1', 'Dainty', 'Dainty (Track 01).bin'),
        PathUtil.resolve('Output', 'D1', 'Dainty', 'Dainty.cue'),
        PathUtil.resolve('Output', 'D1', 'Daring', 'Daring (Track 01).bin'),
        PathUtil.resolve('Output', 'D1', 'Daring', 'Daring.cue'),
        PathUtil.resolve('Output', 'D2', 'Dazzling', 'Dazzling (Track 01).bin'),
        PathUtil.resolve('Output', 'D2', 'Dazzling', 'Dazzling.cue'),
        PathUtil.resolve('Output', 'D2', 'Dedicated', 'Dedicated (Track 01).bin'),
        PathUtil.resolve('Output', 'D2', 'Dedicated', 'Dedicated.cue'),
        PathUtil.resolve('Output', 'D3', 'disk1', 'Cheerful.rom'),
        PathUtil.resolve('Output', 'D3', 'disk1', 'Confident.rom'),
        PathUtil.resolve('Output', 'D3', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      1,
      3,
      [
        PathUtil.resolve('Output', 'A1', 'Admirable.rom'),
        PathUtil.resolve('Output', 'A1', 'Adorable.rom'),
        PathUtil.resolve('Output', 'A1', 'Adventurous.rom'),
        PathUtil.resolve('Output', 'A2', 'Amazing.rom'),
        PathUtil.resolve('Output', 'A2', 'Awesome.rom'),
        PathUtil.resolve('Output', 'B', 'Best.rom'),
        PathUtil.resolve('Output', 'B', 'Brilliant.rom'),
        PathUtil.resolve('Output', 'D1', 'Dainty', 'Dainty (Track 01).bin'),
        PathUtil.resolve('Output', 'D1', 'Dainty', 'Dainty.cue'),
        PathUtil.resolve('Output', 'D1', 'Daring', 'Daring (Track 01).bin'),
        PathUtil.resolve('Output', 'D1', 'Daring', 'Daring.cue'),
        PathUtil.resolve('Output', 'D1', 'Dazzling', 'Dazzling (Track 01).bin'),
        PathUtil.resolve('Output', 'D1', 'Dazzling', 'Dazzling.cue'),
        PathUtil.resolve('Output', 'D2', 'Dedicated', 'Dedicated (Track 01).bin'),
        PathUtil.resolve('Output', 'D2', 'Dedicated', 'Dedicated.cue'),
        PathUtil.resolve('Output', 'D2', 'disk1', 'Cheerful.rom'),
        PathUtil.resolve('Output', 'D2', 'disk1', 'Confident.rom'),
        PathUtil.resolve('Output', 'D2', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      1,
      6,
      [
        // A and B don't get grouped
        PathUtil.resolve('Output', 'A', 'Admirable.rom'),
        PathUtil.resolve('Output', 'A', 'Adorable.rom'),
        PathUtil.resolve('Output', 'A', 'Adventurous.rom'),
        PathUtil.resolve('Output', 'A', 'Amazing.rom'),
        PathUtil.resolve('Output', 'A', 'Awesome.rom'),
        PathUtil.resolve('Output', 'B', 'Best.rom'),
        PathUtil.resolve('Output', 'B', 'Brilliant.rom'),
        PathUtil.resolve('Output', 'D', 'Dainty', 'Dainty (Track 01).bin'),
        PathUtil.resolve('Output', 'D', 'Dainty', 'Dainty.cue'),
        PathUtil.resolve('Output', 'D', 'Daring', 'Daring (Track 01).bin'),
        PathUtil.resolve('Output', 'D', 'Daring', 'Daring.cue'),
        PathUtil.resolve('Output', 'D', 'Dazzling', 'Dazzling (Track 01).bin'),
        PathUtil.resolve('Output', 'D', 'Dazzling', 'Dazzling.cue'),
        PathUtil.resolve('Output', 'D', 'Dedicated', 'Dedicated (Track 01).bin'),
        PathUtil.resolve('Output', 'D', 'Dedicated', 'Dedicated.cue'),
        PathUtil.resolve('Output', 'D', 'disk1', 'Cheerful.rom'),
        PathUtil.resolve('Output', 'D', 'disk1', 'Confident.rom'),
        PathUtil.resolve('Output', 'D', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      1,
      7,
      [
        // A and B get grouped
        PathUtil.resolve('Output', 'A-B', 'Admirable.rom'),
        PathUtil.resolve('Output', 'A-B', 'Adorable.rom'),
        PathUtil.resolve('Output', 'A-B', 'Adventurous.rom'),
        PathUtil.resolve('Output', 'A-B', 'Amazing.rom'),
        PathUtil.resolve('Output', 'A-B', 'Awesome.rom'),
        PathUtil.resolve('Output', 'A-B', 'Best.rom'),
        PathUtil.resolve('Output', 'A-B', 'Brilliant.rom'),
        PathUtil.resolve('Output', 'D', 'Dainty', 'Dainty (Track 01).bin'),
        PathUtil.resolve('Output', 'D', 'Dainty', 'Dainty.cue'),
        PathUtil.resolve('Output', 'D', 'Daring', 'Daring (Track 01).bin'),
        PathUtil.resolve('Output', 'D', 'Daring', 'Daring.cue'),
        PathUtil.resolve('Output', 'D', 'Dazzling', 'Dazzling (Track 01).bin'),
        PathUtil.resolve('Output', 'D', 'Dazzling', 'Dazzling.cue'),
        PathUtil.resolve('Output', 'D', 'Dedicated', 'Dedicated (Track 01).bin'),
        PathUtil.resolve('Output', 'D', 'Dedicated', 'Dedicated.cue'),
        PathUtil.resolve('Output', 'D', 'disk1', 'Cheerful.rom'),
        PathUtil.resolve('Output', 'D', 'disk1', 'Confident.rom'),
        PathUtil.resolve('Output', 'D', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      2,
      3,
      [
        PathUtil.resolve('Output', 'AD', 'Admirable.rom'),
        PathUtil.resolve('Output', 'AD', 'Adorable.rom'),
        PathUtil.resolve('Output', 'AD', 'Adventurous.rom'),
        PathUtil.resolve('Output', 'AM-BE', 'Amazing.rom'),
        PathUtil.resolve('Output', 'AM-BE', 'Awesome.rom'),
        PathUtil.resolve('Output', 'AM-BE', 'Best.rom'),
        PathUtil.resolve('Output', 'BR', 'Brilliant.rom'),
        PathUtil.resolve('Output', 'DA', 'Dainty', 'Dainty (Track 01).bin'),
        PathUtil.resolve('Output', 'DA', 'Dainty', 'Dainty.cue'),
        PathUtil.resolve('Output', 'DA', 'Daring', 'Daring (Track 01).bin'),
        PathUtil.resolve('Output', 'DA', 'Daring', 'Daring.cue'),
        PathUtil.resolve('Output', 'DA', 'Dazzling', 'Dazzling (Track 01).bin'),
        PathUtil.resolve('Output', 'DA', 'Dazzling', 'Dazzling.cue'),
        PathUtil.resolve('Output', 'DE-DI', 'Dedicated', 'Dedicated (Track 01).bin'),
        PathUtil.resolve('Output', 'DE-DI', 'Dedicated', 'Dedicated.cue'),
        PathUtil.resolve('Output', 'DE-DI', 'disk1', 'Cheerful.rom'),
        PathUtil.resolve('Output', 'DE-DI', 'disk1', 'Confident.rom'),
        PathUtil.resolve('Output', 'DE-DI', 'disk1', 'Cool.rom'),
      ],
    ],
    [
      3,
      4,
      [
        PathUtil.resolve('Output', 'ADM-AMA', 'Admirable.rom'),
        PathUtil.resolve('Output', 'ADM-AMA', 'Adorable.rom'),
        PathUtil.resolve('Output', 'ADM-AMA', 'Adventurous.rom'),
        PathUtil.resolve('Output', 'ADM-AMA', 'Amazing.rom'),
        PathUtil.resolve('Output', 'AWE-DAI', 'Awesome.rom'),
        PathUtil.resolve('Output', 'AWE-DAI', 'Best.rom'),
        PathUtil.resolve('Output', 'AWE-DAI', 'Brilliant.rom'),
        PathUtil.resolve('Output', 'AWE-DAI', 'Dainty', 'Dainty (Track 01).bin'),
        PathUtil.resolve('Output', 'AWE-DAI', 'Dainty', 'Dainty.cue'),
        PathUtil.resolve('Output', 'DAR-DIS', 'Daring', 'Daring (Track 01).bin'),
        PathUtil.resolve('Output', 'DAR-DIS', 'Daring', 'Daring.cue'),
        PathUtil.resolve('Output', 'DAR-DIS', 'Dazzling', 'Dazzling (Track 01).bin'),
        PathUtil.resolve('Output', 'DAR-DIS', 'Dazzling', 'Dazzling.cue'),
        PathUtil.resolve('Output', 'DAR-DIS', 'Dedicated', 'Dedicated (Track 01).bin'),
        PathUtil.resolve('Output', 'DAR-DIS', 'Dedicated', 'Dedicated.cue'),
        PathUtil.resolve('Output', 'DAR-DIS', 'disk1', 'Cheerful.rom'),
        PathUtil.resolve('Output', 'DAR-DIS', 'disk1', 'Confident.rom'),
        PathUtil.resolve('Output', 'DAR-DIS', 'disk1', 'Cool.rom'),
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
        .toSorted((a, b) => a.localeCompare(b));
      expect(outputFilePaths).toEqual(expectedFilePaths);
    },
  );
});
