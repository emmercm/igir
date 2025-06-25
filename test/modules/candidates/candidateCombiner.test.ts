import path from 'node:path';
import { PassThrough } from 'node:stream';

import { Semaphore } from 'async-mutex';

import DriveSemaphore from '../../../src/async/driveSemaphore.js';
import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import Defaults from '../../../src/globals/defaults.js';
import CandidateCombiner from '../../../src/modules/candidates/candidateCombiner.js';
import CandidateGenerator from '../../../src/modules/candidates/candidateGenerator.js';
import DATCombiner from '../../../src/modules/dats/datCombiner.js';
import DATGameInferrer from '../../../src/modules/dats/datGameInferrer.js';
import ROMIndexer from '../../../src/modules/roms/romIndexer.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import File from '../../../src/types/files/file.js';
import FileCache from '../../../src/types/files/fileCache.js';
import FileFactory from '../../../src/types/files/fileFactory.js';
import Options from '../../../src/types/options.js';
import WriteCandidate from '../../../src/types/writeCandidate.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new PassThrough());

async function runCombinedCandidateGenerator(
  options: Options,
  romFiles: File[],
): Promise<WriteCandidate[]> {
  // Run DATGameInferrer, but condense all DATs down to one
  const dats = await new DATGameInferrer(options, new ProgressBarFake()).infer(romFiles);
  const dat = new DATCombiner(new ProgressBarFake()).combine(dats);

  const indexedRomFiles = new ROMIndexer(options, new ProgressBarFake()).index(romFiles);
  const candidates = await new CandidateGenerator(
    options,
    new ProgressBarFake(),
    new Semaphore(Defaults.MAX_FS_THREADS),
  ).generate(dat, indexedRomFiles);

  return new CandidateCombiner(options, new ProgressBarFake()).combine(dat, candidates);
}

it('should do nothing if option not specified', async () => {
  // Given
  const options = new Options();
  const romFiles = await new ROMScanner(
    new Options({
      input: [path.join('test', 'fixtures', 'roms', 'raw')],
    }),
    new ProgressBarFake(),
    new FileFactory(new FileCache(), LOGGER),
    new DriveSemaphore(Defaults.MAX_FS_THREADS),
  ).scan();

  // When
  const candidates = await runCombinedCandidateGenerator(options, romFiles);

  // Then the map wasn't altered
  expect(candidates).toHaveLength(romFiles.length);
});

it('should do nothing with no files', async () => {
  // Given
  const options = new Options({ zipDatName: true });
  const romFiles: File[] = [];

  // When
  const candidates = await runCombinedCandidateGenerator(options, romFiles);

  // Then the map wasn't altered
  expect(candidates).toHaveLength(romFiles.length);
});

it('should combine candidates', async () => {
  // Given
  const options = new Options({ zipDatName: true });
  const romFiles = await new ROMScanner(
    new Options({
      input: [path.join('test', 'fixtures', 'roms', 'raw')],
    }),
    new ProgressBarFake(),
    new FileFactory(new FileCache(), LOGGER),
    new DriveSemaphore(Defaults.MAX_FS_THREADS),
  ).scan();

  // When
  const candidates = await runCombinedCandidateGenerator(options, romFiles);

  // Then candidates were combined into one
  expect(candidates).toHaveLength(1);

  // And the one candidate has all the ROMs
  expect(candidates).toHaveLength(1);
  expect(candidates[0].getRomsWithFiles()).toHaveLength(romFiles.length);
});
