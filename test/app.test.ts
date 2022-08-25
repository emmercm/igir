import fs from 'fs';
import path from 'path';

import main from '../src/app.js';
import Logger, { LogLevel } from '../src/console/logger.js';
import fsPoly from '../src/polyfill/fsPoly.js';
import Options, { OptionsProps } from '../src/types/options.js';

const LOGGER = new Logger(LogLevel.OFF);

async function expectEndToEnd(options: OptionsProps, expectedFiles: string[]) {
  const tempInput = fsPoly.mkdtempSync();
  fsPoly.copyDirSync('./test/fixtures', tempInput);

  const tempOutput = fsPoly.mkdtempSync();

  await main(new Options({
    dat: [path.join(tempInput, 'dats', '*.dat')],
    input: [path.join(tempInput, 'roms', '**', '*')],
    ...options,
    output: tempOutput,
    verbose: Number.MAX_SAFE_INTEGER,
  }), LOGGER);

  const writtenRoms = fs.readdirSync(tempOutput);

  expect(writtenRoms).toHaveLength(expectedFiles.length);
  for (let i = 0; i < expectedFiles.length; i += 1) {
    const expectedFile = expectedFiles[i];
    expect(writtenRoms).toContain(expectedFile);
  }

  fsPoly.rmSync(tempInput, { recursive: true });
  fsPoly.rmSync(tempOutput, { recursive: true });
}

it('should throw on no dats', async () => {
  await expect(main(new Options({}), LOGGER)).rejects.toThrow(/no valid dat/i);
});

it('should do nothing with no roms', async () => {
  await expectEndToEnd({
    commands: ['copy'],
    input: [],
  }, []);
});

it('should copy', async () => {
  await expectEndToEnd({
    commands: ['copy'],
  }, [
    'Fizzbuzz.rom',
    'Foobar.rom',
    'Lorem Ipsum.rom',
  ]);
});

it('should copy and zip and test', async () => {
  await expectEndToEnd({
    commands: ['copy', 'zip'],
  }, [
    'Fizzbuzz.zip',
    'Foobar.zip',
    'Lorem Ipsum.zip',
  ]);
});

it('should copy and clean and report', async () => {
  await expectEndToEnd({
    commands: ['copy', 'clean', 'report'],
  }, [
    'Fizzbuzz.rom',
    'Foobar.rom',
    'Lorem Ipsum.rom',
  ]);
});

it('should report without copy', async () => {
  await expectEndToEnd({
    commands: ['report'],
  }, []);
});
