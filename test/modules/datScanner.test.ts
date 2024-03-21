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

it('should throw on nonexistent paths', async () => {
  await expect(createDatScanner({ dat: ['/completely/invalid/path'] }).scan()).rejects.toThrow(/no files found/i);
  await expect(createDatScanner({ dat: ['/completely/invalid/path', os.devNull] }).scan()).rejects.toThrow(/no files found/i);
  await expect(createDatScanner({ dat: ['/completely/invalid/path', 'test/fixtures/dats'] }).scan()).rejects.toThrow(/no files found/i);
  await expect(createDatScanner({ dat: ['test/fixtures/**/*.tmp'] }).scan()).rejects.toThrow(/no files found/i);
  await expect(createDatScanner({ dat: ['test/fixtures/dats/*foo*/*bar*'] }).scan()).rejects.toThrow(/no files found/i);
});

it('should return empty list on no results', async () => {
  await expect(createDatScanner({ dat: [] }).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner({ dat: [''] }).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner({ dat: [os.devNull] }).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner({ dat: ['http://completelybadurl'] }).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner({ dat: ['https://completelybadurl'] }).scan()).resolves.toHaveLength(0);
});

it('should not throw on empty files', async () => {
  await expect(createDatScanner({ dat: ['test/fixtures/**/empty.*'] }).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner({ dat: ['test/fixtures/{dats,roms}/empty.*'] }).scan()).resolves.toHaveLength(0);
});

it('should not throw on non-DATs', async () => {
  await expect(createDatScanner({ dat: ['test/fixtures/**/invalid.*'] }).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner({ dat: ['test/fixtures/roms'] }).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner({ dat: ['test/fixtures/roms/*'] }).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner({ dat: ['test/fixtures/roms/*.rom'] }).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner({ dat: ['test/fixtures/roms/invalid.*'] }).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner({ dat: ['test/fixtures/roms/invalid.*', 'test/fixtures/roms/invalid.*'] }).scan()).resolves.toHaveLength(0);
});

it('should not throw on non-MAME executables', async () => {
  const echo = await which('echo');
  await expect(createDatScanner({ dat: [echo] }).scan()).resolves.toHaveLength(0);
});

describe('multiple files', () => {
  const totalDatFiles = 6;

  it('no files are path excluded', async () => {
    await expect(createDatScanner({ dat: [path.join(path.resolve(), 'test', 'fixtures', 'dats')] }).scan()).resolves.toHaveLength(totalDatFiles);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'] }).scan()).resolves.toHaveLength(totalDatFiles);
    await expect(createDatScanner({ dat: ['test/fixtures/dats/*'] }).scan()).resolves.toHaveLength(totalDatFiles);
    await expect(createDatScanner({ dat: ['test/fixtures/dats/*', 'test/fixtures/**/*.dat'] }).scan()).resolves.toHaveLength(totalDatFiles);
    await expect(createDatScanner({ dat: [path.join(path.resolve(), 'test', 'fixtures', '**', '*.{dat,txt,zip}')] }).scan()).resolves.toHaveLength(totalDatFiles);
    await expect(createDatScanner({ dat: ['test/fixtures/**/*.{dat,txt,zip}'] }).scan()).resolves.toHaveLength(totalDatFiles);
    await expect(createDatScanner({ dat: ['test/fixtures/**/*.{dat,txt,zip}', 'test/fixtures/**/*.{dat,txt,zip}'] }).scan()).resolves.toHaveLength(totalDatFiles);
  });

  it('some files are path excluded', async () => {
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datExclude: ['test/fixtures/**/*.dat'] }).scan()).resolves.toHaveLength(1);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datExclude: ['test/fixtures/**/*.zip'] }).scan()).resolves.toHaveLength(totalDatFiles - 1);
  });

  it('all files are path excluded', async () => {
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datExclude: ['test/fixtures/dats'] }).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datExclude: ['test/fixtures/dats/*'] }).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datExclude: ['test/fixtures/dats/*', 'test/fixtures/**/*.dat'] }).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datExclude: ['test/fixtures/**/*.{dat,txt,zip}'] }).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datExclude: ['test/fixtures/**/*.{dat,txt,zip}', 'test/fixtures/**/*.{dat,txt,zip}'] }).scan()).resolves.toHaveLength(0);
  });

  it('some files are name regex filtered', async () => {
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datNameRegex: '/abcdefg/' }).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datNameRegex: '/(one|two)/i' }).scan()).resolves.toHaveLength(2);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datNameRegex: '[a-z]' }).scan()).resolves.toHaveLength(totalDatFiles);
  });

  it('some files are name regex excluded', async () => {
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datNameRegexExclude: '[a-z]' }).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datNameRegexExclude: '/(one|two)/i' }).scan()).resolves.toHaveLength(totalDatFiles - 2);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datNameRegexExclude: '/abcdefg/' }).scan()).resolves.toHaveLength(totalDatFiles);
  });

  it('some files are description regex filtered', async () => {
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datDescriptionRegex: '/abcdefg/' }).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datDescriptionRegex: '/(one|two)/i' }).scan()).resolves.toHaveLength(2);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datDescriptionRegex: '[a-z]' }).scan()).resolves.toHaveLength(totalDatFiles);
  });

  it('some files are description regex excluded', async () => {
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datDescriptionRegexExclude: '[a-z]' }).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datDescriptionRegexExclude: '/(one|two)/i' }).scan()).resolves.toHaveLength(totalDatFiles - 2);
    await expect(createDatScanner({ dat: ['test/fixtures/dats'], datDescriptionRegexExclude: '/abcdefg/' }).scan()).resolves.toHaveLength(totalDatFiles);
  });
});

describe('single files', () => {
  test.each([
    path.join(path.resolve(), 'test', 'fixtures', 'dats', 'one.*'),
    'test/fixtures/dats/one.*',
    'test/fixtures/*/one.dat',
    'test/fixtures/dats/one.dat',
  ])('should scan single files: %s', async (dat) => {
    await expect(createDatScanner({ dat: [dat] }).scan()).resolves.toHaveLength(1);
  });
});
