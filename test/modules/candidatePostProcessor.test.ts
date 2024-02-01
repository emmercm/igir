import path from 'node:path';

import CandidatePostProcessor from '../../src/modules/candidatePostProcessor.js';
import Game from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import Parent from '../../src/types/dats/parent.js';
import ROM from '../../src/types/dats/rom.js';
import Options, { GameSubdirMode } from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
import ProgressBarFake from '../console/progressBarFake.js';

const singleRomGames = [
  'Admirable',
  'Adorable',
  'Adventurous',
  'Amazing',
  'Awesome',
  'Best',
  'Brilliant',
].map((name) => new Game({
  name,
  rom: new ROM({ name: `${name}.rom`, size: 0, crc: '00000000' }),
}));
const subDirRomGames = [
  'Cheerful',
  'Confident',
  'Cool',
].map((name) => new Game({
  name,
  rom: new ROM({ name: `disk1\\${name}.rom`, size: 0, crc: '00000000' }),
}));
const multiRomGames = [
  'Dainty',
  'Daring',
  'Dazzling',
  'Dedicated',
].map((name) => new Game({
  name,
  rom: [
    new ROM({ name: `${name}.cue`, size: 0, crc: '00000000' }),
    new ROM({ name: `${name} (Track 01).bin`, size: 0, crc: '00000000' }),
  ],
}));
const games = [...singleRomGames, ...subDirRomGames, ...multiRomGames];
const dat = new LogiqxDAT(new Header(), games);

async function runCandidatePostProcessor(
  options: Options,
): Promise<Map<Parent, ReleaseCandidate[]>> {
  const gameReleaseCandidates = await Promise.all(games.map(async (game) => new ReleaseCandidate(
    game,
    undefined,
    await Promise.all(game.getRoms().map(async (rom) => new ROMWithFiles(
      rom,
      await rom.toFile(),
      await rom.toFile(),
    ))),
  )));
  const datCandidates = new Map(gameReleaseCandidates.map((releaseCandidate) => ([
    new Parent(releaseCandidate.getName(), releaseCandidate.getGame()),
    [releaseCandidate],
  ])));

  return new CandidatePostProcessor(options, new ProgressBarFake()).process(dat, datCandidates);
}

it('should do nothing with no options', async () => {
  const options = new Options({
    commands: ['copy'],
    output: 'Output',
    dirGameSubdir: GameSubdirMode[GameSubdirMode.MULTIPLE].toLowerCase(),
  });

  const parentsToCandidates = await runCandidatePostProcessor(options);

  const outputFilePaths = [...parentsToCandidates.values()]
    .flat()
    .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
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
    path.join('Output', 'disk1_Cheerful.rom'),
    path.join('Output', 'disk1_Confident.rom'),
    path.join('Output', 'disk1_Cool.rom'),
  ]);
});

describe('dirLetterLimit', () => {
  test.each([
    [undefined, [
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
      path.join('Output', 'D', 'disk1_Cheerful.rom'),
      path.join('Output', 'D', 'disk1_Confident.rom'),
      path.join('Output', 'D', 'disk1_Cool.rom'),
    ]],
    [2, [
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
      path.join('Output', 'D3', 'disk1_Cheerful.rom'),
      path.join('Output', 'D3', 'disk1_Confident.rom'),
      path.join('Output', 'D4', 'disk1_Cool.rom'),
    ]],
    [3, [
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
      path.join('Output', 'D2', 'disk1_Cheerful.rom'),
      path.join('Output', 'D2', 'disk1_Confident.rom'),
      path.join('Output', 'D3', 'disk1_Cool.rom'),
    ]],
  ])('it should split the letter dirs based on limit: %s', async (dirLetterLimit, expectedFilePaths) => {
    const options = new Options({
      commands: ['copy'],
      output: 'Output',
      dirLetter: true,
      dirLetterCount: 1,
      dirLetterLimit,
      dirGameSubdir: GameSubdirMode[GameSubdirMode.MULTIPLE].toLowerCase(),
    });

    const parentsToCandidates = await runCandidatePostProcessor(options);

    const outputFilePaths = [...parentsToCandidates.values()]
      .flat()
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .map((romWithFiles) => romWithFiles.getOutputFile().getFilePath())
      .sort();
    expect(outputFilePaths).toEqual(expectedFilePaths);
  });
});

describe('dirLetterGroup', () => {
  test.each([
    [1, undefined, [
      // This isn't realistic, but we should have a test case for it
      'Output/A-D/Admirable.rom',
      'Output/A-D/Adorable.rom',
      'Output/A-D/Adventurous.rom',
      'Output/A-D/Amazing.rom',
      'Output/A-D/Awesome.rom',
      'Output/A-D/Best.rom',
      'Output/A-D/Brilliant.rom',
      'Output/A-D/Dainty/Dainty (Track 01).bin',
      'Output/A-D/Dainty/Dainty.cue',
      'Output/A-D/Daring/Daring (Track 01).bin',
      'Output/A-D/Daring/Daring.cue',
      'Output/A-D/Dazzling/Dazzling (Track 01).bin',
      'Output/A-D/Dazzling/Dazzling.cue',
      'Output/A-D/Dedicated/Dedicated (Track 01).bin',
      'Output/A-D/Dedicated/Dedicated.cue',
      'Output/A-D/disk1_Cheerful.rom',
      'Output/A-D/disk1_Confident.rom',
      'Output/A-D/disk1_Cool.rom',
    ]],
    [1, 2, [
      'Output/A-A1/Admirable.rom',
      'Output/A-A1/Adorable.rom',
      'Output/A-A2/Adventurous.rom',
      'Output/A-A2/Amazing.rom',
      'Output/A-B/Awesome.rom',
      'Output/A-B/Best.rom',
      'Output/B-D/Brilliant.rom',
      'Output/B-D/Dainty/Dainty (Track 01).bin',
      'Output/B-D/Dainty/Dainty.cue',
      'Output/D-D1/Daring/Daring (Track 01).bin',
      'Output/D-D1/Daring/Daring.cue',
      'Output/D-D1/Dazzling/Dazzling (Track 01).bin',
      'Output/D-D1/Dazzling/Dazzling.cue',
      'Output/D-D2/Dedicated/Dedicated (Track 01).bin',
      'Output/D-D2/Dedicated/Dedicated.cue',
      'Output/D-D2/disk1_Cheerful.rom',
      'Output/D-D3/disk1_Confident.rom',
      'Output/D-D3/disk1_Cool.rom',
    ]],
    [1, 3, [
      'Output/A-A/Admirable.rom',
      'Output/A-A/Adorable.rom',
      'Output/A-A/Adventurous.rom',
      'Output/A-B/Amazing.rom',
      'Output/A-B/Awesome.rom',
      'Output/A-B/Best.rom',
      'Output/B-D/Brilliant.rom',
      'Output/B-D/Dainty/Dainty (Track 01).bin',
      'Output/B-D/Dainty/Dainty.cue',
      'Output/B-D/Daring/Daring (Track 01).bin',
      'Output/B-D/Daring/Daring.cue',
      'Output/D-D1/Dazzling/Dazzling (Track 01).bin',
      'Output/D-D1/Dazzling/Dazzling.cue',
      'Output/D-D1/Dedicated/Dedicated (Track 01).bin',
      'Output/D-D1/Dedicated/Dedicated.cue',
      'Output/D-D1/disk1_Cheerful.rom',
      'Output/D-D2/disk1_Confident.rom',
      'Output/D-D2/disk1_Cool.rom',
    ]],
    [2, 3, [
      'Output/AD-AD/Admirable.rom',
      'Output/AD-AD/Adorable.rom',
      'Output/AD-AD/Adventurous.rom',
      'Output/AM-BE/Amazing.rom',
      'Output/AM-BE/Awesome.rom',
      'Output/AM-BE/Best.rom',
      'Output/BR-DA/Brilliant.rom',
      'Output/BR-DA/Dainty/Dainty (Track 01).bin',
      'Output/BR-DA/Dainty/Dainty.cue',
      'Output/BR-DA/Daring/Daring (Track 01).bin',
      'Output/BR-DA/Daring/Daring.cue',
      'Output/DA-DI/Dazzling/Dazzling (Track 01).bin',
      'Output/DA-DI/Dazzling/Dazzling.cue',
      'Output/DA-DI/Dedicated/Dedicated (Track 01).bin',
      'Output/DA-DI/Dedicated/Dedicated.cue',
      'Output/DA-DI/disk1_Cheerful.rom',
      'Output/DI-DI/disk1_Confident.rom',
      'Output/DI-DI/disk1_Cool.rom',
    ]],
    [3, 4, [
      'Output/ADM-AMA/Admirable.rom',
      'Output/ADM-AMA/Adorable.rom',
      'Output/ADM-AMA/Adventurous.rom',
      'Output/ADM-AMA/Amazing.rom',
      'Output/AWE-DAI/Awesome.rom',
      'Output/AWE-DAI/Best.rom',
      'Output/AWE-DAI/Brilliant.rom',
      'Output/AWE-DAI/Dainty/Dainty (Track 01).bin',
      'Output/AWE-DAI/Dainty/Dainty.cue',
      'Output/DAR-DIS/Daring/Daring (Track 01).bin',
      'Output/DAR-DIS/Daring/Daring.cue',
      'Output/DAR-DIS/Dazzling/Dazzling (Track 01).bin',
      'Output/DAR-DIS/Dazzling/Dazzling.cue',
      'Output/DAR-DIS/Dedicated/Dedicated (Track 01).bin',
      'Output/DAR-DIS/Dedicated/Dedicated.cue',
      'Output/DAR-DIS/disk1_Cheerful.rom',
      'Output/DIS-DIS/disk1_Confident.rom',
      'Output/DIS-DIS/disk1_Cool.rom',
    ]],
  ])('it should group based on count & limit: %s, %s', async (dirLetterCount, dirLetterLimit, expectedFilePaths) => {
    const options = new Options({
      commands: ['copy'],
      output: 'Output',
      dirLetter: true,
      dirLetterCount,
      dirLetterLimit,
      dirLetterGroup: true,
      dirGameSubdir: GameSubdirMode[GameSubdirMode.MULTIPLE].toLowerCase(),
    });

    const parentsToCandidates = await runCandidatePostProcessor(options);

    const outputFilePaths = [...parentsToCandidates.values()]
      .flat()
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .map((romWithFiles) => romWithFiles.getOutputFile().getFilePath())
      .sort();
    expect(outputFilePaths).toEqual(expectedFilePaths);
  });
});
