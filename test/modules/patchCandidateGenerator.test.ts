import path from 'path';

import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import DATInferrer from '../../src/modules/datInferrer.js';
import PatchCandidateGenerator from '../../src/modules/patchCandidateGenerator.js';
import PatchScanner from '../../src/modules/patchScanner.js';
import ROMScanner from '../../src/modules/romScanner.js';
import File from '../../src/types/files/file.js';
import DAT from '../../src/types/logiqx/dat.js';
import Header from '../../src/types/logiqx/header.js';
import Parent from '../../src/types/logiqx/parent.js';
import Options from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ProgressBarFake from '../console/progressBarFake.js';

async function runPatchCandidateGenerator(
  romFiles: File[],
): Promise<Map<Parent, ReleaseCandidate[]>> {
  const options = new Options({
    commands: ['extract'],
    patch: [path.join('test', 'fixtures', 'patches')],
  });

  // Run DATInferrer, but condense all DATs down to one
  const datGames = (await new DATInferrer(new ProgressBarFake()).infer(romFiles))
    .map((dat) => dat.getGames())
    .flatMap((games) => games);
  const dat = new DAT(new Header(), datGames);

  const parentsToCandidates = await new CandidateGenerator(options, new ProgressBarFake())
    .generate(dat, romFiles);

  const patches = await new PatchScanner(options, new ProgressBarFake()).scan();

  return new PatchCandidateGenerator(new ProgressBarFake())
    .generate(dat, parentsToCandidates, patches);
}

it('should do nothing with no parents', async () => {
  const parentsToCandidates = await runPatchCandidateGenerator([]);
  expect(parentsToCandidates.size).toEqual(0);
});

it('should do nothing with no relevant patches', async () => {
  const romFiles = await new ROMScanner(new Options({
    input: [path.join('test', 'fixtures', 'roms', 'headered')],
  }), new ProgressBarFake()).scan();
  const parentsToCandidates = await runPatchCandidateGenerator(romFiles);

  expect(parentsToCandidates.size).toEqual(6);
  [...parentsToCandidates.values()]
    .forEach((releaseCandidates) => expect(releaseCandidates).toHaveLength(1));
});

it('should create patch candidates with relevant patches', async () => {
  // Given
  const romFiles = await new ROMScanner(new Options({
    input: [path.join('test', 'fixtures', 'roms', 'patchable')],
  }), new ProgressBarFake()).scan();

  // When
  const parentsToCandidates = await runPatchCandidateGenerator(romFiles);

  // Then parents have doubled
  expect(parentsToCandidates.size).toEqual(romFiles.length * 2);
  [...parentsToCandidates.values()]
    .forEach((releaseCandidates) => expect(releaseCandidates).toHaveLength(1));
});
