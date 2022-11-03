import { jest } from '@jest/globals';
import fg from 'fast-glob';
import path from 'path';

import Logger from '../src/console/logger.js';
import LogLevel from '../src/console/logLevel.js';
import Constants from '../src/constants.js';
import Igir from '../src/igir.js';
import fsPoly from '../src/polyfill/fsPoly.js';
import Options, { OptionsProps } from '../src/types/options.js';

jest.setTimeout(10_000);

const LOGGER = new Logger(LogLevel.NEVER);

async function expectEndToEnd(
  datGlob: string | undefined,
  optionsProps: OptionsProps,
  expectedFiles: string[],
): Promise<void> {
  const tempInput = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);
  fsPoly.copyDirSync('./test/fixtures', tempInput);

  const tempOutput = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);

  const options = new Options({
    ...(datGlob ? { dat: [path.join(tempInput, datGlob)] } : {}),
    input: [path.join(tempInput, 'roms', '**', '*')],
    ...optionsProps,
    output: tempOutput,
    verbose: Number.MAX_SAFE_INTEGER,
  });
  await new Igir(options, LOGGER).main();

  const writtenRoms = fsPoly.walkSync(tempOutput)
    .map((filePath) => filePath.replace(tempOutput + path.sep, ''));

  expect(writtenRoms).toHaveLength(expectedFiles.length);
  for (let i = 0; i < expectedFiles.length; i += 1) {
    const expectedFile = expectedFiles[i];
    expect(writtenRoms).toContain(expectedFile);
  }

  await fsPoly.rm(tempInput, { recursive: true });
  await fsPoly.rm(tempOutput, { force: true, recursive: true });

  const reports = await fg(path.join(
    path.dirname(options.getOutputReportPath()),
    `${Constants.COMMAND_NAME}_*.csv`,
  ).replace(/\\/g, '/'));
  await Promise.all(reports.map(async (report) => fsPoly.rm(report)));
}

describe('with explicit dats', () => {
  it('should do nothing with no roms', async () => {
    await expectEndToEnd('dats/*', {
      commands: ['copy'],
      input: [],
    }, []);
  });

  it('should copy', async () => {
    await expectEndToEnd('dats/*', {
      commands: ['copy'],
      dirDatName: true,
    }, [
      path.join('One', 'Fizzbuzz.rom'),
      path.join('One', 'Foobar.rom'),
      path.join('One', 'Lorem Ipsum.rom'),
      path.join('One', 'One Three', 'One.rom'),
      path.join('One', 'One Three', 'Three.rom'),
      path.join('Patchable', 'Before.rom'),
    ]);
  });

  it('should copy and zip and test', async () => {
    await expectEndToEnd('dats/*', {
      commands: ['copy', 'zip'],
      dirDatName: true,
    }, [
      path.join('One', 'Fizzbuzz.zip'),
      path.join('One', 'Foobar.zip'),
      path.join('One', 'Lorem Ipsum.zip'),
      path.join('One', 'One Three.zip'),
      path.join('Patchable', 'Before.zip'),
    ]);
  });

  it('should copy and clean', async () => {
    await expectEndToEnd('dats/*', {
      commands: ['copy', 'clean'],
      dirDatName: true,
    }, [
      path.join('One', 'Fizzbuzz.rom'),
      path.join('One', 'Foobar.rom'),
      path.join('One', 'Lorem Ipsum.rom'),
      path.join('One', 'One Three', 'One.rom'),
      path.join('One', 'One Three', 'Three.rom'),
      path.join('Patchable', 'Before.rom'),
    ]);
  });

  it('should report without copy', async () => {
    await expectEndToEnd('dats/*', {
      commands: ['report'],
    }, []);
  });
});

describe('with inferred dats', () => {
  it('should do nothing with no roms', async () => {
    await expectEndToEnd(undefined, {
      commands: ['copy'],
      input: [],
    }, []);
  });

  it('should copy', async () => {
    await expectEndToEnd(undefined, {
      commands: ['copy'],
    }, [
      'C01173E.rom',
      'LCDTestROM.lnx',
      'allpads.nes',
      'before.rom',
      'best.rom',
      'color_test.nintendoentertainmentsystem',
      'diagnostic_test_cartridge.a78',
      'empty.rom',
      'fds_joypad_test.fds',
      'fizzbuzz.nes',
      'foobar.lnx',
      'loremipsum.rom',
      'one.rom',
      path.join('onetwothree', 'one.rom'),
      path.join('onetwothree', 'three.rom'),
      path.join('onetwothree', 'two.rom'),
      'speed_test_v51.sfc',
      'speed_test_v51.smc',
      'three.rom',
      'two.rom',
      'unknown.rom',
    ]);
  });

  it('should copy and zip and test', async () => {
    await expectEndToEnd(undefined, {
      commands: ['copy', 'zip'],
    }, [
      'C01173E.zip',
      'LCDTestROM.zip',
      'allpads.zip',
      'before.zip',
      'best.zip',
      'color_test.zip',
      'diagnostic_test_cartridge.zip',
      'empty.zip',
      'fds_joypad_test.zip',
      'fizzbuzz.zip',
      'foobar.zip',
      'loremipsum.zip',
      'one.zip',
      'onetwothree.zip',
      'speed_test_v51.zip',
      'three.zip',
      'two.zip',
      'unknown.zip',
    ]);
  });
});
