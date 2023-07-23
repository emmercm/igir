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
    'Output/Admirable.rom',
    'Output/Adorable.rom',
    'Output/Adventurous.rom',
    'Output/Amazing.rom',
    'Output/Awesome.rom',
    'Output/Best.rom',
    'Output/Brilliant.rom',
    'Output/Cheerful.rom',
    'Output/Confident.rom',
    'Output/Cool.rom',
  ]);
});

describe('dirLetterLimit', () => {
  test.each([
    [undefined, [
      'Output/A/Admirable.rom',
      'Output/A/Adorable.rom',
      'Output/A/Adventurous.rom',
      'Output/A/Amazing.rom',
      'Output/A/Awesome.rom',
      'Output/B/Best.rom',
      'Output/B/Brilliant.rom',
      'Output/C/Cheerful.rom',
      'Output/C/Confident.rom',
      'Output/C/Cool.rom',
    ]],
    [2, [
      'Output/A1/Admirable.rom',
      'Output/A1/Adorable.rom',
      'Output/A2/Adventurous.rom',
      'Output/A2/Amazing.rom',
      'Output/A3/Awesome.rom',
      'Output/B/Best.rom',
      'Output/B/Brilliant.rom',
      'Output/C1/Cheerful.rom',
      'Output/C1/Confident.rom',
      'Output/C2/Cool.rom',
    ]],
    [3, [
      'Output/A1/Admirable.rom',
      'Output/A1/Adorable.rom',
      'Output/A1/Adventurous.rom',
      'Output/A2/Amazing.rom',
      'Output/A2/Awesome.rom',
      'Output/B/Best.rom',
      'Output/B/Brilliant.rom',
      'Output/C/Cheerful.rom',
      'Output/C/Confident.rom',
      'Output/C/Cool.rom',
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
