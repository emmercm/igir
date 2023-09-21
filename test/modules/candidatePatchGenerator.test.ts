import path from 'node:path';

import CandidateGenerator from '../../src/modules/candidateGenerator.js';
import CandidatePatchGenerator from '../../src/modules/candidatePatchGenerator.js';
import DATInferrer from '../../src/modules/datInferrer.js';
import DATScanner from '../../src/modules/datScanner.js';
import FileIndexer from '../../src/modules/fileIndexer.js';
import PatchScanner from '../../src/modules/patchScanner.js';
import ROMScanner from '../../src/modules/romScanner.js';
import DAT from '../../src/types/dats/dat.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import Parent from '../../src/types/dats/parent.js';
import File from '../../src/types/files/file.js';
import Options from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ProgressBarFake from '../console/progressBarFake.js';

// Run DATInferrer, but condense all DATs down to one
function buildInferredDat(romFiles: File[]): DAT {
  const datGames = new DATInferrer(new ProgressBarFake()).infer(romFiles)
    .map((dat) => dat.getGames())
    .flatMap((games) => games);
  return new LogiqxDAT(new Header(), datGames);
}

async function runPatchCandidateGenerator(
  dat: DAT,
  romFiles: File[],
): Promise<Map<Parent, ReleaseCandidate[]>> {
  const options = new Options({
    commands: ['extract'],
    patch: [path.join('test', 'fixtures', 'patches')],
  });

  const indexedRomFiles = await new FileIndexer(options, new ProgressBarFake()).index(romFiles);
  const parentsToCandidates = await new CandidateGenerator(options, new ProgressBarFake())
    .generate(dat, indexedRomFiles);

  const patches = await new PatchScanner(options, new ProgressBarFake()).scan();

  return new CandidatePatchGenerator(options, new ProgressBarFake())
    .generate(dat, parentsToCandidates, patches);
}

it('should do nothing with no parents', async () => {
  // Given
  const dat = new LogiqxDAT(new Header(), []);

  // When
  const parentsToCandidates = await runPatchCandidateGenerator(dat, []);

  // Then
  expect(parentsToCandidates.size).toEqual(0);
});

describe('with inferred DATs', () => {
  it('should do nothing with no relevant patches', async () => {
    // Given
    const romFiles = await new ROMScanner(new Options({
      input: [path.join('test', 'fixtures', 'roms', 'headered')],
    }), new ProgressBarFake()).scan();
    const dat = buildInferredDat(romFiles);

    // When
    const parentsToCandidates = await runPatchCandidateGenerator(dat, romFiles);

    // Then
    expect(parentsToCandidates.size).toEqual(6);
    [...parentsToCandidates.values()]
      .forEach((releaseCandidates) => expect(releaseCandidates).toHaveLength(1));
  });

  it('should create patch candidates with relevant patches', async () => {
    // Given
    const romFiles = await new ROMScanner(new Options({
      input: [path.join('test', 'fixtures', 'roms', 'patchable')],
    }), new ProgressBarFake()).scan();
    const dat = buildInferredDat(romFiles);

    // When
    const parentsToCandidates = await runPatchCandidateGenerator(dat, romFiles);

    // Then parents have doubled
    expect(parentsToCandidates.size).toEqual(romFiles.length * 2);
    [...parentsToCandidates.values()]
      .forEach((releaseCandidates) => expect(releaseCandidates).toHaveLength(1));
  });
});

describe('with explicit DATs', () => {
  it('should maintain game and ROM paths from HTGD DATs', async () => {
    // Given
    const options = new Options({
      dat: [path.join('test', 'fixtures', 'dats', 'smdb*')],
      input: [path.join('test', 'fixtures', 'roms', 'patchable')],
    });
    const dat = (await new DATScanner(options, new ProgressBarFake()).scan())[0];
    const romFiles = await new ROMScanner(options, new ProgressBarFake()).scan();

    // And pre-assert all Game names and ROM names have path separators in them
    const totalRoms = dat.getGames().reduce((gameSum, game) => gameSum + game.getRoms().length, 0);
    expect(totalRoms).toBeGreaterThan(0);
    dat.getGames().forEach((game) => {
      expect(game.getName().match(/[\\/]/)).toBeTruthy();
      game.getRoms().forEach((rom) => {
        expect(rom.getName().match(/[\\/]/)).toBeTruthy();
      });
    });

    // When
    const parentsToCandidates = await runPatchCandidateGenerator(dat, romFiles);

    // Then all Game names and ROM names should maintain their path separators
    parentsToCandidates.forEach((releaseCandidates) => {
      releaseCandidates.forEach((releaseCandidate) => {
        expect(releaseCandidate.getGame().getName().match(/[\\/]/)).toBeTruthy();
        releaseCandidate.getRomsWithFiles().forEach((romWithFiles) => {
          expect(romWithFiles.getRom().getName().match(/[\\/]/)).toBeTruthy();
        });
      });
    });
  });
});
