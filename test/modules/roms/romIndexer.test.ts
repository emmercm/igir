import path from 'node:path';

import ArchiveEntry from '../../../src/models/files/archives/archiveEntry.js';
import ChdRaw from '../../../src/models/files/archives/chd/chdRaw.js';
import Rvz from '../../../src/models/files/archives/dolphin/rvz.js';
import Gzip from '../../../src/models/files/archives/gzip.js';
import Cso from '../../../src/models/files/archives/maxcso/cso.js';
import NkitIso from '../../../src/models/files/archives/nkitIso.js';
import Rar from '../../../src/models/files/archives/rar.js';
import Bzip2 from '../../../src/models/files/archives/sevenZip/bzip2.js';
import Lzma from '../../../src/models/files/archives/sevenZip/lzma.js';
import Lzma86 from '../../../src/models/files/archives/sevenZip/lzma86.js';
import SevenZip from '../../../src/models/files/archives/sevenZip/sevenZip.js';
import Split from '../../../src/models/files/archives/sevenZip/split.js';
import Z from '../../../src/models/files/archives/sevenZip/z.js';
import ZipSpanned from '../../../src/models/files/archives/sevenZip/zipSpanned.js';
import ZipX from '../../../src/models/files/archives/sevenZip/zipX.js';
import Tar from '../../../src/models/files/archives/tar.js';
import Zip from '../../../src/models/files/archives/zip.js';
import File from '../../../src/models/files/file.js';
import type { OptionsProps } from '../../../src/models/options.js';
import Options from '../../../src/models/options.js';
import ROMIndexer from '../../../src/modules/roms/romIndexer.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const CRC = '12345678';
const SIZE = 1;

function createRomIndexer(props?: OptionsProps): ROMIndexer {
  return new ROMIndexer(new Options(props), new ProgressBarFake());
}

function indexAndFind(files: File[], props?: OptionsProps): File[] {
  return createRomIndexer(props).index(files).findFiles(files[0]);
}

describe('isOutputFile priority', () => {
  it('should prefer non-output files over output files', async () => {
    const plain = await File.fileOf({ filePath: 'input/rom.rom', size: SIZE, crc32: CRC });
    const outputFile = await File.fileOf({
      filePath: 'output/rom.rom',
      size: SIZE,
      crc32: CRC,
      canBeCandidateInput: false,
    });

    const sorted = indexAndFind([outputFile, plain]);

    expect(sorted[0]).toBe(plain);
    expect(sorted[1]).toBe(outputFile);
  });

  it('should apply isOutputFile preference before archive type preference', async () => {
    // Even a plain (preferred) file that is an output file should sort after a non-output zip
    const zip = await ArchiveEntry.entryOf({
      archive: new Zip('rom.zip'),
      entryPath: 'rom.rom',
      size: SIZE,
      crc32: CRC,
    });
    const outputPlain = await File.fileOf({
      filePath: 'output/rom.rom',
      size: SIZE,
      crc32: CRC,
      canBeCandidateInput: false,
    });

    const sorted = indexAndFind([outputPlain, zip]);

    expect(sorted[0]).toBe(zip);
    expect(sorted[1]).toBe(outputPlain);
  });

  it('should not affect ordering when all files are non-output', async () => {
    const a = await File.fileOf({ filePath: 'a.rom', size: SIZE, crc32: CRC });
    const b = await File.fileOf({ filePath: 'b.rom', size: SIZE, crc32: CRC });

    const sorted = indexAndFind([b, a]);

    // Falls back to deterministic toString sort
    expect(sorted[0]).toBe(a);
    expect(sorted[1]).toBe(b);
  });

  it('should not affect ordering when all files are output files', async () => {
    const a = await File.fileOf({
      filePath: 'output/a.rom',
      size: SIZE,
      crc32: CRC,
      canBeCandidateInput: false,
    });
    const b = await File.fileOf({
      filePath: 'output/b.rom',
      size: SIZE,
      crc32: CRC,
      canBeCandidateInput: false,
    });

    const sorted = indexAndFind([b, a]);

    // Falls back to deterministic toString sort
    expect(sorted[0]).toBe(a);
    expect(sorted[1]).toBe(b);
  });
});

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

  it('should give every archive type a distinct priority', async () => {
    const expected = [
      new Zip('rom.zip'),
      new Tar('rom.tar'),
      new Rar('rom.rar'),
      new Gzip('rom.gz'),
      new SevenZip('rom.7z'),
      new Z('rom.z'),
      new ZipSpanned('rom.zip.001'),
      new ZipX('rom.zipx'),
      new Bzip2('rom.bz2'),
      new Lzma86('rom.lzma86'),
      new Lzma('rom.lzma'),
      new Split('rom.001'),
      new Cso('rom.cso'),
      new Rvz('rom.rvz'),
      new ChdRaw('rom.chd'),
      new NkitIso('rom.nkit.iso'),
    ];
    const entries = await Promise.all(
      expected.map(
        async (archive) =>
          await ArchiveEntry.entryOf({ archive, entryPath: 'rom.rom', size: SIZE, crc32: CRC }),
      ),
    );

    // Index them in reverse, to prove the sort - not the input order - decides
    const sorted = indexAndFind(entries.toReversed());

    expect(sorted.map((file) => file.toString())).toEqual(entries.map((entry) => entry.toString()));
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

  it('should prefer plain files by default, even over archives with invented entry paths', async () => {
    const bzip2 = await ArchiveEntry.entryOf({
      archive: new Bzip2('a.bz2'),
      entryPath: 'a.rom',
      size: SIZE,
      crc32: CRC,
    });
    expect(bzip2.getArchive().hasMeaningfulEntryPaths()).toEqual(false);
    const plain = await File.fileOf({ filePath: 'z.rom', size: SIZE, crc32: CRC });

    const sorted = indexAndFind([bzip2, plain]);

    expect(sorted[0]).toBe(plain);
    expect(sorted[1]).toBe(bzip2);
  });

  it('should prefer archives with invented entry paths when preferFiletype=archive', async () => {
    const bzip2 = await ArchiveEntry.entryOf({
      archive: new Bzip2('a.bz2'),
      entryPath: 'b.rom',
      size: SIZE,
      crc32: CRC,
    });
    const plain = await File.fileOf({ filePath: 'z.rom', size: SIZE, crc32: CRC });

    const sorted = indexAndFind([plain, bzip2], { preferFiletype: 'archive' });

    expect(sorted[0]).toBe(bzip2);
    expect(sorted[1]).toBe(plain);
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
