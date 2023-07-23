import path from 'path';

import CandidatePostProcessor from '../../src/modules/candidatePostProcessor.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import Parent from '../../src/types/logiqx/parent.js';
import ROM from '../../src/types/logiqx/rom.js';
import Options from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
import ProgressBarFake from '../console/progressBarFake.js';

const games = [
  'Admirable',
  'Adorable',
  'Adventurous',
  'Amazing',
  'Awesome',
  'Best',
  'Brilliant',
  'Cheerful',
  'Confident',
  'Cool',
].map((name) => new Game({
  name,
  rom: new ROM(`${name}.rom`, 0, '00000000'),
}));
const dat = new DAT(new Header(), games);

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
  });

  const parentsToCandidates = await runCandidatePostProcessor(options);

  const outputFilePaths = [...parentsToCandidates.values()]
    .flatMap((releaseCandidates) => releaseCandidates)
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
    path.join('Output', 'Cheerful.rom'),
    path.join('Output', 'Confident.rom'),
    path.join('Output', 'Cool.rom'),
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
      path.join('Output', 'C', 'Cheerful.rom'),
      path.join('Output', 'C', 'Confident.rom'),
      path.join('Output', 'C', 'Cool.rom'),
    ]],
    [2, [
      path.join('Output', 'A1', 'Admirable.rom'),
      path.join('Output', 'A1', 'Adorable.rom'),
      path.join('Output', 'A2', 'Adventurous.rom'),
      path.join('Output', 'A2', 'Amazing.rom'),
      path.join('Output', 'A3', 'Awesome.rom'),
      path.join('Output', 'B', 'Best.rom'),
      path.join('Output', 'B', 'Brilliant.rom'),
      path.join('Output', 'C1', 'Cheerful.rom'),
      path.join('Output', 'C1', 'Confident.rom'),
      path.join('Output', 'C2', 'Cool.rom'),
    ]],
    [3, [
      path.join('Output', 'A1', 'Admirable.rom'),
      path.join('Output', 'A1', 'Adorable.rom'),
      path.join('Output', 'A1', 'Adventurous.rom'),
      path.join('Output', 'A2', 'Amazing.rom'),
      path.join('Output', 'A2', 'Awesome.rom'),
      path.join('Output', 'B', 'Best.rom'),
      path.join('Output', 'B', 'Brilliant.rom'),
      path.join('Output', 'C', 'Cheerful.rom'),
      path.join('Output', 'C', 'Confident.rom'),
      path.join('Output', 'C', 'Cool.rom'),
    ]],
  ])('it should split the letter dirs: %s', async (limit, expectedFilePaths) => {
    const options = new Options({
      commands: ['copy'],
      output: 'Output',
      dirLetter: true,
      dirLetterLimit: limit,
    });

    const parentsToCandidates = await runCandidatePostProcessor(options);

    const outputFilePaths = [...parentsToCandidates.values()]
      .flatMap((releaseCandidates) => releaseCandidates)
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .map((romWithFiles) => romWithFiles.getOutputFile().getFilePath())
      .sort();
    expect(outputFilePaths).toEqual(expectedFilePaths);
  });
});
