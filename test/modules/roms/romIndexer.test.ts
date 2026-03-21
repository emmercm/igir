import path from 'node:path';

import ROMIndexer from '../../../src/modules/roms/romIndexer.js';
import ArchiveEntry from '../../../src/types/files/archives/archiveEntry.js';
import ChdRaw from '../../../src/types/files/archives/chd/chdRaw.js';
import Rvz from '../../../src/types/files/archives/dolphin/rvz.js';
import Cso from '../../../src/types/files/archives/maxcso/cso.js';
import Rar from '../../../src/types/files/archives/rar.js';
import SevenZip from '../../../src/types/files/archives/sevenZip/sevenZip.js';
import Tar from '../../../src/types/files/archives/tar.js';
import Zip from '../../../src/types/files/archives/zip.js';
import File from '../../../src/types/files/file.js';
import type { OptionsProps } from '../../../src/types/options.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const CRC = '12345678';
const SIZE = 1;

function createRomIndexer(props?: OptionsProps): ROMIndexer {
  return new ROMIndexer(new Options(props), new ProgressBarFake());
}

function indexAndFind(files: File[], props?: OptionsProps): File[] {
  return createRomIndexer(props).index(files).findFiles(files[0]);
}

describe('archiveEntryPriority (default sort)', () => {
  it('should sort a plain file before all archive types', async () => {
    const plain = await File.fileOf({ filePath: 'rom.rom', size: SIZE, crc32: CRC });
    const zip = await ArchiveEntry.entryOf({
      archive: new Zip('rom.zip'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });
    const chd = await ArchiveEntry.entryOf({
      archive: new ChdRaw('rom.chd'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });

    const sorted = indexAndFind([chd, zip, plain]);

    expect(sorted[0]).toBe(plain);
  });

  it('should sort archive entries in type order: Zip < Tar < Rar < SevenZip < Cso < Rvz < ChdRaw', async () => {
    const chd = await ArchiveEntry.entryOf({
      archive: new ChdRaw('g.chd'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });
    const rvz = await ArchiveEntry.entryOf({
      archive: new Rvz('f.rvz'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });
    const cso = await ArchiveEntry.entryOf({
      archive: new Cso('e.cso'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });
    const sevenZip = await ArchiveEntry.entryOf({
      archive: new SevenZip('d.7z'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });
    const rar = await ArchiveEntry.entryOf({
      archive: new Rar('c.rar'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });
    const tar = await ArchiveEntry.entryOf({
      archive: new Tar('b.tar'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });
    const zip = await ArchiveEntry.entryOf({
      archive: new Zip('a.zip'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });

    const sorted = indexAndFind([chd, rvz, cso, sevenZip, rar, tar, zip]);

    expect(sorted[0]).toBe(zip);
    expect(sorted[1]).toBe(tar);
    expect(sorted[2]).toBe(rar);
    expect(sorted[3]).toBe(sevenZip);
    expect(sorted[4]).toBe(cso);
    expect(sorted[5]).toBe(rvz);
    expect(sorted[6]).toBe(chd);
  });
});

describe('preferFiletype', () => {
  it('should prefer plain files when preferFiletype=plain', async () => {
    const zip = await ArchiveEntry.entryOf({
      archive: new Zip('rom.zip'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });
    const plain = await File.fileOf({ filePath: 'rom.rom', size: SIZE, crc32: CRC });

    const sorted = indexAndFind([zip, plain], { preferFiletype: 'plain' });

    expect(sorted[0]).toBe(plain);
    expect(sorted[1]).toBe(zip);
  });

  it('should prefer archive entries when preferFiletype=archive', async () => {
    const zip = await ArchiveEntry.entryOf({
      archive: new Zip('rom.zip'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });
    const plain = await File.fileOf({ filePath: 'rom.rom', size: SIZE, crc32: CRC });

    const sorted = indexAndFind([plain, zip], { preferFiletype: 'archive' });

    expect(sorted[0]).toBeInstanceOf(ArchiveEntry);
    expect(sorted[1]).not.toBeInstanceOf(ArchiveEntry);
  });
});

describe('preferFilenameRegex', () => {
  it('should prefer files matching the regex', async () => {
    const other = await File.fileOf({ filePath: 'other/rom.rom', size: SIZE, crc32: CRC });
    const preferred = await File.fileOf({ filePath: 'preferred/rom.rom', size: SIZE, crc32: CRC });

    const sorted = indexAndFind([other, preferred], {
      preferFilenameRegex: 'preferred',
    });

    expect(sorted[0]).toBe(preferred);
    expect(sorted[1]).toBe(other);
  });

  it('should keep relative order when neither file matches the regex', async () => {
    const a = await File.fileOf({ filePath: 'a.rom', size: SIZE, crc32: CRC });
    const b = await File.fileOf({ filePath: 'b.rom', size: SIZE, crc32: CRC });

    const sorted = indexAndFind([a, b], { preferFilenameRegex: 'unmatched' });

    // Neither matches; falls back to deterministic toString sort
    expect(sorted[0]).toBe(a);
    expect(sorted[1]).toBe(b);
  });

  it('should keep relative order when all files match the regex', async () => {
    const a = await File.fileOf({ filePath: 'matching-a.rom', size: SIZE, crc32: CRC });
    const b = await File.fileOf({ filePath: 'matching-b.rom', size: SIZE, crc32: CRC });

    const sorted = indexAndFind([a, b], { preferFilenameRegex: 'matching' });

    // Both match; falls back to deterministic toString sort
    expect(sorted[0]).toBe(a);
    expect(sorted[1]).toBe(b);
  });
});

describe('overwrite preference', () => {
  const outputDir = path.resolve('/igir-test/output');

  it('should prefer files NOT in the output dir when overwrite=true', async () => {
    const inOutput = await File.fileOf({
      filePath: path.join(outputDir, 'rom.rom'),
      size: SIZE,
      crc32: CRC,
    });
    const notInOutput = await File.fileOf({
      filePath: path.resolve('/igir-test/input/rom.rom'),
      size: SIZE,
      crc32: CRC,
    });

    const sorted = indexAndFind([inOutput, notInOutput], {
      commands: ['copy'],
      output: outputDir,
      overwrite: true,
    });

    expect(sorted[0]).toBe(notInOutput);
    expect(sorted[1]).toBe(inOutput);
  });

  it('should prefer files NOT in the output dir when overwriteInvalid=true', async () => {
    const inOutput = await File.fileOf({
      filePath: path.join(outputDir, 'rom.rom'),
      size: SIZE,
      crc32: CRC,
    });
    const notInOutput = await File.fileOf({
      filePath: path.resolve('/igir-test/input/rom.rom'),
      size: SIZE,
      crc32: CRC,
    });

    const sorted = indexAndFind([inOutput, notInOutput], {
      commands: ['copy'],
      output: outputDir,
      overwriteInvalid: true,
    });

    expect(sorted[0]).toBe(notInOutput);
    expect(sorted[1]).toBe(inOutput);
  });

  it('should not apply output dir preference when neither overwrite nor overwriteInvalid is set', async () => {
    const inOutput = await File.fileOf({
      filePath: path.join(outputDir, 'rom.rom'),
      size: SIZE,
      crc32: CRC,
    });
    const notInOutput = await File.fileOf({
      // "/igir-test/aaa" sorts before "/igir-test/output" alphabetically
      filePath: path.resolve('/igir-test/aaa/rom.rom'),
      size: SIZE,
      crc32: CRC,
    });

    const sorted = indexAndFind([inOutput, notInOutput], {
      commands: ['copy'],
      output: outputDir,
    });

    // Falls back to deterministic toString (alphabetical); the non-output file's path sorts first
    // because "aaa" < "output" — output dir preference was NOT applied
    expect(sorted[0]).toBe(notInOutput);
    expect(sorted[1]).toBe(inOutput);
  });
});

describe('deterministic fallback', () => {
  it('should sort files alphabetically by path when all else is equal', async () => {
    const z = await File.fileOf({ filePath: 'z.rom', size: SIZE, crc32: CRC });
    const a = await File.fileOf({ filePath: 'a.rom', size: SIZE, crc32: CRC });
    const m = await File.fileOf({ filePath: 'm.rom', size: SIZE, crc32: CRC });

    const sorted = indexAndFind([z, m, a]);

    expect(sorted[0]).toBe(a);
    expect(sorted[1]).toBe(m);
    expect(sorted[2]).toBe(z);
  });

  it('should sort archive entries alphabetically by archive path when archive type is equal', async () => {
    const z = await ArchiveEntry.entryOf({
      archive: new Zip('z.zip'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });
    const a = await ArchiveEntry.entryOf({
      archive: new Zip('a.zip'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });
    const m = await ArchiveEntry.entryOf({
      archive: new Zip('m.zip'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });

    const sorted = indexAndFind([z, m, a]);

    expect(sorted[0]).toBe(a);
    expect(sorted[1]).toBe(m);
    expect(sorted[2]).toBe(z);
  });
});
