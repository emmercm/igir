import 'jest-extended';

import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import DATGameInferrer from '../../src/modules/datGameInferrer.js';
import DATScanner from '../../src/modules/datScanner.js';
import Dir2DatCreator from '../../src/modules/dir2DatCreator.js';
import ROMIndexer from '../../src/modules/romIndexer.js';
import ROMScanner from '../../src/modules/romScanner.js';
import FsPoly from '../../src/polyfill/fsPoly.js';
import DAT from '../../src/types/dats/dat.js';
import Options from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
import ProgressBarFake from '../console/progressBarFake.js';

it('should do nothing if dir2dat command not provided', async () => {
  // Given some input ROMs
  const options = new Options({
    // No command provided
    input: ['test/fixtures/roms'],
  });
  const files = await new ROMScanner(options, new ProgressBarFake()).scan();

  // And a DAT
  const inferredDats = new DATGameInferrer(options, new ProgressBarFake()).infer(files);
  expect(inferredDats).toHaveLength(1);
  const [inferredDat] = inferredDats;

  // And candidates
  const candidates = await new CandidateGenerator(options, new ProgressBarFake()).generate(
    inferredDat,
    await new ROMIndexer(options, new ProgressBarFake()).index(files),
  );

  // When writing the DAT to disk
  const dir2dat = await new Dir2DatCreator(options, new ProgressBarFake())
    .create(inferredDat, candidates);

  // Then the DAT wasn't written
  expect(dir2dat).toBeUndefined();
});

it('should write a valid DAT', async () => {
  // Given some input ROMs
  const options = new Options({
    commands: ['dir2dat'],
    input: ['test/fixtures/roms'],
  });
  const files = await new ROMScanner(options, new ProgressBarFake()).scan();

  // And a DAT
  const inferredDats = new DATGameInferrer(options, new ProgressBarFake()).infer(files);
  expect(inferredDats).toHaveLength(1);
  const [inferredDat] = inferredDats;

  // And candidates
  const candidates = await new CandidateGenerator(options, new ProgressBarFake()).generate(
    inferredDat,
    await new ROMIndexer(options, new ProgressBarFake()).index(files),
  );

  // When writing the DAT to disk
  const dir2dat = await new Dir2DatCreator(options, new ProgressBarFake())
    .create(inferredDat, candidates);

  // Then the written DAT exists
  if (dir2dat === undefined) {
    throw new Error('failed to create dir2dat');
  }

  // And the written DAT can be parsed
  let writtenDat: DAT;
  try {
    await expect(FsPoly.exists(dir2dat)).resolves.toEqual(true);
    const writtenDats = await new DATScanner(new Options({
      ...options,
      dat: [dir2dat],
    }), new ProgressBarFake()).scan();
    expect(writtenDats).toHaveLength(1);
    [writtenDat] = writtenDats;
  } finally {
    await FsPoly.rm(dir2dat, { force: true });
  }

  // And the written DAT matches the inferred DAT
  expect(writtenDat.getHeader().toString())
    .toEqual(inferredDat.getHeader().toString());
  expect(writtenDat.getParents()).toHaveLength(inferredDat.getParents().length);
  expect(writtenDat.getParents().map((parent) => parent.getName()))
    .toIncludeAllMembers(inferredDat.getParents().map((parent) => parent.getName()));
  expect(writtenDat.getGames()).toHaveLength(inferredDat.getGames().length);
  expect(writtenDat.getGames().map((game) => game.hashCode()))
    .toIncludeAllMembers(inferredDat.getGames().map((game) => game.hashCode()));
});

it('should use the candidates for games and ROMs', async () => {
  // Given some input ROMs
  const options = new Options({
    commands: ['dir2dat'],
    input: ['test/fixtures/roms'],
  });
  const files = await new ROMScanner(options, new ProgressBarFake()).scan();

  // And a DAT
  const inferredDats = new DATGameInferrer(options, new ProgressBarFake()).infer(files);
  expect(inferredDats).toHaveLength(1);
  const [inferredDat] = inferredDats;

  // And candidates
  const candidates = await new CandidateGenerator(options, new ProgressBarFake()).generate(
    inferredDat,
    await new ROMIndexer(options, new ProgressBarFake()).index(files),
  );

  // When manipulating the candidates
  const updatedCandidates = new Map([...candidates.entries()].map(([parent, releaseCandidates]) => [
    parent,
    releaseCandidates.map((candidate) => new ReleaseCandidate(
      candidate.getGame().withProps({ name: `${candidate.getGame().getName()} (updated)` }),
      candidate.getRelease(),
      candidate.getRomsWithFiles().map((romWithFiles) => new ROMWithFiles(
        romWithFiles.getRom().withName(`${romWithFiles.getRom().getName()} (updated)`),
        romWithFiles.getInputFile(),
        romWithFiles.getOutputFile(),
      )),
    ))]));

  // When writing the DAT to disk
  const dir2dat = await new Dir2DatCreator(options, new ProgressBarFake())
    .create(inferredDat, updatedCandidates);

  // Then the written DAT exists
  if (dir2dat === undefined) {
    throw new Error('failed to create dir2dat');
  }

  // And the written DAT can be parsed
  let writtenDat: DAT;
  try {
    await expect(FsPoly.exists(dir2dat)).resolves.toEqual(true);
    const writtenDats = await new DATScanner(new Options({
      ...options,
      dat: [dir2dat],
    }), new ProgressBarFake()).scan();
    expect(writtenDats).toHaveLength(1);
    [writtenDat] = writtenDats;
  } finally {
    await FsPoly.rm(dir2dat, { force: true });
  }

  // And the written DAT matches the inferred DAT
  expect(writtenDat.getHeader().toString())
    .toEqual(inferredDat.getHeader().toString());
  expect(writtenDat.getParents()).toHaveLength(inferredDat.getParents().length);
  expect(writtenDat.getParents().map((parent) => parent.getName()))
    .not.toIncludeAnyMembers(inferredDat.getParents().map((parent) => parent.getName()));
  expect(writtenDat.getGames()).toHaveLength(inferredDat.getGames().length);
  expect(writtenDat.getGames().map((game) => game.hashCode()))
    .not.toIncludeAnyMembers(inferredDat.getGames().map((game) => game.hashCode()));
});
