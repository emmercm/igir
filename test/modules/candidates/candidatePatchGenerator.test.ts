import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import MappableSemaphore from '../../../src/async/mappableSemaphore.js';
import FileCache from '../../../src/cache/fileCache.js';
import FileFactory from '../../../src/factories/fileFactory.js';
import type DAT from '../../../src/models/dats/dat.js';
import Game from '../../../src/models/dats/game.js';
import Header from '../../../src/models/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/models/dats/logiqx/logiqxDat.js';
import ROM from '../../../src/models/dats/rom.js';
import ArchiveEntry from '../../../src/models/files/archives/archiveEntry.js';
import ArchiveFile from '../../../src/models/files/archives/archiveFile.js';
import Zip from '../../../src/models/files/archives/zip.js';
import File from '../../../src/models/files/file.js';
import type { OptionsProps } from '../../../src/models/options.js';
import Options from '../../../src/models/options.js';
import IPSPatch from '../../../src/models/patches/ipsPatch.js';
import ROMWithFiles from '../../../src/models/romWithFiles.js';
import WriteCandidate from '../../../src/models/writeCandidate.js';
import CandidateGenerator from '../../../src/modules/candidates/candidateGenerator.js';
import CandidatePatchGenerator from '../../../src/modules/candidates/candidatePatchGenerator.js';
import DATCombiner from '../../../src/modules/dats/datCombiner.js';
import DATGameInferrer from '../../../src/modules/dats/datGameInferrer.js';
import DATScanner from '../../../src/modules/dats/datScanner.js';
import PatchScanner from '../../../src/modules/patchScanner.js';
import ROMIndexer from '../../../src/modules/roms/romIndexer.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import ProgressBarFake from '../../console/progressBarFake.js';

// Every file in test/fixtures/patches matches exactly one ROM in test/fixtures/roms/patchable
const patchFixtureCount = 47;

interface PatchedCandidate {
  gameName: string;
  inputFileName: string;
  patchFileName: string;
}

/**
 * Return every ROM in {@link candidates} that has a patch, sorted by patch file name.
 */
function getPatchedCandidates(candidates: WriteCandidate[]): PatchedCandidate[] {
  return candidates
    .flatMap((candidate) =>
      candidate.getRomsWithFiles().flatMap((romWithFiles) => {
        const patch = romWithFiles.getInputFile().getPatch();
        if (patch === undefined) {
          return [];
        }
        return [
          {
            gameName: candidate.getGame().getName(),
            inputFileName: path.basename(romWithFiles.getInputFile().getFilePath()),
            patchFileName: path.basename(patch.getFile().getFilePath()),
          },
        ];
      }),
    )
    .toSorted((one, two) => one.patchFileName.localeCompare(two.patchFileName));
}

/**
 * Return the names of the games in {@link candidates} that have no patched ROMs, sorted.
 */
function getUnpatchedGameNames(candidates: WriteCandidate[]): string[] {
  return candidates
    .filter((candidate) =>
      candidate
        .getRomsWithFiles()
        .every((romWithFiles) => romWithFiles.getInputFile().getPatch() === undefined),
    )
    .map((candidate) => candidate.getGame().getName())
    .toSorted((one, two) => one.localeCompare(two));
}

/**
 * Return the patched ROM expected for every patch fixture. Each patch fixture's directory is
 * named after the test/fixtures/roms/patchable ROM it patches.
 */
async function getExpectedPatchedCandidates(): Promise<PatchedCandidate[]> {
  const patchesDir = path.join('test', 'fixtures', 'patches');
  const inputFileNames: Record<string, string> = {
    grow: 'grow.rom',
    large: 'large.rom',
    modify: 'modify.rom',
    pmsr: 'pmsr.zip',
    shrink: 'shrink.gz',
  };
  const patchedCandidates = await Promise.all(
    Object.entries(inputFileNames).map(async ([romName, inputFileName]) =>
      (await fs.promises.readdir(path.join(patchesDir, romName))).map((patchFileName) => ({
        // Patched games are named after the patch, without its CRC
        gameName: path.parse(patchFileName).name.replace(/ [0-9a-f]{8}$/, ''),
        inputFileName,
        patchFileName,
      })),
    ),
  );
  return patchedCandidates
    .flat()
    .toSorted((one, two) => one.patchFileName.localeCompare(two.patchFileName));
}

// Run DATGameInferrer, but condense all DATs down to one
async function buildInferredDat(options: Options, romFiles: File[]): Promise<DAT> {
  const dats = await new DATGameInferrer(
    options,
    new ProgressBarFake(),
    new MappableSemaphore(os.availableParallelism()),
  ).infer(romFiles);
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
    new FileFactory(new FileCache()),
    new MappableSemaphore(os.availableParallelism()),
  ).generate(dat, indexedRomFiles);

  const patches = await new PatchScanner(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache()),
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
      new FileFactory(new FileCache()),
      new MappableSemaphore(os.availableParallelism()),
    ).scan();
    const dat = await buildInferredDat(options, romFiles);

    // When
    const candidates = await runPatchCandidateGenerator(options, dat, romFiles);

    // Then
    expect(candidates).toHaveLength(6);
    expect(getPatchedCandidates(candidates)).toEqual([]);
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
      new FileFactory(new FileCache()),
      new MappableSemaphore(os.availableParallelism()),
    ).scan();
    const dat = await buildInferredDat(options, romFiles);

    // When
    const candidates = await runPatchCandidateGenerator(options, dat, romFiles);

    // Then patched candidates were added
    expect(candidates).toHaveLength(romFiles.length + patchFixtureCount);
    expect(getUnpatchedGameNames(candidates)).toEqual([
      'grow',
      'large',
      'modify',
      'pmsr',
      'shrink',
    ]);
    expect(getPatchedCandidates(candidates)).toEqual(await getExpectedPatchedCandidates());
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
      new FileFactory(new FileCache()),
      new MappableSemaphore(os.availableParallelism()),
    ).scan();
    const dat = await buildInferredDat(options, romFiles);

    // When
    const candidates = await runPatchCandidateGenerator(options, dat, romFiles);

    // Then - patched candidates should exist (patches matched against raw file inputs)
    expect(candidates).toHaveLength(romFiles.length + patchFixtureCount);
    expect(getUnpatchedGameNames(candidates)).toEqual([
      'grow',
      'large',
      'modify',
      'pmsr',
      'shrink',
    ]);
    expect(getPatchedCandidates(candidates)).toEqual(await getExpectedPatchedCandidates());
    const patchedCandidates = candidates.filter((candidate) =>
      candidate
        .getRomsWithFiles()
        .some((romWithFiles) => romWithFiles.getInputFile().getPatch() !== undefined),
    );

    // Then - patched candidates' output files should be ArchiveEntry (zip mode)
    for (const candidate of patchedCandidates) {
      for (const romWithFiles of candidate.getRomsWithFiles()) {
        expect(romWithFiles.getOutputFile()).toBeInstanceOf(ArchiveEntry);
      }
    }

    // Then - no input file should be an ArchiveFile (they should remain as-is or be
    // converted to ArchiveEntry)
    for (const candidate of candidates) {
      for (const romWithFiles of candidate.getRomsWithFiles()) {
        expect(romWithFiles.getInputFile()).not.toBeInstanceOf(ArchiveFile);
      }
    }
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
      new FileFactory(new FileCache()),
      new MappableSemaphore(os.cpus().length),
    ).scan();
    const dat = await buildInferredDat(options, romFiles);

    // When
    const candidates = await runPatchCandidateGenerator(options, dat, romFiles);

    // Then only the patched candidates remain
    expect(candidates).toHaveLength(patchFixtureCount);
    expect(getUnpatchedGameNames(candidates)).toEqual([]);
    expect(getPatchedCandidates(candidates)).toEqual(await getExpectedPatchedCandidates());
  });
});

describe('with archive file inputs', () => {
  // ROM and DAT both use CRC aabfe90e, matching the "modify-ips aabfe90e.ips" patch fixture
  const romCrc = 'aabfe90e';
  const rom = new ROM({ name: 'modify.rom', size: 1024, crc32: romCrc });
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [new Game({ name: 'modify', roms: [rom] })],
  });

  const patch = File.fileOf({
    filePath: path.join('test', 'fixtures', 'patches', 'modify', 'modify-ips aabfe90e.ips'),
  }).then((file) => IPSPatch.patchFrom(file));

  it('should not create patch candidates for archive inputs when not zipping', async () => {
    // Given a candidate with an ArchiveFile input whose inner entry CRC matches a patch,
    // but the command is copy (without zip), so patching the archive is not possible
    const options = new Options({ commands: ['copy'] });
    const archiveEntry = await ArchiveEntry.entryOf({
      archive: new Zip('input.zip'),
      entryPath: 'modify.rom',
      size: 1024,
      crc32: romCrc,
    });
    const candidate = new WriteCandidate(new Game({ name: 'modify', roms: [rom] }), [
      new ROMWithFiles(
        rom,
        new ArchiveFile(archiveEntry, { size: 100 }),
        await ArchiveEntry.entryOf({
          archive: new Zip('output.zip'),
          entryPath: 'modify.rom',
          size: 1024,
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
    for (const c of result) {
      for (const romWithFiles of c.getRomsWithFiles()) {
        expect(romWithFiles.getInputFile().getPatch()).toBeUndefined();
      }
    }
  });

  it('should create patch candidates for archive inputs when zipping', async () => {
    // Given a candidate with an ArchiveFile input whose inner entry CRC matches a patch,
    // and the command is zip, so patching the archive entry is possible
    const options = new Options({ commands: ['zip'] });
    const archiveEntry = await ArchiveEntry.entryOf({
      archive: new Zip('input.zip'),
      entryPath: 'modify.rom',
      size: 1024,
      crc32: romCrc,
    });
    const candidate = new WriteCandidate(new Game({ name: 'modify', roms: [rom] }), [
      new ROMWithFiles(
        rom,
        new ArchiveFile(archiveEntry, { size: 100 }),
        await ArchiveEntry.entryOf({
          archive: new Zip('output.zip'),
          entryPath: 'modify.rom',
          size: 1024,
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

    for (const writeCandidate of patchedCandidates) {
      for (const romWithFiles of writeCandidate.getRomsWithFiles()) {
        // and patched candidates' input files should be converted from ArchiveFile to ArchiveEntry
        expect(romWithFiles.getInputFile()).toBeInstanceOf(ArchiveEntry);

        // and patched candidates' output files should be ArchiveEntry backed by a Zip archive
        const outputFile = romWithFiles.getOutputFile();
        expect(outputFile).toBeInstanceOf(ArchiveEntry);
        expect((outputFile as ArchiveEntry<Zip>).getArchive()).toBeInstanceOf(Zip);
      }
    }
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
        new FileFactory(new FileCache()),
        new MappableSemaphore(os.availableParallelism()),
      ).scan()
    )[0];
    const romFiles = await new ROMScanner(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache()),
      new MappableSemaphore(os.availableParallelism()),
    ).scan();

    // And pre-assert all Game names and ROM names have path separators in them
    const totalRoms = dat.getGames().reduce((gameSum, game) => gameSum + game.getRoms().length, 0);
    expect(totalRoms).toBeGreaterThan(0);
    for (const game of dat.getGames()) {
      expect(/[\\/]/.exec(game.getName())).toBeTruthy();
      for (const rom of game.getRoms()) {
        expect(/[\\/]/.exec(rom.getName())).toBeTruthy();
      }
    }

    // When
    const candidates = await runPatchCandidateGenerator(options, dat, romFiles);

    // Then all Game names and ROM names should maintain their path separators
    for (const candidate of candidates) {
      expect(/[\\/]/.exec(candidate.getGame().getName())).toBeTruthy();
      for (const romWithFiles of candidate.getRomsWithFiles()) {
        expect(/[\\/]/.exec(romWithFiles.getRom().getName())).toBeTruthy();
      }
    }
  });
});
