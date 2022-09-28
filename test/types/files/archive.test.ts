import path from 'path';

import ArchiveFactory from '../../../src/types/archives/archiveFactory.js';

describe('getArchiveEntries', () => {
  // TODO(cemmer): fixture archives with multiple entries
  test.each([
    // fizzbuzz
    ['./test/fixtures/roms/7z/fizzbuzz.7z', 'fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', 'fizzbuzz.nes', '370517b5'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', 'fizzbuzz.nes', '370517b5'],
    // foobar
    ['./test/fixtures/roms/7z/foobar.7z', 'foobar.lnx', 'b22c9747'],
    ['./test/fixtures/roms/rar/foobar.rar', 'foobar.lnx', 'b22c9747'],
    ['./test/fixtures/roms/zip/foobar.zip', 'foobar.lnx', 'b22c9747'],
    // loremipsum
    ['./test/fixtures/roms/7z/loremipsum.7z', 'loremipsum.rom', '70856527'],
    ['./test/fixtures/roms/rar/loremipsum.rar', 'loremipsum.rom', '70856527'],
    ['./test/fixtures/roms/zip/loremipsum.zip', 'loremipsum.rom', '70856527'],
    // unknown
    ['./test/fixtures/roms/7z/unknown.7z', 'unknown.rom', '377a7727'],
    ['./test/fixtures/roms/rar/unknown.rar', 'unknown.rom', '377a7727'],
    ['./test/fixtures/roms/zip/unknown.zip', 'unknown.rom', '377a7727'],
  ])('should enumerate the single file archive: %s', async (filePath, expectedEntryPath, expectedCrc) => {
    const archive = ArchiveFactory.archiveFrom(filePath);

    const entries = await archive.getArchiveEntries();
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry.getEntryPath()).toEqual(expectedEntryPath);
    await expect(entry.getCrc32()).resolves.toEqual(expectedCrc);
  });

  test.each([
    ['./test/fixtures/roms/7z/onetwothree.7z', [['1/one.rom', 'f817a89f'], ['2/two.rom', '96170874'], ['3/three.rom', 'ff46c5d8']]],
    ['./test/fixtures/roms/rar/onetwothree.rar', [['1/one.rom', 'f817a89f'], ['2/two.rom', '96170874'], ['3/three.rom', 'ff46c5d8']]],
    ['./test/fixtures/roms/zip/onetwothree.zip', [['1/one.rom', 'f817a89f'], ['2/two.rom', '96170874'], ['3/three.rom', 'ff46c5d8']]],
  ])('should enumerate the multi file archive: %s', async (filePath, expectedEntries) => {
    const archive = ArchiveFactory.archiveFrom(filePath);

    const entries = await archive.getArchiveEntries();
    expect(entries).toHaveLength(expectedEntries.length);

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const expectedEntry = expectedEntries[i];
      expect(entry.getEntryPath()).toEqual(expectedEntry[0].replace(/[\\/]/g, path.sep));
      await expect(entry.getCrc32()).resolves.toEqual(expectedEntry[1]);
    }
  });
});
