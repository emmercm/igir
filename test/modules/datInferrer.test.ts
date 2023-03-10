import DATInferrer from '../../src/modules/datInferrer.js';
import ROMScanner from '../../src/modules/romScanner.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

test.each([
  ['test/fixtures/roms/**/*', {
    '7z': 5,
    headered: 6,
    patchable: 9,
    rar: 5,
    raw: 8,
    roms: 5,
    tar: 5,
    unheadered: 1,
    zip: 5,
  }],
  ['test/fixtures/roms/7z/*', { '7z': 5 }],
  ['test/fixtures/roms/rar/*', { rar: 5 }],
  ['test/fixtures/roms/raw/*', { raw: 8 }],
  ['test/fixtures/roms/tar/*', { tar: 5 }],
  ['test/fixtures/roms/zip/*', { zip: 5 }],
])('should infer DATs: %s', async (inputGlob, expected) => {
  // Given
  const romFiles = await new ROMScanner(new Options({
    input: [inputGlob],
  }), new ProgressBarFake()).scan();

  // When
  const dats = await new DATInferrer(new ProgressBarFake()).infer(romFiles);

  // Then
  const datNameToGameCount = dats.reduce((map, dat) => ({
    ...map,
    [dat.getName()]: dat.getGames().length,
  }), {});
  expect(datNameToGameCount).toEqual(expected);
});
