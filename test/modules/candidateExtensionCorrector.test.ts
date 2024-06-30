import path from 'node:path';

import Temp from '../../src/globals/temp.js';
import CandidateExtensionCorrector from '../../src/modules/candidateExtensionCorrector.js';
import ROMScanner from '../../src/modules/romScanner.js';
import FsPoly from '../../src/polyfill/fsPoly.js';
import Game from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import Parent from '../../src/types/dats/parent.js';
import ROM from '../../src/types/dats/rom.js';
import File from '../../src/types/files/file.js';
import Options from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
import ProgressBarFake from '../console/progressBarFake.js';

it('should do nothing with no parents', async () => {
  const options = new Options();
  const dat = new LogiqxDAT(new Header(), []);
  const parentsToCandidates = new Map<Parent, ReleaseCandidate[]>();

  const correctedParentsToCandidates = await new CandidateExtensionCorrector(
    options,
    new ProgressBarFake(),
  ).correct(dat, parentsToCandidates);

  expect(correctedParentsToCandidates).toBe(parentsToCandidates);
});

it('should do nothing when no ROMs need correcting', async () => {
  const options = new Options();
  const dat = new LogiqxDAT(new Header(), [
    new Game({
      name: 'game with no ROMs',
    }),
    new Game({
      name: 'game with one ROM',
      rom: new ROM({ name: 'one.rom', size: 1 }),
    }),
    new Game({
      name: 'game with two ROMs',
      rom: [
        new ROM({ name: 'two.rom', size: 2 }),
        new ROM({ name: 'three.rom', size: 3 }),
      ],
    }),
  ]);
  const parentsToCandidates = new Map<Parent, ReleaseCandidate[]>();

  const correctedParentsToCandidates = await new CandidateExtensionCorrector(
    options,
    new ProgressBarFake(),
  ).correct(dat, parentsToCandidates);

  expect(correctedParentsToCandidates).toBe(parentsToCandidates);
});

it('should correct ROMs with missing filenames', async () => {
  const options = new Options({
    input: [path.join('test', 'fixtures', 'roms', 'headered')],
  });
  const dat = new LogiqxDAT(new Header(), []);
  const inputFiles = await new ROMScanner(options, new ProgressBarFake()).scan();

  const tempDir = await FsPoly.mkdtemp(Temp.getTempDir());
  try {
    const tempFiles = await Promise.all(inputFiles.map(async (inputFile) => {
      const tempFile = path.join(tempDir, path.basename(inputFile.getExtractedFilePath()));
      await inputFile.extractToFile(tempFile);
      return File.fileOf({ filePath: tempFile });
    }));

    const parentsToCandidates = new Map(tempFiles.map((tempFile) => {
      const roms = [new ROM({ name: '', size: 123 })];
      const game = new Game({
        name: path.parse(tempFile.getFilePath()).name,
        rom: roms,
      });
      const parent = new Parent(game);
      const romsWithFiles = roms.map((rom) => {
        const { dir, name } = path.parse(tempFile.getFilePath());
        const outputFile = tempFile.withFilePath(`${path.format({ dir, name })}.rom`);
        return new ROMWithFiles(rom, tempFile, outputFile);
      });
      const releaseCandidate = new ReleaseCandidate(game, undefined, romsWithFiles);
      return [parent, [releaseCandidate]] satisfies [Parent, ReleaseCandidate[]];
    }));

    const correctedParentsToCandidates = await new CandidateExtensionCorrector(
      options,
      new ProgressBarFake(),
    ).correct(dat, parentsToCandidates);

    expect(correctedParentsToCandidates).not.toBe(parentsToCandidates);
    // TODO(cemmer): scan both maps at the same time and check:
    //  - the parent hasn't changed
    //  - the input files haven't changed
    //  - the output filenames differ
  } finally {
    await FsPoly.rm(tempDir, { recursive: true, force: true });
  }
});
