import { jest } from '@jest/globals';
import fg from 'fast-glob';
import fs from 'fs';
import path from 'path';

import Logger from '../src/console/logger.js';
import LogLevel from '../src/console/logLevel.js';
import Constants from '../src/constants.js';
import Igir from '../src/igir.js';
import fsPoly from '../src/polyfill/fsPoly.js';
import Options, { OptionsProps } from '../src/types/options.js';

jest.setTimeout(10_000);

const LOGGER = new Logger(LogLevel.NEVER);

async function expectEndToEnd(optionsProps: OptionsProps, expectedFiles: string[]): Promise<void> {
  const tempInput = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);
  fsPoly.copyDirSync('./test/fixtures', tempInput);

  const tempOutput = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);

  const options = new Options({
    dat: [path.join(tempInput, 'dats', '*')],
    input: [path.join(tempInput, 'roms', '**', '*')],
    ...optionsProps,
    output: tempOutput,
    verbose: Number.MAX_SAFE_INTEGER,
  });
  await new Igir(options, LOGGER).main();

  const writtenRoms = fs.readdirSync(tempOutput);

  expect(writtenRoms).toHaveLength(expectedFiles.length);
  for (let i = 0; i < expectedFiles.length; i += 1) {
    const expectedFile = expectedFiles[i];
    expect(writtenRoms).toContain(expectedFile);
  }

  fsPoly.rmSync(tempInput, { recursive: true });
  fsPoly.rmSync(tempOutput, { force: true, recursive: true });

  const reports = await fg(path.join(
    path.dirname(options.getOutputReport()),
    `${Constants.COMMAND_NAME}_*.csv`,
  ));
  reports.forEach((report) => fsPoly.rmSync(report));
}

it('should throw on no dats', async () => {
  await expect(new Igir(new Options({}), LOGGER).main()).rejects.toThrow(/no valid dat/i);
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
    'One.rom',
    'Three.rom',
  ]);
});

it('should copy and zip and test', async () => {
  await expectEndToEnd({
    commands: ['copy', 'zip'],
  }, [
    'Fizzbuzz.zip',
    'Foobar.zip',
    'Lorem Ipsum.zip',
    'One Three.zip',
  ]);
});

it('should copy and clean', async () => {
  await expectEndToEnd({
    commands: ['copy', 'clean'],
  }, [
    'Fizzbuzz.rom',
    'Foobar.rom',
    'Lorem Ipsum.rom',
    'One.rom',
    'Three.rom',
  ]);
});

it('should report without copy', async () => {
  await expectEndToEnd({
    commands: ['report'],
  }, []);
});
