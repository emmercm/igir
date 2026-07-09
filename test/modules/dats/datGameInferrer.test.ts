import os from 'node:os';

import MappableSemaphore from '../../../src/async/mappableSemaphore.js';
import FileCache from '../../../src/cache/fileCache.js';
import FileFactory from '../../../src/factories/fileFactory.js';
import Options from '../../../src/models/options.js';
import DATGameInferrer from '../../../src/modules/dats/datGameInferrer.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import ProgressBarFake from '../../console/progressBarFake.js';

test.each([
  [
    ['test/fixtures/roms/**/*'],
    {
      roms: [
        '2048',
        '4096',
        'best',
        'CD-ROM',
        'CD-ROM',
        'CD-ROM',
        'diagnostic_test_cartridge.a78',
        'empty',
        'fds_joypad_test.fds',
        'fizzbuzz',
        'foobar',
        'fourfive',
        'GameCube-240pSuite-1.19',
        'GD-ROM',
        'GD-ROM',
        'headered',
        'invalid',
        'LCDTestROM.lnx',
        'loremipsum',
        'one',
        'onetwothree',
        'patchable',
        'raw',
        'speed_test_v51.sfc',
        'three',
        'two',
        'UMD',
        'unknown',
      ],
    },
  ],
  [
    ['test/fixtures/roms/7z/*'],
    { '7z': ['fizzbuzz', 'foobar', 'invalid', 'loremipsum', 'onetwothree', 'unknown'] },
  ],
  [['test/fixtures/roms/chd/*'], { chd: ['2048', '4096', 'CD-ROM', 'CD-ROM', 'GD-ROM', 'GD-ROM'] }],
  [['test/fixtures/roms/cso/*'], { cso: ['UMD'] }],
  [['test/fixtures/roms/discs/*'], { discs: ['CD-ROM', 'GD-ROM', 'UMD'] }],
  [
    ['test/fixtures/roms/gz/*'],
    { gz: ['fizzbuzz', 'foobar', 'loremipsum', 'one', 'three', 'two', 'unknown'] },
  ],
  [
    ['test/fixtures/roms/headered/*'],
    {
      headered: [
        'allpads',
        'color_test',
        'diagnostic_test_cartridge.a78',
        'fds_joypad_test.fds',
        'LCDTestROM.lnx',
        'speed_test_v51',
      ],
    },
  ],
  [['test/fixtures/roms/headerless/*'], { headerless: ['speed_test_v51.sfc'] }],
  [['test/fixtures/roms/nkit/*'], { nkit: ['GameCube-240pSuite-1.19'] }],
  [
    ['test/fixtures/roms/rar/*'],
    { rar: ['fizzbuzz', 'foobar', 'invalid', 'loremipsum', 'onetwothree', 'unknown'] },
  ],
  [
    ['test/fixtures/roms/raw/*'],
    {
      raw: [
        'empty',
        'five',
        'fizzbuzz',
        'foobar',
        'four',
        'loremipsum',
        'one',
        'three',
        'trimmed',
        'two',
        'unknown',
      ],
    },
  ],
  [
    ['test/fixtures/roms/tar/*'],
    { tar: ['fizzbuzz', 'foobar', 'invalid', 'loremipsum', 'onetwothree', 'unknown'] },
  ],
  [
    ['test/fixtures/roms/zip/*'],
    { zip: ['fizzbuzz', 'foobar', 'fourfive', 'invalid', 'loremipsum', 'onetwothree', 'unknown'] },
  ],
  // Multiple input paths
  [
    [
      'test/fixtures/roms/headered',
      'test/fixtures/roms/patchable/*',
      'test/fixtures/roms/headerless/**/*',
    ],
    {
      headered: [
        'allpads',
        'color_test',
        'diagnostic_test_cartridge.a78',
        'fds_joypad_test.fds',
        'LCDTestROM.lnx',
        'speed_test_v51',
      ],
      patchable: [
        '0F09A40',
        '3708F2C',
        '612644F',
        '65D1206',
        '92C85C9',
        'before',
        'best',
        'C01173E',
        'KDULVQN',
      ],
      headerless: ['speed_test_v51.sfc'],
    },
  ],
])('should infer DATs: %s', async (input, expected) => {
  // Given
  const options = new Options({ input });
  const romFiles = await new ROMScanner(
    options,
    new ProgressBarFake(),
    new FileFactory(new FileCache()),
    new MappableSemaphore(os.availableParallelism()),
  ).scan();

  // When
  const dats = await new DATGameInferrer(options, new ProgressBarFake()).infer(romFiles);

  // Then
  const datNameToGameNames = Object.fromEntries(
    dats.map((dat) => [
      dat.getName(),
      dat
        .getGames()
        .map((game) => game.getName())
        .toSorted((a, b) => a.localeCompare(b)),
    ]),
  );
  expect(datNameToGameNames).toEqual(expected);
});
