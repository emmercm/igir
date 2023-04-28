import os from 'os';
import path from 'path';

import DATScanner from '../../src/modules/datScanner.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

function createDatScanner(
  dat: string[],
  datExclude: string[] = [],
  datRegex = '',
  datRegexExclude = '',
): DATScanner {
  return new DATScanner(
    new Options({
      dat, datExclude, datRegex, datRegexExclude,
    }),
    new ProgressBarFake(),
  );
}

it('should throw on nonexistent paths', async () => {
  await expect(createDatScanner(['/completely/invalid/path']).scan()).rejects.toThrow(/no files found/i);
  await expect(createDatScanner(['/completely/invalid/path', os.devNull]).scan()).rejects.toThrow(/no files found/i);
  await expect(createDatScanner(['/completely/invalid/path', 'test/fixtures/dats']).scan()).rejects.toThrow(/no files found/i);
  await expect(createDatScanner(['test/fixtures/**/*.tmp']).scan()).rejects.toThrow(/no files found/i);
  await expect(createDatScanner(['test/fixtures/dats/*foo*/*bar*']).scan()).rejects.toThrow(/no files found/i);
});

it('should return empty list on no results', async () => {
  await expect(createDatScanner([]).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner(['']).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner([os.devNull]).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner(['http://completelybadurl']).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner(['https://completelybadurl']).scan()).resolves.toHaveLength(0);
});

it('should not throw on empty files', async () => {
  await expect(createDatScanner(['test/fixtures/**/empty.*']).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner(['test/fixtures/{dats,roms}/empty.*']).scan()).resolves.toHaveLength(0);
});

it('should not throw on non-DATs', async () => {
  await expect(createDatScanner(['test/fixtures/**/invalid.*']).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner(['test/fixtures/roms']).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner(['test/fixtures/roms/*']).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner(['test/fixtures/roms/*.rom']).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner(['test/fixtures/roms/invalid.*']).scan()).resolves.toHaveLength(0);
  await expect(createDatScanner(['test/fixtures/roms/invalid.*', 'test/fixtures/roms/invalid.*']).scan()).resolves.toHaveLength(0);
});

describe('multiple files', () => {
  const totalDatFiles = 5;

  it('no files are path excluded', async () => {
    await expect(createDatScanner([path.join(path.resolve(), 'test', 'fixtures', 'dats')]).scan()).resolves.toHaveLength(totalDatFiles);
    await expect(createDatScanner(['test/fixtures/dats']).scan()).resolves.toHaveLength(totalDatFiles);
    await expect(createDatScanner(['test/fixtures/dats/*']).scan()).resolves.toHaveLength(totalDatFiles);
    await expect(createDatScanner(['test/fixtures/dats/*', 'test/fixtures/**/*.dat']).scan()).resolves.toHaveLength(totalDatFiles);
    await expect(createDatScanner([path.join(path.resolve(), 'test', 'fixtures', '**', '*.{dat,txt,zip}')]).scan()).resolves.toHaveLength(totalDatFiles);
    await expect(createDatScanner(['test/fixtures/**/*.{dat,txt,zip}']).scan()).resolves.toHaveLength(totalDatFiles);
    await expect(createDatScanner(['test/fixtures/**/*.{dat,txt,zip}', 'test/fixtures/**/*.{dat,txt,zip}']).scan()).resolves.toHaveLength(totalDatFiles);
  });

  it('some files are path excluded', async () => {
    await expect(createDatScanner(['test/fixtures/dats'], ['test/fixtures/**/*.dat']).scan()).resolves.toHaveLength(2);
    await expect(createDatScanner(['test/fixtures/dats'], ['test/fixtures/**/*.zip']).scan()).resolves.toHaveLength(4);
  });

  it('all files are path excluded', async () => {
    await expect(createDatScanner(['test/fixtures/dats'], ['test/fixtures/dats']).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner(['test/fixtures/dats'], ['test/fixtures/dats/*']).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner(['test/fixtures/dats'], ['test/fixtures/dats/*', 'test/fixtures/**/*.dat']).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner(['test/fixtures/dats'], ['test/fixtures/**/*.{dat,txt,zip}']).scan()).resolves.toHaveLength(0);
    await expect(createDatScanner(['test/fixtures/dats'], ['test/fixtures/**/*.{dat,txt,zip}', 'test/fixtures/**/*.{dat,txt,zip}']).scan()).resolves.toHaveLength(0);
  });

  it('some files are regex filtered', async () => {
    await expect(createDatScanner(['test/fixtures/dats'], [], '/abcdefg/').scan()).resolves.toHaveLength(0);
    await expect(createDatScanner(['test/fixtures/dats'], [], '/(one|two)/i').scan()).resolves.toHaveLength(2);
    await expect(createDatScanner(['test/fixtures/dats'], [], '[a-z]').scan()).resolves.toHaveLength(totalDatFiles);
  });

  it('some files are regex excluded', async () => {
    await expect(createDatScanner(['test/fixtures/dats'], [], '', '[a-z]').scan()).resolves.toHaveLength(0);
    await expect(createDatScanner(['test/fixtures/dats'], [], '', '/(one|two)/i').scan()).resolves.toHaveLength(totalDatFiles - 2);
    await expect(createDatScanner(['test/fixtures/dats'], [], '', '/abcdefg/').scan()).resolves.toHaveLength(totalDatFiles);
  });
});

it('should scan single files', async () => {
  await expect(createDatScanner([path.join(path.resolve(), 'test', 'fixtures', 'dats', 'one.*')]).scan()).resolves.toHaveLength(1);
  await expect(createDatScanner(['test/fixtures/dats/one.*']).scan()).resolves.toHaveLength(1);
  await expect(createDatScanner(['test/fixtures/*/one.zip']).scan()).resolves.toHaveLength(1);
  await expect(createDatScanner(['test/fixtures/dats/one.zip']).scan()).resolves.toHaveLength(1);
});
