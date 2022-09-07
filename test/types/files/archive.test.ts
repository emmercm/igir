import ArchiveFactory from '../../../src/types/files/archiveFactory.js';

describe('getArchiveEntries', () => {
  // TODO(cemmer): fixture archives with multiple entries
  test.each([
    // fizzbuzz
    ['./test/fixtures/roms/7z/fizzbuzz.7z', 'fizzbuzz.rom', '370517b5'],
    ['./test/fixtures/roms/rar/fizzbuzz.rar', 'fizzbuzz.rom', '370517b5'],
    ['./test/fixtures/roms/zip/fizzbuzz.zip', 'fizzbuzz.rom', '370517b5'],
    // foobar
    ['./test/fixtures/roms/7z/foobar.7z', 'foobar.rom', 'b22c9747'],
    ['./test/fixtures/roms/rar/foobar.rar', 'foobar.rom', 'b22c9747'],
    ['./test/fixtures/roms/zip/foobar.zip', 'foobar.rom', 'b22c9747'],
    // loremipsum
    ['./test/fixtures/roms/7z/loremipsum.7z', 'loremipsum.rom', '70856527'],
    ['./test/fixtures/roms/rar/loremipsum.rar', 'loremipsum.rom', '70856527'],
    ['./test/fixtures/roms/zip/loremipsum.zip', 'loremipsum.rom', '70856527'],
    // unknown
    ['./test/fixtures/roms/7z/unknown.7z', 'unknown.rom', '377a7727'],
    ['./test/fixtures/roms/rar/unknown.rar', 'unknown.rom', '377a7727'],
    ['./test/fixtures/roms/zip/unknown.zip', 'unknown.rom', '377a7727'],
  ])('should enumerate the single file archive %s', async (filePath, expectedEntryPath, expectedCrc) => {
    const archive = ArchiveFactory.archiveFrom(filePath);

    const entries = await archive.getArchiveEntries();
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry.getEntryPath()).toEqual(expectedEntryPath);
    await expect(entry.getCrc32()).resolves.toEqual(expectedCrc);
  });
});
