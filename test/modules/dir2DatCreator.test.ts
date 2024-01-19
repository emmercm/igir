import 'jest-extended';

import DATGameInferrer from '../../src/modules/datGameInferrer.js';
import DATScanner from '../../src/modules/datScanner.js';
import Dir2DatCreator from '../../src/modules/dir2DatCreator.js';
import ROMScanner from '../../src/modules/romScanner.js';
import FsPoly from '../../src/polyfill/fsPoly.js';
import DAT from '../../src/types/dats/dat.js';
import Options from '../../src/types/options.js';
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

  // When writing the DAT to disk
  const dir2dat = await new Dir2DatCreator(options, new ProgressBarFake()).create(inferredDat);

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

  // When writing the DAT to disk
  const dir2dat = await new Dir2DatCreator(options, new ProgressBarFake()).create(inferredDat);

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
  expect(writtenDat.getParents().map((parent) => parent.getName()))
    .toIncludeAllMembers(inferredDat.getParents().map((parent) => parent.getName()));
  expect(writtenDat.getGames().map((game) => game.hashCode()))
    .toIncludeAllMembers(inferredDat.getGames().map((game) => game.hashCode()));
});
