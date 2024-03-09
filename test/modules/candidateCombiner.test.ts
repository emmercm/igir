import path from 'node:path';

import CandidateCombiner from '../../src/modules/candidateCombiner.js';
import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import DATCombiner from '../../src/modules/datCombiner.js';
import DATGameInferrer from '../../src/modules/datGameInferrer.js';
import ROMIndexer from '../../src/modules/romIndexer.js';
import ROMScanner from '../../src/modules/romScanner.js';
import Parent from '../../src/types/dats/parent.js';
import File from '../../src/types/files/file.js';
import Options from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ProgressBarFake from '../console/progressBarFake.js';

async function runCombinedCandidateGenerator(
  options: Options,
  romFiles: File[],
): Promise<Map<Parent, ReleaseCandidate[]>> {
  // Run DATGameInferrer, but condense all DATs down to one
  const dats = new DATGameInferrer(options, new ProgressBarFake()).infer(romFiles);
  const dat = new DATCombiner(new ProgressBarFake()).combine(dats);

  const indexedRomFiles = await new ROMIndexer(options, new ProgressBarFake()).index(romFiles);
  const parentsToCandidates = await new CandidateGenerator(options, new ProgressBarFake())
    .generate(dat, indexedRomFiles);

  return new CandidateCombiner(options, new ProgressBarFake())
    .combine(dat, parentsToCandidates);
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
