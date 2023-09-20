import path from 'node:path';

import CandidateCombiner from '../../src/modules/candidateCombiner.js';
import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import DATInferrer from '../../src/modules/datInferrer.js';
import FileIndexer from '../../src/modules/fileIndexer.js';
import ROMScanner from '../../src/modules/romScanner.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import Parent from '../../src/types/dats/parent.js';
import File from '../../src/types/files/file.js';
import Options from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ProgressBarFake from '../console/progressBarFake.js';

async function runCombinedCandidateGenerator(
  options: Options,
  romFiles: File[],
): Promise<Map<Parent, ReleaseCandidate[]>> {
  // Run DATInferrer, but condense all DATs down to one
  const datGames = new DATInferrer(new ProgressBarFake()).infer(romFiles)
    .map((dat) => dat.getGames())
    .flatMap((games) => games);
  const dat = new LogiqxDAT(new Header(), datGames);

  const indexedRomFiles = await new FileIndexer(options, new ProgressBarFake()).index(romFiles);
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
