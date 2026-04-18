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
import Game from '../../../src/types/dats/game.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import ROM from '../../../src/types/dats/rom.js';
import SingleValueGame from '../../../src/types/dats/singleValueGame.js';
import ArchiveEntry from '../../../src/types/files/archives/archiveEntry.js';
import ArchiveFile from '../../../src/types/files/archives/archiveFile.js';
import Zip from '../../../src/types/files/archives/zip.js';
import File from '../../../src/types/files/file.js';
import FileCache from '../../../src/types/files/fileCache.js';
import FileFactory from '../../../src/types/files/fileFactory.js';
import type { OptionsProps } from '../../../src/types/options.js';
import Options from '../../../src/types/options.js';
import IPSPatch from '../../../src/types/patches/ipsPatch.js';
import ROMWithFiles from '../../../src/types/romWithFiles.js';
import WriteCandidate from '../../../src/types/writeCandidate.js';
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

describe('with archive file inputs', () => {
  // ROM and DAT both use CRC 0361b321, matching the "After 0361b321.ips" patch fixture
  const romCrc = '0361b321';
  const rom = new ROM({ name: 'before.rom', size: 7, crc32: romCrc });
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [new Game({ name: 'before', roms: [rom] })],
  });

  const patch = File.fileOf({
    filePath: path.join('test', 'fixtures', 'patches', 'After 0361b321.ips'),
  }).then((file) => IPSPatch.patchFrom(file));

  it('should not create patch candidates for archive inputs when not zipping', async () => {
    // Given a candidate with an ArchiveFile input whose inner entry CRC matches a patch,
    // but the command is copy (without zip), so patching the archive is not possible
    const options = new Options({ commands: ['copy'] });
    const archiveEntry = await ArchiveEntry.entryOf({
      archive: new Zip('input.zip'),
      entryPath: 'before.rom',
      size: 7,
      crc32: romCrc,
    });
    const candidate = new WriteCandidate(new SingleValueGame({ name: 'before', roms: [rom] }), [
      new ROMWithFiles(
        rom,
        new ArchiveFile(archiveEntry, { size: 100 }),
        await ArchiveEntry.entryOf({
          archive: new Zip('output.zip'),
          entryPath: 'before.rom',
          size: 7,
          crc32: romCrc,
        }),
      ),
    ]);

    // When generating patched candidates
    const result = new CandidatePatchGenerator(options, new ProgressBarFake()).generate(
      dat,
      [candidate],
      [await patch],
    );

    // Then no patched candidates should be added because ArchiveFile inputs
    // cannot be patched without zipping
    expect(result).toHaveLength(1);
    result.forEach((c) => {
      c.getRomsWithFiles().forEach((romWithFiles) => {
        expect(romWithFiles.getInputFile().getPatch()).toBeUndefined();
      });
    });
  });

  it('should create patch candidates for archive inputs when zipping', async () => {
    // Given a candidate with an ArchiveFile input whose inner entry CRC matches a patch,
    // and the command is zip, so patching the archive entry is possible
    const options = new Options({ commands: ['zip'] });
    const archiveEntry = await ArchiveEntry.entryOf({
      archive: new Zip('input.zip'),
      entryPath: 'before.rom',
      size: 7,
      crc32: romCrc,
    });
    const candidate = new WriteCandidate(new SingleValueGame({ name: 'before', roms: [rom] }), [
      new ROMWithFiles(
        rom,
        new ArchiveFile(archiveEntry, { size: 100 }),
        await ArchiveEntry.entryOf({
          archive: new Zip('output.zip'),
          entryPath: 'before.rom',
          size: 7,
          crc32: romCrc,
        }),
      ),
    ]);

    // When generating patched candidates
    const result = new CandidatePatchGenerator(options, new ProgressBarFake()).generate(
      dat,
      [candidate],
      [await patch],
    );

    // Then patched candidates should be added alongside the original
    expect(result.length).toEqual(2);
    const patchedCandidates = result.filter((writeCandidate) =>
      writeCandidate
        .getRomsWithFiles()
        .some((romWithFiles) => romWithFiles.getInputFile().getPatch() !== undefined),
    );
    expect(patchedCandidates.length).toEqual(1);

    patchedCandidates.forEach((writeCandidate) => {
      writeCandidate.getRomsWithFiles().forEach((romWithFiles) => {
        // and patched candidates' input files should be converted from ArchiveFile to ArchiveEntry
        expect(romWithFiles.getInputFile()).toBeInstanceOf(ArchiveEntry);

        // and patched candidates' output files should be ArchiveEntry backed by a Zip archive
        const outputFile = romWithFiles.getOutputFile();
        expect(outputFile).toBeInstanceOf(ArchiveEntry);
        expect((outputFile as ArchiveEntry<Zip>).getArchive()).toBeInstanceOf(Zip);
      });
    });
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
