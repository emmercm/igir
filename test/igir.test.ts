import { jest } from '@jest/globals';
import fg from 'fast-glob';
import path from 'path';

import Logger from '../src/console/logger.js';
import LogLevel from '../src/console/logLevel.js';
import Constants from '../src/constants.js';
import Igir from '../src/igir.js';
import fsPoly from '../src/polyfill/fsPoly.js';
import FileFactory from '../src/types/archives/fileFactory.js';
import Options, { OptionsProps } from '../src/types/options.js';

jest.setTimeout(10_000);

async function expectEndToEnd(
  datGlob: string | undefined,
  inputGlob: string | undefined,
  optionsProps: OptionsProps,
  expectedFilesAndCrcs: string[][],
): Promise<void> {
  const tempInput = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);
  fsPoly.copyDirSync('./test/fixtures', tempInput);

  const tempOutput = fsPoly.mkdtempSync(Constants.GLOBAL_TEMP_DIR);

  const options = new Options({
    ...(datGlob ? { dat: [path.join(tempInput, datGlob)] } : {}),
    input: [inputGlob ? path.join(tempInput, 'roms', inputGlob) : path.join(tempInput, 'roms', '**', '*')],
    ...optionsProps,
    output: tempOutput,
    verbose: Number.MAX_SAFE_INTEGER,
  });
  await new Igir(options, new Logger(LogLevel.NEVER)).main();

  const writtenRomAndCrcs = (await Promise.all(fsPoly.walkSync(tempOutput)
    .map(async (filePath) => FileFactory.filesFrom(filePath))))
    .flatMap((files) => files)
    .map((file) => ([file.toString().replace(tempOutput + path.sep, ''), file.getCrc32()]))
    .sort((a, b) => a[0].localeCompare(b[0]));
  expect(writtenRomAndCrcs).toEqual(expectedFilesAndCrcs);

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
    await expectEndToEnd('dats/*', undefined, {
      commands: ['copy'],
      input: [],
    }, []);
  });

  it('should copy and test', async () => {
    await expectEndToEnd('dats/*', undefined, {
      commands: ['copy', 'test'],
      dirDatName: true,
    }, [
      [path.join('One', 'Fizzbuzz.rom'), '370517b5'],
      [path.join('One', 'Foobar.rom'), 'b22c9747'],
      [path.join('One', 'Lorem Ipsum.rom'), '70856527'],
      [path.join('One', 'One Three', 'One.rom'), 'f817a89f'],
      [path.join('One', 'One Three', 'Three.rom'), 'ff46c5d8'],
      [path.join('Patchable', 'Before.rom'), '0361b321'],
      [path.join('Patchable', 'Best.rom'), '1e3d78cf'],
    ]);
  });

  it('should copy, zip, and test', async () => {
    await expectEndToEnd('dats/*', undefined, {
      commands: ['copy', 'zip', 'test'],
      dirDatName: true,
    }, [
      [`${path.join('One', 'Fizzbuzz.zip')}|Fizzbuzz.rom`, '370517b5'],
      [`${path.join('One', 'Foobar.zip')}|Foobar.rom`, 'b22c9747'],
      [`${path.join('One', 'Lorem Ipsum.zip')}|Lorem Ipsum.rom`, '70856527'],
      [`${path.join('One', 'One Three.zip')}|One.rom`, 'f817a89f'],
      [`${path.join('One', 'One Three.zip')}|Three.rom`, 'ff46c5d8'],
      [`${path.join('Patchable', 'Before.zip')}|Before.rom`, '0361b321'],
      [`${path.join('Patchable', 'Best.zip')}|Best.rom`, '1e3d78cf'],
    ]);
  });

  it('should copy and clean', async () => {
    await expectEndToEnd('dats/*', undefined, {
      commands: ['copy', 'clean'],
      dirDatName: true,
    }, [
      [path.join('One', 'Fizzbuzz.rom'), '370517b5'],
      [path.join('One', 'Foobar.rom'), 'b22c9747'],
      [path.join('One', 'Lorem Ipsum.rom'), '70856527'],
      [path.join('One', 'One Three', 'One.rom'), 'f817a89f'],
      [path.join('One', 'One Three', 'Three.rom'), 'ff46c5d8'],
      [path.join('Patchable', 'Before.rom'), '0361b321'],
      [path.join('Patchable', 'Best.rom'), '1e3d78cf'],
    ]);
  });

  it('should report without writing', async () => {
    await expectEndToEnd('dats/*', undefined, {
      commands: ['report'],
    }, []);
  });
});

describe('with inferred dats', () => {
  it('should do nothing with no roms', async () => {
    await expectEndToEnd(undefined, undefined, {
      commands: ['copy'],
      input: [],
    }, []);
  });

  it('should copy and test', async () => {
    await expectEndToEnd(undefined, undefined, {
      commands: ['copy', 'test'],
    }, [
      ['allpads.nes', '9180a163'],
      ['before.rom', '0361b321'],
      ['best.rom', '1e3d78cf'],
      ['color_test.nintendoentertainmentsystem', 'c9c1b7aa'],
      ['diagnostic_test_cartridge.a78', 'f6cc9b1c'],
      ['empty.rom', '00000000'],
      ['fds_joypad_test.fds', '1e58456d'],
      ['fizzbuzz.nes', '370517b5'],
      ['foobar.lnx', 'b22c9747'],
      ['LCDTestROM.lnx', '2d251538'],
      ['loremipsum.rom', '70856527'],
      ['one.rom', 'f817a89f'],
      [path.join('onetwothree', 'one.rom'), 'f817a89f'],
      [path.join('onetwothree', 'three.rom'), 'ff46c5d8'],
      [path.join('onetwothree', 'two.rom'), '96170874'],
      ['speed_test_v51.sfc', '8beffd94'],
      ['speed_test_v51.smc', '9adca6cc'],
      ['three.rom', 'ff46c5d8'],
      ['two.rom', '96170874'],
      ['unknown.rom', '377a7727'],
    ]);
  });

  it('should copy, zip, and test', async () => {
    await expectEndToEnd(undefined, undefined, {
      commands: ['copy', 'zip', 'test'],
    }, [
      ['allpads.zip|allpads.nes', '9180a163'],
      ['before.zip|before.rom', '0361b321'],
      ['best.zip|best.rom', '1e3d78cf'],
      ['color_test.zip|color_test.nintendoentertainmentsystem', 'c9c1b7aa'],
      ['diagnostic_test_cartridge.zip|diagnostic_test_cartridge.a78', 'f6cc9b1c'],
      ['empty.zip|empty.rom', '00000000'],
      ['fds_joypad_test.zip|fds_joypad_test.fds', '1e58456d'],
      ['fizzbuzz.zip|fizzbuzz.nes', '370517b5'],
      ['foobar.zip|foobar.lnx', 'b22c9747'],
      ['LCDTestROM.zip|LCDTestROM.lnx', '2d251538'],
      ['loremipsum.zip|loremipsum.rom', '70856527'],
      ['one.zip|one.rom', 'f817a89f'],
      ['onetwothree.zip|one.rom', 'f817a89f'],
      ['onetwothree.zip|three.rom', 'ff46c5d8'],
      ['onetwothree.zip|two.rom', '96170874'],
      ['speed_test_v51.zip|speed_test_v51.smc', '9adca6cc'],
      ['three.zip|three.rom', 'ff46c5d8'],
      ['two.zip|two.rom', '96170874'],
      ['unknown.zip|unknown.rom', '377a7727'],
    ]);
  });

  it('should remove headers', async () => {
    await expectEndToEnd(undefined, 'headered/*', {
      commands: ['copy'],
      removeHeaders: [''], // all
    }, [
      ['allpads.nes', '6339abe6'],
      ['color_test.nintendoentertainmentsystem', 'c9c1b7aa'], // not removed
      ['diagnostic_test_cartridge.a78', 'a1eaa7c1'],
      ['fds_joypad_test.fds', '3ecbac61'],
      ['LCDTestROM.lyx', '42583855'],
      ['speed_test_v51.sfc', '8beffd94'],
    ]);
  });
});
