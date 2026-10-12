import os from 'node:os';
import path from 'node:path';

import MappableSemaphore from '../../../src/async/mappableSemaphore.js';
import FileCache from '../../../src/cache/fileCache.js';
import FileFactory from '../../../src/factories/fileFactory.js';
import Temp from '../../../src/globals/temp.js';
import Game from '../../../src/models/dats/game.js';
import Header from '../../../src/models/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/models/dats/logiqx/logiqxDat.js';
import ROM from '../../../src/models/dats/rom.js';
import ArchiveEntry from '../../../src/models/files/archives/archiveEntry.js';
import ArchiveFile from '../../../src/models/files/archives/archiveFile.js';
import Zip from '../../../src/models/files/archives/zip.js';
import File from '../../../src/models/files/file.js';
import Options from '../../../src/models/options.js';
import ROMWithFiles from '../../../src/models/romWithFiles.js';
import WriteCandidate from '../../../src/models/writeCandidate.js';
import CandidateArchiveFileHasher from '../../../src/modules/candidates/candidateArchiveFileHasher.js';
import FsUtil from '../../../src/utils/fsUtil.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const FIXTURE_ROMS_DIR = path.join('test', 'fixtures', 'roms');

function buildFileFactory(): FileFactory {
  return new FileFactory(new FileCache());
}

function buildHasher(options: Options): CandidateArchiveFileHasher {
  return new CandidateArchiveFileHasher(
    options,
    new ProgressBarFake(),
    buildFileFactory(),
    new MappableSemaphore(os.availableParallelism()),
  );
}

describe('hash', () => {
  it('should return the same candidates when options do not require hashing', async () => {
    // Options without 'test' or 'overwrite-invalid' do not require hashing
    const options = new Options({ commands: ['copy'], output: 'output' });
    const game = new Game({ name: 'Test Game' });
    const file = await File.fileOf({ filePath: 'dummy.rom', size: 0, crc32: '00000000' });
    const rom = new ROM({ name: 'dummy.rom', size: 0 });
    const candidates = [new WriteCandidate(game, [new ROMWithFiles(rom, file, file)])];
    const dat = new LogiqxDAT({ header: new Header() });

    const result = await buildHasher(options).hash(dat, candidates);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(candidates[0]);
  });

  it('should return an empty array for an empty candidates list', async () => {
    const options = new Options({ commands: ['copy', 'test'], output: 'output' });
    const dat = new LogiqxDAT({ header: new Header() });
    const result = await buildHasher(options).hash(dat, []);
    expect(result).toHaveLength(0);
  });

  it('should skip hashing when inputFile equals outputFile (ArchiveFile)', async () => {
    // When inputFile === outputFile (same reference), hashing is skipped
    const options = new Options({ commands: ['copy', 'test'], output: 'output' });

    const zipPath = path.join(FIXTURE_ROMS_DIR, 'zip', 'foobar.zip');
    const zip = new Zip(zipPath);
    const archiveEntry = await ArchiveEntry.entryOf({ archive: zip, entryPath: 'foobar.lnx' });
    const archiveFile = new ArchiveFile(archiveEntry);

    const game = new Game({ name: 'Zip Game' });
    const rom = new ROM({ name: 'foobar.lnx', size: 0 });
    const candidates = [
      new WriteCandidate(game, [new ROMWithFiles(rom, archiveFile, archiveFile)]),
    ];
    const dat = new LogiqxDAT({ header: new Header() });

    const result = await buildHasher(options).hash(dat, candidates);
    expect(result).toHaveLength(1);
  });

  it('should hash ArchiveFile input when required and input does not equal output', async () => {
    const options = new Options({ commands: ['copy', 'test'], output: 'output' });

    const zipPath = path.join(FIXTURE_ROMS_DIR, 'zip', 'foobar.zip');
    const zip = new Zip(zipPath);
    const archiveEntry = await ArchiveEntry.entryOf({ archive: zip, entryPath: 'foobar.lnx' });
    const archiveFile = new ArchiveFile(archiveEntry);
    const outputFile = await File.fileOf({ filePath: 'output.rom', size: 0, crc32: '00000000' });

    const game = new Game({ name: 'Zip Game' });
    const rom = new ROM({ name: 'foobar.lnx', size: 0 });
    const candidates = [new WriteCandidate(game, [new ROMWithFiles(rom, archiveFile, outputFile)])];
    const dat = new LogiqxDAT({ header: new Header() });

    const result = await buildHasher(options).hash(dat, candidates);
    expect(result).toHaveLength(1);
  });

  it('should not hash plain (non-ArchiveFile) input files', async () => {
    // Plain (non-ArchiveFile) inputs are passed through without hashing
    const options = new Options({ commands: ['copy', 'test'], output: 'output' });

    const inputFile = await File.fileOf({
      filePath: path.join(FIXTURE_ROMS_DIR, 'raw', 'one.rom'),
    });
    const outputFile = await File.fileOf({ filePath: 'output.rom', size: 0, crc32: '00000000' });

    const game = new Game({ name: 'Plain Game' });
    const rom = new ROM({
      name: 'one.rom',
      size: inputFile.getSize(),
      crc32: inputFile.getCrc32(),
    });
    const candidates = [new WriteCandidate(game, [new ROMWithFiles(rom, inputFile, outputFile)])];
    const dat = new LogiqxDAT({ header: new Header() });

    const result = await buildHasher(options).hash(dat, candidates);
    expect(result).toHaveLength(1);
    expect(result[0].getRomsWithFiles()[0].getInputFile()).toBe(inputFile);
  });
});

async function zipCandidate(
  zipPath: string,
  outputPath: string,
): Promise<[WriteCandidate[], LogiqxDAT]> {
  const archiveEntry = await ArchiveEntry.entryOf({
    archive: new Zip(zipPath),
    entryPath: 'foobar.lnx',
  });
  const archiveFile = new ArchiveFile(archiveEntry);
  const outputFile = await File.fileOf({ filePath: outputPath, size: 0, crc32: '00000000' });
  const rom = new ROM({ name: 'foobar.lnx', size: 0 });
  return [
    [
      new WriteCandidate(new Game({ name: 'Zip Game' }), [
        new ROMWithFiles(rom, archiveFile, outputFile),
      ]),
    ],
    new LogiqxDAT({ header: new Header() }),
  ];
}

async function withTempZip(
  callback: (zipPath: string, tempDir: string) => Promise<void>,
): Promise<void> {
  await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
  const tempDir = await FsUtil.mkdtemp(path.join(Temp.getTempDir(), 'hasher'));
  try {
    const zipPath = path.join(tempDir, 'foobar.zip');
    await FsUtil.copyFile(path.join(FIXTURE_ROMS_DIR, 'zip', 'foobar.zip'), zipPath);
    await callback(zipPath, tempDir);
  } finally {
    await FsUtil.rm(tempDir, { recursive: true, force: true });
  }
}

describe('hash: links and renames', () => {
  it.each([
    ['should not hash archives that will be hard linked', ['link', 'test'], 'hardlink'],
    ['should not hash archives that will be symlinked', ['link', 'test'], 'symlink'],
  ])('%s', async (_, commands, linkMode) => {
    await withTempZip(async (zipPath, tempDir) => {
      const hashSpy = vi.spyOn(FileFactory.prototype, 'archiveFileFrom');
      try {
        const options = new Options({ commands, linkMode, output: tempDir });
        const [candidates, dat] = await zipCandidate(
          zipPath,
          path.join(tempDir, 'out', 'foobar.zip'),
        );
        await buildHasher(options).hash(dat, candidates);
        expect(hashSpy).not.toHaveBeenCalled();
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  it('should not hash archives that will be renamed into a new path', async () => {
    await withTempZip(async (zipPath, tempDir) => {
      const hashSpy = vi.spyOn(FileFactory.prototype, 'archiveFileFrom');
      try {
        const options = new Options({ commands: ['move', 'test'], output: tempDir });
        const [candidates, dat] = await zipCandidate(
          zipPath,
          path.join(tempDir, 'out', 'foobar.zip'),
        );
        await buildHasher(options).hash(dat, candidates);
        expect(hashSpy).not.toHaveBeenCalled();
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  it('should hash archives moving onto an output that already exists', async () => {
    await withTempZip(async (zipPath, tempDir) => {
      const existing = path.join(tempDir, 'existing.zip');
      await FsUtil.copyFile(zipPath, existing);
      const hashSpy = vi.spyOn(FileFactory.prototype, 'archiveFileFrom');
      try {
        const options = new Options({ commands: ['move', 'test'], output: tempDir });
        const [candidates, dat] = await zipCandidate(zipPath, existing);
        await buildHasher(options).hash(dat, candidates);
        expect(hashSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  it('should hash archives that will be copied', async () => {
    await withTempZip(async (zipPath, tempDir) => {
      const hashSpy = vi.spyOn(FileFactory.prototype, 'archiveFileFrom');
      try {
        const options = new Options({ commands: ['copy', 'test'], output: tempDir });
        const [candidates, dat] = await zipCandidate(
          zipPath,
          path.join(tempDir, 'out', 'foobar.zip'),
        );
        await buildHasher(options).hash(dat, candidates);
        expect(hashSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.restoreAllMocks();
      }
    });
  });
});
