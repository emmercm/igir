import DATGameInferrer from '../../src/modules/datGameInferrer.js';
import ROMScanner from '../../src/modules/romScanner.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

test.each([
  // One input path
  [['test/fixtures/roms/**/*'], { roms: 28 }],
  [['test/fixtures/roms/7z/*'], { '7z': 5 }],
  [['test/fixtures/roms/gz/*'], { gz: 7 }],
  [['test/fixtures/roms/rar/*'], { rar: 5 }],
  [['test/fixtures/roms/raw/*'], { raw: 10 }],
  [['test/fixtures/roms/tar/*'], { tar: 5 }],
  [['test/fixtures/roms/zip/*'], { zip: 6 }],
  // Multiple input paths
  [[
    'test/fixtures/roms/headered',
    'test/fixtures/roms/patchable/*',
    'test/fixtures/roms/headerless/**/*',
  ], {
    headered: 6,
    patchable: 9,
    headerless: 1,
  }],
])('should infer DATs: %s', async (input, expected) => {
  // Given
  const options = new Options({ input });
  const romFiles = await new ROMScanner(options, new ProgressBarFake()).scan();

  // When
  const dats = new DATGameInferrer(options, new ProgressBarFake()).infer(romFiles);

  // Then
  const datNameToGameCount = Object.fromEntries(
    dats.map((dat) => [dat.getName(), dat.getGames().length]),
  );
  expect(datNameToGameCount).toEqual(expected);
});
