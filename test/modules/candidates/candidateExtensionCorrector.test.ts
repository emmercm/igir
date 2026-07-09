import os from 'node:os';
import path from 'node:path';

import { Semaphore } from 'async-mutex';

import MappableSemaphore from '../../../src/async/mappableSemaphore.js';
import FileCache from '../../../src/cache/fileCache.js';
import FileFactory from '../../../src/factories/fileFactory.js';
import Temp from '../../../src/globals/temp.js';
import Game from '../../../src/models/dats/game.js';
import Header from '../../../src/models/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/models/dats/logiqx/logiqxDat.js';
import ROM from '../../../src/models/dats/rom.js';
import ArchiveEntry from '../../../src/models/files/archives/archiveEntry.js';
import Zip from '../../../src/models/files/archives/zip.js';
import File from '../../../src/models/files/file.js';
import Options, {
  FixExtension,
  FixExtensionInverted,
  ZipFormat,
} from '../../../src/models/options.js';
import ROMWithFiles from '../../../src/models/romWithFiles.js';
import WriteCandidate from '../../../src/models/writeCandidate.js';
import CandidateExtensionCorrector from '../../../src/modules/candidates/candidateExtensionCorrector.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import FsUtil from '../../../src/utils/fsUtil.js';
import ProgressBarFake from '../../console/progressBarFake.js';

it('should do nothing with no candidates', async () => {
  const options = new Options();
  const dat = new LogiqxDAT({ header: new Header() });
  const candidates: WriteCandidate[] = [];

  const correctedCandidates = await new CandidateExtensionCorrector(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache()),
    new Semaphore(os.availableParallelism()),
  ).correct(dat, candidates);

  expect(correctedCandidates).toBe(candidates);
});

it('should do nothing when no ROMs need correcting', async () => {
  const options = new Options({
    fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
  });
  const dat = new LogiqxDAT({
    header: new Header(),
    games: [
      new Game({
        name: 'game with no ROMs',
      }),
      new Game({
        name: 'game with one ROM',
        roms: new ROM({ name: 'one.rom', size: 1 }),
      }),
      new Game({
        name: 'game with two ROMs',
        roms: [new ROM({ name: 'two.rom', size: 2 }), new ROM({ name: 'three.rom', size: 3 })],
      }),
    ],
  });
  const candidates: WriteCandidate[] = [];

  const correctedCandidates = await new CandidateExtensionCorrector(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache()),
    new Semaphore(os.availableParallelism()),
  ).correct(dat, candidates);

  expect(correctedCandidates).toBe(candidates);
});

function expectCorrectedCandidates(
  candidates: WriteCandidate[],
  correctedCandidates: WriteCandidate[],
): void {
  expect(correctedCandidates).not.toBe(candidates);

  // The candidates haven't changed
  expect(correctedCandidates).toHaveLength(candidates.length);

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates.at(i);
    const correctedCandidate = correctedCandidates.at(i);

    const romsWithFiles = candidate?.getRomsWithFiles();
    const correctedRomsWithFiles = correctedCandidate?.getRomsWithFiles();

    // The candidate has the same number of ROMWithFiles
    expect(correctedRomsWithFiles).toHaveLength(romsWithFiles?.length ?? -1);

    for (let j = 0; j < (romsWithFiles?.length ?? 0); j += 1) {
      const romWithFiles = romsWithFiles?.at(j);
      const correctedRomWithFiles = correctedRomsWithFiles?.at(j);

      // The input file hasn't changed
      expect(correctedRomWithFiles?.getInputFile()).toBe(romWithFiles?.getInputFile());

      // The output file path has changed
      expect(correctedRomWithFiles?.getOutputFile().getFilePath()).not.toEqual(
        romWithFiles?.getOutputFile().getFilePath(),
      );
    }
  }
}

it('should correct ROMs without DATs', async () => {
  const options = new Options({
    // No DAT has been provided, therefore all ROMs should be corrected
    input: [path.join('test', 'fixtures', 'roms', 'headered')],
    fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
  });
  const dat = new LogiqxDAT({ header: new Header() });
  const inputFiles = await new ROMScanner(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache()),
    new MappableSemaphore(os.availableParallelism()),
  ).scan();

  const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
  try {
    const tempFiles = await Promise.all(
      inputFiles.map(async (inputFile) => {
        const tempFile = path.join(tempDir, path.basename(inputFile.getExtractedFilePath()));
        await inputFile.extractToFile(tempFile);
        return await File.fileOf({ filePath: tempFile });
      }),
    );

    const candidates = tempFiles.map((tempFile) => {
      const roms = [
        new ROM({
          name: path.basename(tempFile.getFilePath()),
          size: tempFile.getSize(),
        }),
      ];
      const game = new Game({
        name: path.parse(tempFile.getFilePath()).name,
        roms: roms,
      });
      const romsWithFiles = roms.map((rom) => {
        const { dir, name } = path.parse(tempFile.getFilePath());
        // Use a dummy path for the output, so we can know if it changed or not
        const outputFile = tempFile.withFilePath(`${path.format({ dir, name })}.rom`);
        return new ROMWithFiles(rom, tempFile, outputFile);
      });
      return new WriteCandidate(game, romsWithFiles);
    });

    const correctedCandidates = await new CandidateExtensionCorrector(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache()),
      new Semaphore(os.availableParallelism()),
    ).correct(dat, candidates);

    expectCorrectedCandidates(candidates, correctedCandidates);
  } finally {
    await FsUtil.rm(tempDir, { recursive: true, force: true });
  }
});

it('should not truncate names with periods when correcting from file signature', async () => {
  const options = new Options({
    // No DAT has been provided, therefore all ROMs should be corrected
    fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
  });
  const dat = new LogiqxDAT({ header: new Header() });

  const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
  try {
    // A CHD file whose name contains periods, but no extension on the inferred ROM name
    const gameName = 'J. B. Harold Murder Club (USA) (En,Ja)';
    const tempFile = path.join(tempDir, `${gameName}.chd`);
    await FsUtil.copyFile(path.join('test', 'fixtures', 'roms', 'chd', 'CD-ROM.chd'), tempFile);
    const inputFile = await File.fileOf({ filePath: tempFile });

    // The inferred ROM name has no extension (this is what a raw CHD entry produces)
    const rom = new ROM({ name: gameName, size: inputFile.getSize() });
    const game = new Game({ name: gameName, roms: [rom] });
    const outputFile = inputFile.withFilePath(path.join(tempDir, gameName));
    const candidates = [new WriteCandidate(game, [new ROMWithFiles(rom, inputFile, outputFile)])];

    const correctedCandidates = await new CandidateExtensionCorrector(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache()),
      new Semaphore(os.availableParallelism()),
    ).correct(dat, candidates);

    expect(correctedCandidates).toHaveLength(1);
    expect(correctedCandidates[0].getRomsWithFiles()).toHaveLength(1);
    const correctedRomName = correctedCandidates
      .at(0)
      ?.getRomsWithFiles()
      .at(0)
      ?.getRom()
      .getName();
    expect(correctedRomName).toEqual(`${gameName}.chd`);
  } finally {
    await FsUtil.rm(tempDir, { recursive: true, force: true });
  }
});

it('should match uppercase casing when correcting from file signature', async () => {
  const options = new Options({
    // No DAT has been provided, therefore all ROMs should be corrected
    fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
  });
  const dat = new LogiqxDAT({ header: new Header() });

  const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
  try {
    // A CHD file given an incorrect, all-uppercase extension
    const tempFile = path.join(tempDir, 'GAME.FOO');
    await FsUtil.copyFile(path.join('test', 'fixtures', 'roms', 'chd', 'CD-ROM.chd'), tempFile);
    const inputFile = await File.fileOf({ filePath: tempFile });

    const rom = new ROM({ name: 'GAME.FOO', size: inputFile.getSize() });
    const game = new Game({ name: 'game', roms: [rom] });
    const outputFile = inputFile.withFilePath(path.join(tempDir, 'game.FOO'));
    const candidates = [new WriteCandidate(game, [new ROMWithFiles(rom, inputFile, outputFile)])];

    const correctedCandidates = await new CandidateExtensionCorrector(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache()),
      new Semaphore(os.availableParallelism()),
    ).correct(dat, candidates);

    // The detected extension (.chd) is uppercased to match the old extension's casing
    const correctedRomName = correctedCandidates
      .at(0)
      ?.getRomsWithFiles()
      .at(0)
      ?.getRom()
      .getName();
    expect(correctedRomName).toEqual('GAME.CHD');
  } finally {
    await FsUtil.rm(tempDir, { recursive: true, force: true });
  }
});

it('should not strip archive extensions from files within archives', async () => {
  const options = new Options({
    // No DAT has been provided, therefore all ROMs should be corrected
    fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
  });
  const dat = new LogiqxDAT({ header: new Header() });

  const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
  try {
    const nestedFilePath = path.join(tempDir, 'nested.zip');
    await FsUtil.writeFile(nestedFilePath, 'this is not really a zip file');
    const nestedFile = await File.fileOf({ filePath: nestedFilePath });
    const outerZip = new Zip(path.join(tempDir, 'outer.zip'));
    await outerZip.createArchive(
      [[nestedFile, await ArchiveEntry.entryOf({ archive: outerZip, entryPath: 'nested.zip' })]],
      ZipFormat.TORRENTZIP,
      1,
    );

    const inputFile = (await new FileFactory(new FileCache()).filesFrom(outerZip.getFilePath())).at(
      0,
    );
    if (inputFile === undefined) {
      throw new Error('failed to scan the nested archive entry');
    }

    // The inferred ROM name is the archive entry path, ending in an archive extension
    const rom = new ROM({ name: inputFile.getExtractedFilePath(), size: inputFile.getSize() });
    const game = new Game({ name: 'nested', roms: [rom] });
    const outputFile = inputFile.withFilePath(path.join(tempDir, 'nested.zip'));
    const candidates = [new WriteCandidate(game, [new ROMWithFiles(rom, inputFile, outputFile)])];

    const correctedCandidates = await new CandidateExtensionCorrector(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache()),
      new Semaphore(os.availableParallelism()),
    ).correct(dat, candidates);

    const correctedRomName = correctedCandidates
      .at(0)
      ?.getRomsWithFiles()
      .at(0)
      ?.getRom()
      .getName();
    expect(correctedRomName).toEqual('nested.zip');
  } finally {
    await FsUtil.rm(tempDir, { recursive: true, force: true });
  }
});

it('should correct ROMs with missing filenames', async () => {
  const options = new Options({
    dat: [path.join('test', 'fixtures', 'dats')],
    input: [path.join('test', 'fixtures', 'roms', 'headered')],
    fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
  });
  const dat = new LogiqxDAT({ header: new Header() });
  const inputFiles = await new ROMScanner(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache()),
    new MappableSemaphore(os.availableParallelism()),
  ).scan();

  const tempDir = await FsUtil.mkdtemp(Temp.getTempDir());
  try {
    const tempFiles = await Promise.all(
      inputFiles.map(async (inputFile) => {
        const tempFile = path.join(tempDir, path.basename(inputFile.getExtractedFilePath()));
        await inputFile.extractToFile(tempFile);
        return await File.fileOf({ filePath: tempFile });
      }),
    );

    const candidates = tempFiles.map((tempFile) => {
      // No ROM in the DAT has a filename, therefore all of them should be corrected
      const roms = [new ROM({ name: '', size: tempFile.getSize() })];
      const game = new Game({
        name: path.parse(tempFile.getFilePath()).name,
        roms: roms,
      });
      const romsWithFiles = roms.map((rom) => {
        const { dir, name } = path.parse(tempFile.getFilePath());
        // Use a dummy path for the output, so we can know if it changed or not
        const outputFile = tempFile.withFilePath(`${path.format({ dir, name })}.rom`);
        return new ROMWithFiles(rom, tempFile, outputFile);
      });
      return new WriteCandidate(game, romsWithFiles);
    });

    const correctedCandidates = await new CandidateExtensionCorrector(
      options,
      new ProgressBarFake(),
      new FileFactory(new FileCache()),
      new Semaphore(os.availableParallelism()),
    ).correct(dat, candidates);

    expectCorrectedCandidates(candidates, correctedCandidates);
  } finally {
    await FsUtil.rm(tempDir, { recursive: true, force: true });
  }
});
