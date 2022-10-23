import DATInferrer from '../../src/modules/datInferrer.js';
import ROMScanner from '../../src/modules/romScanner.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

test.each([
  ['test/fixtures/roms/**/*', {
    'test/fixtures/roms': 5, 'test/fixtures/roms/7z': 5, 'test/fixtures/roms/headered': 6, 'test/fixtures/roms/rar': 5, 'test/fixtures/roms/raw': 8, 'test/fixtures/roms/tar': 5, 'test/fixtures/roms/unheadered': 1, 'test/fixtures/roms/zip': 5,
  }],
  ['test/fixtures/roms/7z/*', { 'test/fixtures/roms/7z': 5 }],
  ['test/fixtures/roms/rar/*', { 'test/fixtures/roms/rar': 5 }],
  ['test/fixtures/roms/raw/*', { 'test/fixtures/roms/raw': 8 }],
  ['test/fixtures/roms/tar/*', { 'test/fixtures/roms/tar': 5 }],
  ['test/fixtures/roms/zip/*', { 'test/fixtures/roms/zip': 5 }],
])('should infer DATs: %s', async (inputGlob, expected) => {
  // Given
  const romFiles = await new ROMScanner(new Options({
    input: [inputGlob],
  }), new ProgressBarFake()).scan();

  // When
  const dats = DATInferrer.infer(romFiles);

  // Then
  const datNameToGameCount = dats.reduce((map, dat) => ({
    ...map,
    [dat.getName()]: dat.getGames().length,
  }), {});
  expect(datNameToGameCount).toEqual(expected);
});
