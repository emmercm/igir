import os from 'node:os';
import path from 'node:path';

import which from 'which';

import DATScanner from '../../../src/modules/dats/datScanner.js';
import FileCache from '../../../src/types/files/fileCache.js';
import FileFactory from '../../../src/types/files/fileFactory.js';
import Options, { OptionsProps } from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

function createDatScanner(props: OptionsProps): DATScanner {
  return new DATScanner(
    new Options(props),
    new ProgressBarFake(),
    new FileFactory(new FileCache()),
  );
}

test.each([
  [['/completely/invalid/path']],
  [['/completely/invalid/path', os.devNull]],
  [['test/fixtures/**/*.tmp']],
  [['test/fixtures/dats/*foo*/*bar*']],
])('should throw on nonexistent paths: %s', async (dat) => {
  await expect(createDatScanner({ dat }).scan()).rejects.toThrow(/no files found/i);
});

test.each([[[]], [['']], [[os.devNull]]])('should throw on no results: %s', async (dat) => {
  await expect(createDatScanner({ dat }).scan()).rejects.toThrow(/no files found/i);
});

test.each([[['http://completelybadurl']], [['https://completelybadurl']]])(
  'should throw on bad URLs: %s',
  async (dat) => {
    await expect(createDatScanner({ dat }).scan()).rejects.toThrow(/failed to download/i);
  },
);

test.each([[['test/fixtures/**/empty.*']], [['test/fixtures/{dats,roms}/empty.*']]])(
  'should not throw on empty files: %s',
  async (dat) => {
    await expect(createDatScanner({ dat }).scan()).resolves.toHaveLength(0);
  },
);

test.each([
  [['test/fixtures/**/invalid.*']],
  [['test/fixtures/roms']],
  [['test/fixtures/roms/*']],
  [['test/fixtures/roms/*.rom']],
  [['test/fixtures/roms/invalid.*']],
  [['test/fixtures/roms/invalid.*', 'test/fixtures/roms/invalid.*']],
])('should not throw on non-DATs: %s', async (dat) => {
  await expect(createDatScanner({ dat }).scan()).resolves.toHaveLength(0);
});

it('should not throw on non-MAME executables', async () => {
  const executable = await which(process.platform === 'win32' ? 'ping.exe' : 'echo');
  await expect(createDatScanner({ dat: [executable] }).scan()).resolves.toHaveLength(0);
});

describe('multiple files', () => {
  const totalDatFiles = 12;

  test.each([
    [[path.join(process.cwd(), 'test', 'fixtures', 'dats')]],
    [['test/fixtures/dats']],
    [['test/fixtures/dats/**']],
    [['test/fixtures/dats/**', 'test/fixtures/**/*.dat']],
    [[path.join(process.cwd(), 'test', 'fixtures', '**', '*.{dat,txt,zip}')]],
    [['test/fixtures/**/*.{dat,txt,zip}']],
    [['test/fixtures/**/*.{dat,txt,zip}', 'test/fixtures/**/*.{dat,txt,zip}']],
  ])('no files are path excluded: %s', async (dat) => {
    await expect(createDatScanner({ dat }).scan()).resolves.toHaveLength(totalDatFiles);
  });

  test.each([
    [['test/fixtures/**/*.dat'], 1],
    [['test/fixtures/**/*.zip'], totalDatFiles - 1],
  ])('some files are path excluded: %s', async (datExclude, expectedDats) => {
    await expect(
      createDatScanner({ dat: ['test/fixtures/dats'], datExclude }).scan(),
    ).resolves.toHaveLength(expectedDats);
  });

  test.each([
    [['test/fixtures/dats']],
    [['test/fixtures/dats/**']],
    [['test/fixtures/dats/**', 'test/fixtures/**/*.dat']],
    [['test/fixtures/**/*.{dat,txt,zip}']],
    [['test/fixtures/**/*.{dat,txt,zip}', 'test/fixtures/**/*.{dat,txt,zip}']],
  ])('all files are path excluded: %s', async (datExclude) => {
    await expect(
      createDatScanner({ dat: ['test/fixtures/dats'], datExclude }).scan(),
    ).resolves.toHaveLength(0);
  });

  test.each([
    ['/abcdefg/', 0],
    ['/(one|two)/i', 3],
    ['[a-z]', totalDatFiles],
  ])('some files are name regex filtered: %s', async (datNameRegex, expectedDats) => {
    await expect(
      createDatScanner({ dat: ['test/fixtures/dats'], datNameRegex }).scan(),
    ).resolves.toHaveLength(expectedDats);
  });

  test.each([
    ['[a-z]', 0],
    ['/(one|two)/i', totalDatFiles - 3],
    ['/abcdefg/', totalDatFiles],
  ])('some files are name regex excluded: %s', async (datNameRegexExclude, expectedDats) => {
    await expect(
      createDatScanner({ dat: ['test/fixtures/dats'], datNameRegexExclude }).scan(),
    ).resolves.toHaveLength(expectedDats);
  });

  test.each([
    ['/abcdefg/', 0],
    ['/(one|two)/i', 3],
    ['[a-z]', totalDatFiles],
  ])('some files are description regex filtered: %s', async (datDescriptionRegex, expectedDats) => {
    await expect(
      createDatScanner({ dat: ['test/fixtures/dats'], datDescriptionRegex }).scan(),
    ).resolves.toHaveLength(expectedDats);
  });

  test.each([
    ['[a-z]', 0],
    ['/(one|two)/i', totalDatFiles - 3],
    ['/abcdefg/', totalDatFiles],
  ])(
    'some files are description regex excluded: %s',
    async (datDescriptionRegexExclude, expectedDats) => {
      await expect(
        createDatScanner({ dat: ['test/fixtures/dats'], datDescriptionRegexExclude }).scan(),
      ).resolves.toHaveLength(expectedDats);
    },
  );
});

describe('single files', () => {
  test.each([
    path.join(process.cwd(), 'test', 'fixtures', 'dats', 'one.*'),
    'test/fixtures/dats/one.*',
    'test/fixtures/*/one.dat',
    'test/fixtures/dats/one.dat',
  ])('should parse the single DAT: %s', async (dat) => {
    await expect(createDatScanner({ dat: [dat] }).scan()).resolves.toHaveLength(1);
  });

  test.each([
    [
      path.join(
        'test',
        'fixtures',
        'dats',
        'snes',
        'HTGD-snes-c411a8e9d909cc4b03027c115be61822af8ad842.dat',
      ),
      13_770,
      13_774,
      13_772,
    ],
    [
      path.join(
        'test',
        'fixtures',
        'dats',
        'snes',
        'libretro-database-snes-b768da11d5d7075e2a721d44c74bf3dcbeeb8f98.dat',
      ),
      3851,
      3851,
      3851,
    ],
    [
      path.join('test', 'fixtures', 'dats', 'snes', 'mame0263-getsoftlist-snes.dat'),
      1909,
      3690,
      4271,
    ],
    [
      path.join(
        'test',
        'fixtures',
        'dats',
        'snes',
        'mame-hash-snes-ed45a4f2234147bde0d8ee960c118066330886b3.dat',
      ),
      1909,
      3690,
      4271,
    ],
    [
      path.join(
        'test',
        'fixtures',
        'dats',
        'snes',
        'Nintendo - Super Nintendo Entertainment System (20240317-134803).dat',
      ),
      3952,
      3952,
      3953,
    ],
    [
      path.join(
        'test',
        'fixtures',
        'dats',
        'snes',
        'Nintendo - Super Nintendo Entertainment System (Parent-Clone) (20240317-134803).dat',
      ),
      1959,
      4110,
      4111,
    ],
  ])(
    'should parse the single SNES DAT: %s',
    async (datPath, expectedParents, expectedGames, expectedRoms) => {
      const dats = await createDatScanner({ dat: [datPath] }).scan();
      expect(dats).toHaveLength(1);
      const dat = dats[0];
      expect(dat.getParents()).toHaveLength(expectedParents);
      expect(dat.getGames()).toHaveLength(expectedGames);
      expect(dat.getGames().flatMap((game) => game.getRoms())).toHaveLength(expectedRoms);
    },
  );
});
