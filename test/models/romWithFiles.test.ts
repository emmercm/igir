import ROM from '../../src/models/dats/rom.js';
import ArchiveEntry from '../../src/models/files/archives/archiveEntry.js';
import ArchiveFile from '../../src/models/files/archives/archiveFile.js';
import Zip from '../../src/models/files/archives/zip.js';
import File from '../../src/models/files/file.js';
import IPSPatch from '../../src/models/patches/ipsPatch.js';
import ROMWithFiles from '../../src/models/romWithFiles.js';

const rom = new ROM({ name: 'game.rom', size: 1, crc32: '00000000' });

describe('writesSameOutputAs', () => {
  it('should return true for the same input and output files', async () => {
    const inputFile = await File.fileOf({ filePath: 'input/game.rom', size: 1, crc32: '00000000' });
    const outputFile = await File.fileOf({ filePath: 'output/game.rom' });
    const first = new ROMWithFiles(rom, inputFile, outputFile);
    const second = new ROMWithFiles(rom, inputFile, outputFile);
    expect(first.writesSameOutputAs(second)).toEqual(true);
    expect(second.writesSameOutputAs(first)).toEqual(true);
  });

  it('should return true for the same unhashed archive input files', async () => {
    const outputFile = await File.fileOf({ filePath: 'output/game.zip' });
    const first = new ROMWithFiles(
      rom,
      new ArchiveFile(
        await ArchiveEntry.entryOf({ archive: new Zip('input/game.zip'), entryPath: 'one.rom' }),
        { size: 10 },
      ),
      outputFile,
    );
    const second = new ROMWithFiles(
      rom,
      new ArchiveFile(
        await ArchiveEntry.entryOf({ archive: new Zip('input/game.zip'), entryPath: 'two.rom' }),
        { size: 10 },
      ),
      outputFile,
    );
    expect(first.writesSameOutputAs(second)).toEqual(true);
    expect(second.writesSameOutputAs(first)).toEqual(true);
  });

  it('should return true for different input files with the same output contents', async () => {
    const outputFile = await File.fileOf({
      filePath: 'output/game.rom',
      size: 1,
      crc32: '00000000',
    });
    const first = new ROMWithFiles(
      rom,
      await File.fileOf({ filePath: 'input/one.rom', size: 1, crc32: '00000000' }),
      outputFile,
    );
    const second = new ROMWithFiles(
      rom,
      await File.fileOf({
        filePath: 'input/two.rom',
        size: 1,
        crc32: '00000000',
        symlinkSource: 'input/one.rom',
      }),
      outputFile,
    );
    expect(first.writesSameOutputAs(second)).toEqual(true);
    expect(second.writesSameOutputAs(first)).toEqual(true);
  });

  it('should return false for different output locations', async () => {
    const inputFile = await File.fileOf({ filePath: 'input/game.rom', size: 1, crc32: '00000000' });
    const first = new ROMWithFiles(
      rom,
      inputFile,
      await ArchiveEntry.entryOf({
        archive: new Zip('output/game.zip'),
        entryPath: 'one.rom',
        size: 1,
        crc32: '00000000',
      }),
    );
    const second = new ROMWithFiles(
      rom,
      inputFile,
      await ArchiveEntry.entryOf({
        archive: new Zip('output/game.zip'),
        entryPath: 'two.rom',
        size: 1,
        crc32: '00000000',
      }),
    );
    expect(first.writesSameOutputAs(second)).toEqual(false);
    expect(second.writesSameOutputAs(first)).toEqual(false);
  });

  it('should return false for patched and unpatched input files', async () => {
    const inputFile = await File.fileOf({ filePath: 'input/game.rom', size: 1, crc32: '00000000' });
    const patch = IPSPatch.patchFrom(await File.fileOf({ filePath: 'patch 00000000.ips' }));
    const first = new ROMWithFiles(
      rom,
      inputFile,
      await File.fileOf({ filePath: 'output/game.rom', size: 1, crc32: '00000000' }),
    );
    const second = new ROMWithFiles(
      rom,
      inputFile.withPatch(patch),
      await File.fileOf({ filePath: 'output/game.rom', size: 1, crc32: '12345678' }),
    );
    expect(first.writesSameOutputAs(second)).toEqual(false);
    expect(second.writesSameOutputAs(first)).toEqual(false);
  });

  it('should return false for different input files with different output sizes', async () => {
    const first = new ROMWithFiles(
      rom,
      await File.fileOf({ filePath: 'input/one.rom', size: 1, crc32: '00000000' }),
      await File.fileOf({ filePath: 'output/game.rom', size: 1, crc32: '00000000' }),
    );
    const second = new ROMWithFiles(
      rom,
      await File.fileOf({ filePath: 'input/two.rom', size: 2, crc32: '00000000' }),
      await File.fileOf({ filePath: 'output/game.rom', size: 2, crc32: '00000000' }),
    );
    expect(first.writesSameOutputAs(second)).toEqual(false);
    expect(second.writesSameOutputAs(first)).toEqual(false);
  });

  it('should return false for different input files with unknown output checksums', async () => {
    const outputFile = await File.fileOf({ filePath: 'output/game.rom', size: 1 });
    const first = new ROMWithFiles(
      rom,
      await File.fileOf({ filePath: 'input/one.rom', size: 1 }),
      outputFile,
    );
    const second = new ROMWithFiles(
      rom,
      await File.fileOf({ filePath: 'input/two.rom', size: 1 }),
      outputFile,
    );
    expect(first.writesSameOutputAs(second)).toEqual(false);
    expect(second.writesSameOutputAs(first)).toEqual(false);
  });
});

describe('hashCode', () => {
  it('should ignore the output symlink source', async () => {
    const inputFile = await File.fileOf({ filePath: 'input/game.rom', size: 1, crc32: '00000000' });
    const first = new ROMWithFiles(
      rom,
      inputFile,
      await File.fileOf({ filePath: 'output/game.rom' }),
    );
    const second = new ROMWithFiles(
      rom,
      inputFile,
      await File.fileOf({ filePath: 'output/game.rom', symlinkSource: 'input/game.rom' }),
    );
    expect(first.hashCode()).toEqual(second.hashCode());
  });

  it('should include the output archive entry path', async () => {
    const inputFile = await File.fileOf({ filePath: 'input/game.rom', size: 1, crc32: '00000000' });
    const first = new ROMWithFiles(
      rom,
      inputFile,
      await ArchiveEntry.entryOf({ archive: new Zip('output/game.zip'), entryPath: 'one.rom' }),
    );
    const second = new ROMWithFiles(
      rom,
      inputFile,
      await ArchiveEntry.entryOf({ archive: new Zip('output/game.zip'), entryPath: 'two.rom' }),
    );
    expect(first.hashCode()).not.toEqual(second.hashCode());
  });
});
