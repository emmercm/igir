import 'jest-extended';

import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { Semaphore } from 'async-mutex';

import DriveSemaphore from '../../src/async/driveSemaphore.js';
import Logger from '../../src/console/logger.js';
import { LogLevel } from '../../src/console/logLevel.js';
import CandidateGenerator from '../../src/modules/candidates/candidateGenerator.js';
import DATGameInferrer from '../../src/modules/dats/datGameInferrer.js';
import DATScanner from '../../src/modules/dats/datScanner.js';
import Dir2DatCreator from '../../src/modules/dir2DatCreator.js';
import ROMIndexer from '../../src/modules/roms/romIndexer.js';
import ROMScanner from '../../src/modules/roms/romScanner.js';
import FsPoly from '../../src/polyfill/fsPoly.js';
import DAT from '../../src/types/dats/dat.js';
import FileCache from '../../src/types/files/fileCache.js';
import FileFactory from '../../src/types/files/fileFactory.js';
import Options from '../../src/types/options.js';
import WriteCandidate from '../../src/types/writeCandidate.js';
import ProgressBarFake from '../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new PassThrough());

it('should do nothing if dir2dat command not provided', async () => {
  // Given some input ROMs
  const options = new Options({
    // No command provided
    input: ['test/fixtures/roms'],
  });
  const files = await new ROMScanner(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache(), LOGGER),
    new DriveSemaphore(os.cpus().length),
  ).scan();

  // And a DAT
  const inferredDats = await new DATGameInferrer(options, new ProgressBarFake()).infer(files);
  expect(inferredDats).toHaveLength(1);
  const [inferredDat] = inferredDats;

  // And candidates
  const candidates = await new CandidateGenerator(
    options,
    new ProgressBarFake(),
    new Semaphore(os.cpus().length),
  ).generate(inferredDat, new ROMIndexer(options, new ProgressBarFake()).index(files));

  // When writing the DAT to disk
  const dir2dat = await new Dir2DatCreator(options, new ProgressBarFake()).create(
    inferredDat,
    candidates,
  );

  // Then the DAT wasn't written
  expect(dir2dat).toBeUndefined();
});

it('should write a valid DAT', async () => {
  // Given some input ROMs
  const options = new Options({
    commands: ['dir2dat'],
    input: ['test/fixtures/roms'],
  });
  const files = await new ROMScanner(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache(), LOGGER),
    new DriveSemaphore(os.cpus().length),
  ).scan();

  // And a DAT
  const inferredDats = await new DATGameInferrer(options, new ProgressBarFake()).infer(files);
  expect(inferredDats).toHaveLength(1);
  const [inferredDat] = inferredDats;

  // And candidates
  const candidates = await new CandidateGenerator(
    options,
    new ProgressBarFake(),
    new Semaphore(os.cpus().length),
  ).generate(inferredDat, new ROMIndexer(options, new ProgressBarFake()).index(files));

  // When writing the DAT to disk
  const dir2dat = await new Dir2DatCreator(options, new ProgressBarFake()).create(
    inferredDat,
    candidates,
  );

  // Then the written DAT exists
  if (dir2dat === undefined) {
    throw new Error('failed to create dir2dat');
  }

  // And the written DAT can be parsed
  let writtenDat: DAT;
  try {
    await expect(FsPoly.exists(dir2dat)).resolves.toEqual(true);
    const writtenDats = await new DATScanner(
      new Options({
        ...options,
        dat: [dir2dat],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new DriveSemaphore(os.cpus().length),
    ).scan();
    expect(writtenDats).toHaveLength(1);
    [writtenDat] = writtenDats;
  } finally {
    await FsPoly.rm(dir2dat, { force: true });
  }

  // And the written DAT matches the inferred DAT
  expect(writtenDat.getHeader().getName()).toEqual(`${inferredDat.getHeader().getName()} dir2dat`);
  expect(writtenDat.getHeader().getDescription()).toEqual(
    `${inferredDat.getHeader().getDescription()} dir2dat`,
  );
  expect(writtenDat.getParents()).toHaveLength(inferredDat.getParents().length);
  expect(
    writtenDat
      .getParents()
      .map((parent) => parent.getName())
      .sort(),
  ).toEqual(
    inferredDat
      .getParents()
      .map((parent) => parent.getName())
      .sort(),
  );
  expect(writtenDat.getGames()).toHaveLength(inferredDat.getGames().length);
  expect(
    writtenDat
      .getGames()
      .map((game) => game.hashCode())
      .sort(),
  ).toEqual(
    inferredDat
      .getGames()
      .map((game) => game.hashCode())
      .sort(),
  );
});

it('should use the candidates for games and ROMs', async () => {
  // Given some input ROMs
  const options = new Options({
    commands: ['dir2dat'],
    input: [path.join('test', 'fixtures', 'roms')],
  });
  const files = await new ROMScanner(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache(), LOGGER),
    new DriveSemaphore(os.cpus().length),
  ).scan();

  // And a DAT
  const inferredDats = await new DATGameInferrer(options, new ProgressBarFake()).infer(files);
  expect(inferredDats).toHaveLength(1);
  const [inferredDat] = inferredDats;

  // And candidates
  const candidates = await new CandidateGenerator(
    options,
    new ProgressBarFake(),
    new Semaphore(os.cpus().length),
  ).generate(inferredDat, new ROMIndexer(options, new ProgressBarFake()).index(files));

  // When manipulating the candidates
  const updatedCandidates = candidates.map(
    (candidate) =>
      new WriteCandidate(
        candidate.getGame().withProps({ name: `${candidate.getGame().getName()} (updated)` }),
        candidate
          .getRomsWithFiles()
          .map((romWithFiles) =>
            romWithFiles.withRom(
              romWithFiles.getRom().withName(`${romWithFiles.getRom().getName()} (updated)`),
            ),
          ),
      ),
  );

  // When writing the DAT to disk
  const dir2dat = await new Dir2DatCreator(options, new ProgressBarFake()).create(
    inferredDat,
    updatedCandidates,
  );

  // Then the written DAT exists
  if (dir2dat === undefined) {
    throw new Error('failed to create dir2dat');
  }

  // And the written DAT can be parsed
  let writtenDat: DAT;
  try {
    await expect(FsPoly.exists(dir2dat)).resolves.toEqual(true);
    const writtenDats = await new DATScanner(
      new Options({
        ...options,
        dat: [dir2dat],
      }),
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new DriveSemaphore(os.cpus().length),
    ).scan();
    expect(writtenDats).toHaveLength(1);
    [writtenDat] = writtenDats;
  } finally {
    await FsPoly.rm(dir2dat, { force: true });
  }

  // And the written DAT matches the inferred DAT
  expect(writtenDat.getHeader().getName()).toEqual(`${inferredDat.getHeader().getName()} dir2dat`);
  expect(writtenDat.getHeader().getDescription()).toEqual(
    `${inferredDat.getHeader().getDescription()} dir2dat`,
  );
  expect(writtenDat.getParents()).toHaveLength(inferredDat.getParents().length);
  expect(writtenDat.getParents().map((parent) => parent.getName())).not.toIncludeAnyMembers(
    inferredDat.getParents().map((parent) => parent.getName()),
  );
  expect(writtenDat.getGames()).toHaveLength(inferredDat.getGames().length);
  expect(writtenDat.getGames().map((game) => game.hashCode())).not.toIncludeAnyMembers(
    inferredDat.getGames().map((game) => game.hashCode()),
  );
});
