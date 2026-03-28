import os from 'node:os';
import path from 'node:path';
import stream from 'node:stream';

import MappableSemaphore from '../../../src/async/mappableSemaphore.js';
import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import CandidateArchiveFileHasher from '../../../src/modules/candidates/candidateArchiveFileHasher.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import ROM from '../../../src/types/dats/rom.js';
import SingleValueGame from '../../../src/types/dats/singleValueGame.js';
import ArchiveFile from '../../../src/types/files/archives/archiveFile.js';
import Zip from '../../../src/types/files/archives/zip.js';
import File from '../../../src/types/files/file.js';
import FileCache from '../../../src/types/files/fileCache.js';
import FileFactory from '../../../src/types/files/fileFactory.js';
import Options from '../../../src/types/options.js';
import ROMWithFiles from '../../../src/types/romWithFiles.js';
import WriteCandidate from '../../../src/types/writeCandidate.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const FIXTURE_ROMS_DIR = path.join('test', 'fixtures', 'roms');

function buildFileFactory(): FileFactory {
  return new FileFactory(new FileCache(), new Logger(LogLevel.NEVER, new stream.PassThrough()));
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
    const game = new SingleValueGame({ name: 'Test Game' });
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
    const archiveFile = new ArchiveFile(zip);

    const game = new SingleValueGame({ name: 'Zip Game' });
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
    const archiveFile = new ArchiveFile(zip);
    const outputFile = await File.fileOf({ filePath: 'output.rom', size: 0, crc32: '00000000' });

    const game = new SingleValueGame({ name: 'Zip Game' });
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

    const game = new SingleValueGame({ name: 'Plain Game' });
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
