import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import Logger from '../src/console/logger.js';
import LogLevel from '../src/console/logLevel.js';
import Igir from '../src/igir.js';
import fsPoly from '../src/polyfill/fsPoly.js';
import Options, { OptionsProps } from '../src/types/options.js';

const LOGGER = new Logger(LogLevel.NEVER);

async function expectEndToEnd(options: OptionsProps, expectedFiles: string[]): Promise<void> {
  const tempInput = fsPoly.mkdtempSync();
  fsPoly.copyDirSync('./test/fixtures', tempInput);

  const tempOutput = fsPoly.mkdtempSync();

  await new Igir(new Options({
    dat: [path.join(tempInput, 'dats', '*.dat')],
    input: [path.join(tempInput, 'roms', '**', '*')],
    ...options,
    output: tempOutput,
    verbose: Number.MAX_SAFE_INTEGER,
  }), LOGGER).main();

  const writtenRoms = fs.readdirSync(tempOutput);

  expect(writtenRoms).toHaveLength(expectedFiles.length);
  for (let i = 0; i < expectedFiles.length; i += 1) {
    const expectedFile = expectedFiles[i];
    expect(writtenRoms).toContain(expectedFile);
  }

  fsPoly.rmSync(tempInput, { recursive: true });
  fsPoly.rmSync(tempOutput, { recursive: true });
}

jest.setTimeout(10_000);

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

it('should copy and clean', async () => {
  await expectEndToEnd({
    commands: ['copy', 'clean'],
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
