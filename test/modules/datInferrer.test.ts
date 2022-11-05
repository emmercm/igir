import path from 'path';

import DATInferrer from '../../src/modules/datInferrer.js';
import ROMScanner from '../../src/modules/romScanner.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

test.each([
  ['test/fixtures/roms/**/*', {
    [path.join('test', 'fixtures', 'roms')]: 5,
    [path.join('test', 'fixtures', 'roms', '7z')]: 5,
    [path.join('test', 'fixtures', 'roms', 'headered')]: 6,
    [path.join('test', 'fixtures', 'roms', 'patchable')]: 4,
    [path.join('test', 'fixtures', 'roms', 'rar')]: 5,
    [path.join('test', 'fixtures', 'roms', 'raw')]: 8,
    [path.join('test', 'fixtures', 'roms', 'tar')]: 5,
    [path.join('test', 'fixtures', 'roms', 'unheadered')]: 1,
    [path.join('test', 'fixtures', 'roms', 'zip')]: 5,
  }],
  ['test/fixtures/roms/7z/*', { [path.join('test', 'fixtures', 'roms', '7z')]: 5 }],
  ['test/fixtures/roms/rar/*', { [path.join('test', 'fixtures', 'roms', 'rar')]: 5 }],
  ['test/fixtures/roms/raw/*', { [path.join('test', 'fixtures', 'roms', 'raw')]: 8 }],
  ['test/fixtures/roms/tar/*', { [path.join('test', 'fixtures', 'roms', 'tar')]: 5 }],
  ['test/fixtures/roms/zip/*', { [path.join('test', 'fixtures', 'roms', 'zip')]: 5 }],
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
