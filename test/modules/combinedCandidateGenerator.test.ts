import path from 'path';

import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import CombinedCandidateGenerator from '../../src/modules/combinedCandidateGenerator.js';
import DATInferrer from '../../src/modules/datInferrer.js';
import ROMScanner from '../../src/modules/romScanner.js';
import File from '../../src/types/files/file.js';
import DAT from '../../src/types/logiqx/dat.js';
import Header from '../../src/types/logiqx/header.js';
import Parent from '../../src/types/logiqx/parent.js';
import Options from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ProgressBarFake from '../console/progressBarFake.js';

async function runCombinedCandidateGenerator(
  options: Options,
  romFiles: File[],
): Promise<Map<Parent, ReleaseCandidate[]>> {
  // Run DATInferrer, but condense all DATs down to one
  const datGames = (await new DATInferrer(new ProgressBarFake()).infer(romFiles))
    .map((dat) => dat.getGames())
    .flatMap((games) => games);
  const dat = new DAT(new Header(), datGames);

  const parentsToCandidates = await new CandidateGenerator(options, new ProgressBarFake())
    .generate(dat, romFiles);

  return new CombinedCandidateGenerator(options, new ProgressBarFake())
    .generate(dat, parentsToCandidates);
}

it('should do nothing if option not specified', async () => {
  // Given
  const options = new Options();
  const romFiles = await new ROMScanner(new Options({
    input: [path.join('test', 'fixtures', 'roms', 'raw')],
  }), new ProgressBarFake()).scan();

  // When
  const parentsToCandidates = await runCombinedCandidateGenerator(options, romFiles);

  // Then the map wasn't altered
  expect(parentsToCandidates.size).toEqual(romFiles.length);
});

it('should do nothing with no parents', async () => {
  // Given
  const options = new Options({ zipDatName: true });
  const romFiles: File[] = [];

  // When
  const parentsToCandidates = await runCombinedCandidateGenerator(options, romFiles);

  // Then the map wasn't altered
  expect(parentsToCandidates.size).toEqual(romFiles.length);
});

it('should', async () => {
  // Given
  const options = new Options({ zipDatName: true });
  const romFiles = await new ROMScanner(new Options({
    input: [path.join('test', 'fixtures', 'roms', 'raw')],
  }), new ProgressBarFake()).scan();

  // When
  const parentsToCandidates = await runCombinedCandidateGenerator(options, romFiles);

  // Then parents were combined into one
  expect(parentsToCandidates.size).toEqual(1);

  // And the one parent has one candidate with all the ROMs
  const candidates = [...parentsToCandidates.values()][0];
  expect(candidates).toHaveLength(1);
  expect(candidates[0].getRomsWithFiles()).toHaveLength(romFiles.length);
});
