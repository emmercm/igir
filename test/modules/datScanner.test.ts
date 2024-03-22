import os from 'node:os';
import path from 'node:path';

import which from 'which';

import DATScanner from '../../src/modules/datScanner.js';
import Options, { OptionsProps } from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

function createDatScanner(props: OptionsProps): DATScanner {
  return new DATScanner(
    new Options(props),
    new ProgressBarFake(),
  );
}

test.each([
  [['/completely/invalid/path']],
  [['/completely/invalid/path', os.devNull]],
  [['/completely/invalid/path', 'test/fixtures/dats']],
  [['test/fixtures/**/*.tmp']],
  [['test/fixtures/dats/*foo*/*bar*']],
])('should throw on nonexistent paths: %s', async (dat) => {
  await expect(createDatScanner({ dat }).scan()).rejects.toThrow(/no files found/i);
});

test.each([
  [[]],
  [['']],
  [[os.devNull]],
  [['http://completelybadurl']],
  [['https://completelybadurl']],
])('should return empty list on no results', async (dat) => {
  await expect(createDatScanner({ dat }).scan()).resolves.toHaveLength(0);
});

test.each([
  [['test/fixtures/**/empty.*']],
  [['test/fixtures/{dats,roms}/empty.*']],
])('should not throw on empty files', async (dat) => {
  await expect(createDatScanner({ dat }).scan()).resolves.toHaveLength(0);
});

test.each([
  [['test/fixtures/**/invalid.*']],
  [['test/fixtures/roms']],
  [['test/fixtures/roms/*']],
  [['test/fixtures/roms/*.rom']],
  [['test/fixtures/roms/invalid.*']],
  [['test/fixtures/roms/invalid.*', 'test/fixtures/roms/invalid.*']],
])('should not throw on non-DATs', async (dat) => {
  await expect(createDatScanner({ dat }).scan()).resolves.toHaveLength(0);
});

it('should not throw on non-MAME executables', async () => {
  const echo = await which('echo');
  await expect(createDatScanner({ dat: [echo] }).scan()).resolves.toHaveLength(0);
});

describe('multiple files', () => {
  const totalDatFiles = 12;

  test.each([
    [[path.join(path.resolve(), 'test', 'fixtures', 'dats')]],
    [['test/fixtures/dats']],
    [['test/fixtures/dats/**']],
    [['test/fixtures/dats/**', 'test/fixtures/**/*.dat']],
    [[path.join(path.resolve(), 'test', 'fixtures', '**', '*.{dat,txt,zip}')]],
    [['test/fixtures/**/*.{dat,txt,zip}']],
    [['test/fixtures/**/*.{dat,txt,zip}', 'test/fixtures/**/*.{dat,txt,zip}']],
  ])('no files are path excluded', async (dat) => {
    await expect(createDatScanner({ dat }).scan()).resolves.toHaveLength(totalDatFiles);
  });

  it('some files are path excluded', async () => {
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datExclude: ['test/fixtures/**/*.dat'] }).scan()).resolves.toHaveLength(1);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datExclude: ['test/fixtures/**/*.zip'] }).scan()).resolves.toHaveLength(totalDatFiles - 1);
  });

  test.each([
    [['test/fixtures/dats']],
    [['test/fixtures/dats/**']],
    [['test/fixtures/dats/**', 'test/fixtures/**/*.dat']],
    [['test/fixtures/**/*.{dat,txt,zip}']],
    [['test/fixtures/**/*.{dat,txt,zip}', 'test/fixtures/**/*.{dat,txt,zip}']],
  ])('all files are path excluded', async (datExclude) => {
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datExclude }).scan()).resolves.toHaveLength(0);
  });

  it('some files are name regex filtered', async () => {
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datNameRegex: '/abcdefg/' }).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datNameRegex: '/(one|two)/i' }).scan()).resolves.toHaveLength(3);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datNameRegex: '[a-z]' }).scan()).resolves.toHaveLength(totalDatFiles);
  });

  it('some files are name regex excluded', async () => {
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datNameRegexExclude: '[a-z]' }).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datNameRegexExclude: '/(one|two)/i' }).scan()).resolves.toHaveLength(totalDatFiles - 3);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datNameRegexExclude: '/abcdefg/' }).scan()).resolves.toHaveLength(totalDatFiles);
  });

  it('some files are description regex filtered', async () => {
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datDescriptionRegex: '/abcdefg/' }).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datDescriptionRegex: '/(one|two)/i' }).scan()).resolves.toHaveLength(3);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datDescriptionRegex: '[a-z]' }).scan()).resolves.toHaveLength(totalDatFiles);
  });

  it('some files are description regex excluded', async () => {
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datDescriptionRegexExclude: '[a-z]' }).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datDescriptionRegexExclude: '/(one|two)/i' }).scan()).resolves.toHaveLength(totalDatFiles - 3);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datDescriptionRegexExclude: '/abcdefg/' }).scan()).resolves.toHaveLength(totalDatFiles);
  });
});

describe('single files', () => {
  test.each([
    path.join(path.resolve(), 'test', 'fixtures', 'dats', 'one.*'),
    'test/fixtures/dats/one.*',
    'test/fixtures/*/one.dat',
    'test/fixtures/dats/one.dat',
  ])('should parse the single file: %s', async (dat) => {
    await expect(createDatScanner({ dat: [dat] }).scan()).resolves.toHaveLength(1);
  });

  test.each([
    [path.join('test', 'fixtures', 'dats', 'snes', 'HTGD-snes-c411a8e9d909cc4b03027c115be61822af8ad842.dat'), 13_770, 13_774, 13_772],
    [path.join('test', 'fixtures', 'dats', 'snes', 'libretro-database-snes-5cfb6cd3d742d60da99a18d5472e8c8a9791c36e.dat'), 24, 25, 25],
    [path.join('test', 'fixtures', 'dats', 'snes', 'mame0263-getsoftlist-snes.dat'), 1909, 3690, 4271],
    [path.join('test', 'fixtures', 'dats', 'snes', 'mame-hash-snes-ed45a4f2234147bde0d8ee960c118066330886b3.dat'), 1909, 3690, 4271],
    [path.join('test', 'fixtures', 'dats', 'snes', 'Nintendo - Super Nintendo Entertainment System (20240317-134803).dat'), 3952, 3952, 3953],
    [path.join('test', 'fixtures', 'dats', 'snes', 'Nintendo - Super Nintendo Entertainment System (Parent-Clone) (20240317-134803).dat'), 1959, 4110, 4111],
  ])('should parse the single file: %s', async (datPath, expectedParents, expectedGames, expectedRoms) => {
    const dats = await createDatScanner({ dat: [datPath] }).scan();
    expect(dats).toHaveLength(1);
    const dat = dats[0];
    expect(dat.getParents()).toHaveLength(expectedParents);
    expect(dat.getGames()).toHaveLength(expectedGames);
    expect(dat.getGames().flatMap((game) => game.getRoms())).toHaveLength(expectedRoms);
  });
});
