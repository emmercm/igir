import os from 'node:os';
import path from 'node:path';
import stream from 'node:stream';

import MappableSemaphore from '../../../src/async/mappableSemaphore.js';
import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import CandidateGenerator from '../../../src/modules/candidates/candidateGenerator.js';
import CandidatePatchGenerator from '../../../src/modules/candidates/candidatePatchGenerator.js';
import DATCombiner from '../../../src/modules/dats/datCombiner.js';
import DATGameInferrer from '../../../src/modules/dats/datGameInferrer.js';
import DATScanner from '../../../src/modules/dats/datScanner.js';
import PatchScanner from '../../../src/modules/patchScanner.js';
import ROMIndexer from '../../../src/modules/roms/romIndexer.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import type DAT from '../../../src/types/dats/dat.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import ArchiveEntry from '../../../src/types/files/archives/archiveEntry.js';
import ArchiveFile from '../../../src/types/files/archives/archiveFile.js';
import type File from '../../../src/types/files/file.js';
import FileCache from '../../../src/types/files/fileCache.js';
import FileFactory from '../../../src/types/files/fileFactory.js';
import type { OptionsProps } from '../../../src/types/options.js';
import Options from '../../../src/types/options.js';
import type WriteCandidate from '../../../src/types/writeCandidate.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new stream.PassThrough());

// Run DATGameInferrer, but condense all DATs down to one
async function buildInferredDat(options: Options, romFiles: File[]): Promise<DAT> {
  const dats = await new DATGameInferrer(options, new ProgressBarFake()).infer(romFiles);
  return new DATCombiner(new ProgressBarFake()).combine(dats);
}

async function runPatchCandidateGenerator(
  optionsProps: OptionsProps,
  dat: DAT,
  romFiles: File[],
): Promise<WriteCandidate[]> {
  const options = new Options({
    ...optionsProps,
    patch: [path.join('test', 'fixtures', 'patches')],
  });

  const indexedRomFiles = new ROMIndexer(options, new ProgressBarFake()).index(romFiles);
  const candidates = await new CandidateGenerator(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache(), LOGGER),
    new MappableSemaphore(os.availableParallelism()),
  ).generate(dat, indexedRomFiles);

  const patches = await new PatchScanner(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache(), LOGGER),
    new MappableSemaphore(os.availableParallelism()),
  ).scan();

  return new CandidatePatchGenerator(options, new ProgressBarFake()).generate(
    dat,
    candidates,
    patches,
  );
}

it('should do nothing with no games', async () => {
  // Given
  const dat = new LogiqxDAT({ header: new Header() });

  // When
  const candidates = await runPatchCandidateGenerator({}, dat, []);

  // Then
  expect(candidates).toHaveLength(0);
});

describe('with inferred DATs', () => {
  it('should do nothing with no relevant patches', async () => {
    // Given
    const options = new Options({
      commands: ['extract'],
      input: [path.join('test', 'fixtures', 'roms', 'headered')],
    });
    const romFiles = await new ROMScanner(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new MappableSemaphore(os.availableParallelism()),
    ).scan();
    const dat = await buildInferredDat(options, romFiles);

    // When
    const candidates = await runPatchCandidateGenerator(options, dat, romFiles);

    // Then
    expect(candidates).toHaveLength(6);
  });

  it('should create patch candidates with relevant patches when extracting', async () => {
    // Given
    const options = new Options({
      commands: ['extract'],
      input: [path.join('test', 'fixtures', 'roms', 'patchable')],
    });
    const romFiles = await new ROMScanner(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new MappableSemaphore(os.availableParallelism()),
    ).scan();
    const dat = await buildInferredDat(options, romFiles);

    // When
    const candidates = await runPatchCandidateGenerator(options, dat, romFiles);

    // Then candidates have doubled
    expect(candidates).toHaveLength(romFiles.length * 2);
    expect(
      candidates.some((candidate) =>
        candidate
          .getRomsWithFiles()
          .some((romWithFiles) => romWithFiles.getInputFile().getPatch() === undefined),
      ),
    ).toEqual(true);
    expect(
      candidates.some((candidate) =>
        candidate
          .getRomsWithFiles()
          .some((romWithFiles) => romWithFiles.getInputFile().getPatch() !== undefined),
      ),
    ).toEqual(true);
  });

  it('should create patch candidates with relevant patches when zipping', async () => {
    // Given
    const options = new Options({
      commands: ['zip'],
      input: [path.join('test', 'fixtures', 'roms', 'patchable')],
    });
    const romFiles = await new ROMScanner(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new MappableSemaphore(os.availableParallelism()),
    ).scan();
    const dat = await buildInferredDat(options, romFiles);

    // When
    const candidates = await runPatchCandidateGenerator(options, dat, romFiles);

    // Then - patched candidates should exist (patches matched against raw file inputs)
    expect(candidates).toHaveLength(romFiles.length * 2);
    const patchedCandidates = candidates.filter((candidate) =>
      candidate
        .getRomsWithFiles()
        .some((romWithFiles) => romWithFiles.getInputFile().getPatch() !== undefined),
    );
    expect(patchedCandidates.length).toBeGreaterThan(0);

    // Then - patched candidates' output files should be ArchiveEntry (zip mode)
    patchedCandidates.forEach((candidate) => {
      candidate.getRomsWithFiles().forEach((romWithFiles) => {
        expect(romWithFiles.getOutputFile()).toBeInstanceOf(ArchiveEntry);
      });
    });

    // Then - no input file should be an ArchiveFile (they should remain as-is or be
    // converted to ArchiveEntry)
    candidates.forEach((candidate) => {
      candidate.getRomsWithFiles().forEach((romWithFiles) => {
        expect(romWithFiles.getInputFile()).not.toBeInstanceOf(ArchiveFile);
      });
    });
  });

  it('should only create patch candidates with relevant patches', async () => {
    // Given
    const options = new Options({
      commands: ['extract'],
      input: [path.join('test', 'fixtures', 'roms', 'patchable')],
      patchOnly: true,
    });
    const romFiles = await new ROMScanner(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new MappableSemaphore(os.cpus().length),
    ).scan();
    const dat = await buildInferredDat(options, romFiles);

    // When
    const candidates = await runPatchCandidateGenerator(options, dat, romFiles);

    // Then candidate count has remained the same
    expect(candidates).toHaveLength(romFiles.length);
    expect(
      candidates.every((candidate) =>
        candidate
          .getRomsWithFiles()
          .every((romWithFiles) => romWithFiles.getInputFile().getPatch() !== undefined),
      ),
    ).toEqual(true);
  });
});

describe('with explicit DATs', () => {
  it('should maintain game and ROM paths from HTGD DATs', async () => {
    // Given
    const options = new Options({
      dat: [path.join('test', 'fixtures', 'dats', 'smdb*')],
      input: [path.join('test', 'fixtures', 'roms', 'patchable')],
    });
    const dat = (
      await new DATScanner(
        options,
        new ProgressBarFake(),
        new FileFactory(new FileCache(), LOGGER),
        new MappableSemaphore(os.availableParallelism()),
      ).scan()
    )[0];
    const romFiles = await new ROMScanner(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache(), LOGGER),
      new MappableSemaphore(os.availableParallelism()),
    ).scan();

    // And pre-assert all Game names and ROM names have path separators in them
    const totalRoms = dat.getGames().reduce((gameSum, game) => gameSum + game.getRoms().length, 0);
    expect(totalRoms).toBeGreaterThan(0);
    dat.getGames().forEach((game) => {
      expect(/[\\/]/.exec(game.getName())).toBeTruthy();
      game.getRoms().forEach((rom) => {
        expect(/[\\/]/.exec(rom.getName())).toBeTruthy();
      });
    });

    // When
    const candidates = await runPatchCandidateGenerator(options, dat, romFiles);

    // Then all Game names and ROM names should maintain their path separators
    candidates.forEach((candidate) => {
      expect(/[\\/]/.exec(candidate.getGame().getName())).toBeTruthy();
      candidate.getRomsWithFiles().forEach((romWithFiles) => {
        expect(/[\\/]/.exec(romWithFiles.getRom().getName())).toBeTruthy();
      });
    });
  });
});
