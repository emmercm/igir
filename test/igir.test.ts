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

jest.setTimeout(60_000); // ROMWriter semaphores

async function expectEndToEnd(
  optionsProps: OptionsProps,
  expectedFilesAndCrcs: string[][],
): Promise<void> {
  const tempInput = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR, 'input'));
  await fsPoly.copyDir('./test/fixtures', tempInput);

  const tempOutput = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR, 'output'));

  const options = new Options({
    ...optionsProps,
    ...(optionsProps.dat ? { dat: optionsProps.dat.map((dat) => path.join(tempInput, dat)) } : {}),
    input: (optionsProps.input ? optionsProps.input : [path.join('**', '*')])
      .map((input) => path.join(tempInput, 'roms', input)),
    patch: (optionsProps.patch ? optionsProps.patch : [])
      .map((input) => path.join(tempInput, input)),
    output: tempOutput,
    verbose: Number.MAX_SAFE_INTEGER,
  });
  await new Igir(options, new Logger(LogLevel.NEVER)).main();

  const writtenRomAndCrcs = (await Promise.all((await fsPoly.walk(tempOutput))
    .map(async (filePath) => FileFactory.filesFrom(filePath))))
    .flatMap((files) => files)
    .map((file) => ([
      file.toString()
        .replace(tempInput + path.sep, '')
        .replace(tempOutput + path.sep, ''),
      file.getCrc32(),
    ]))
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
    await expectEndToEnd({
      commands: ['copy'],
      input: [],
      dat: ['dats/*'],
    }, []);
  });

  it('should throw on all invalid dats', async () => {
    await expect(async () => new Igir(new Options({
      dat: ['src/*'],
    }), new Logger(LogLevel.NEVER)).main()).rejects.toThrow(/no valid dat files/i);
  });

  it('should throw on DATs without parent/clone info', async () => {
    await expect(async () => new Igir(new Options({
      dat: ['test/fixtures/dats/*'],
      single: true,
    }), new Logger(LogLevel.NEVER)).main()).rejects.toThrow(/parent\/clone/i);
  });

  it('should copy, test, and clean', async () => {
    await expectEndToEnd({
      commands: ['copy', 'test', 'clean'],
      dat: ['dats/*'],
      dirDatName: true,
    }, [
      [path.join('Headered', 'allpads.nes'), '9180a163'],
      [path.join('Headered', 'color_test.nes'), 'c9c1b7aa'],
      [path.join('Headered', 'diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78'), 'f6cc9b1c'],
      [path.join('Headered', 'fds_joypad_test.fds.zip|fds_joypad_test.fds'), '1e58456d'],
      [path.join('Headered', 'LCDTestROM.lnx.rar|LCDTestROM.lnx'), '2d251538'],
      [path.join('Headered', 'speed_test_v51.smc'), '9adca6cc'],
      [path.join('One', 'Fizzbuzz.rom'), '370517b5'],
      [path.join('One', 'Foobar.rom'), 'b22c9747'],
      [path.join('One', 'Lorem Ipsum.rom'), '70856527'],
      [path.join('One', 'One Three', 'One.rom'), 'f817a89f'],
      [path.join('One', 'One Three', 'Three.rom'), 'ff46c5d8'],
      [path.join('Patchable', '0F09A40.rom'), '2f943e86'],
      [path.join('Patchable', '612644F.rom'), 'f7591b29'],
      [path.join('Patchable', '65D1206.rom'), '20323455'],
      [path.join('Patchable', 'Before.rom'), '0361b321'],
      [path.join('Patchable', 'Best.gz|best.rom'), '1e3d78cf'],
      [path.join('Patchable', 'C01173E.rom'), 'dfaebe28'],
      [path.join('Patchable', 'KDULVQN.rom'), 'b1c303e4'],
    ]);
  });

  it('should copy, extract, test, and clean', async () => {
    await expectEndToEnd({
      commands: ['copy', 'extract', 'test', 'clean'],
      dat: ['dats/*'],
      dirDatName: true,
    }, [
      [path.join('Headered', 'allpads.nes'), '9180a163'],
      [path.join('Headered', 'color_test.nes'), 'c9c1b7aa'],
      [path.join('Headered', 'diagnostic_test_cartridge.a78'), 'f6cc9b1c'],
      [path.join('Headered', 'fds_joypad_test.fds'), '1e58456d'],
      [path.join('Headered', 'LCDTestROM.lnx'), '2d251538'],
      [path.join('Headered', 'speed_test_v51.smc'), '9adca6cc'],
      [path.join('One', 'Fizzbuzz.rom'), '370517b5'],
      [path.join('One', 'Foobar.rom'), 'b22c9747'],
      [path.join('One', 'Lorem Ipsum.rom'), '70856527'],
      [path.join('One', 'One Three', 'One.rom'), 'f817a89f'],
      [path.join('One', 'One Three', 'Three.rom'), 'ff46c5d8'],
      [path.join('Patchable', '0F09A40.rom'), '2f943e86'],
      [path.join('Patchable', '612644F.rom'), 'f7591b29'],
      [path.join('Patchable', '65D1206.rom'), '20323455'],
      [path.join('Patchable', 'Before.rom'), '0361b321'],
      [path.join('Patchable', 'Best.rom'), '1e3d78cf'],
      [path.join('Patchable', 'C01173E.rom'), 'dfaebe28'],
      [path.join('Patchable', 'KDULVQN.rom'), 'b1c303e4'],
    ]);
  });

  it('should copy, zip, test, and clean', async () => {
    await expectEndToEnd({
      commands: ['copy', 'zip', 'test', 'clean'],
      dat: ['dats/*'],
      dirDatName: true,
    }, [
      [path.join('Headered', 'allpads.zip|allpads.nes'), '9180a163'],
      [path.join('Headered', 'color_test.zip|color_test.nes'), 'c9c1b7aa'],
      [path.join('Headered', 'diagnostic_test_cartridge.zip|diagnostic_test_cartridge.a78'), 'f6cc9b1c'],
      [path.join('Headered', 'fds_joypad_test.zip|fds_joypad_test.fds'), '1e58456d'],
      [path.join('Headered', 'LCDTestROM.zip|LCDTestROM.lnx'), '2d251538'],
      [path.join('Headered', 'speed_test_v51.zip|speed_test_v51.smc'), '9adca6cc'],
      [path.join('One', 'Fizzbuzz.zip|Fizzbuzz.rom'), '370517b5'],
      [path.join('One', 'Foobar.zip|Foobar.rom'), 'b22c9747'],
      [path.join('One', 'Lorem Ipsum.zip|Lorem Ipsum.rom'), '70856527'],
      [path.join('One', 'One Three.zip|One.rom'), 'f817a89f'],
      [path.join('One', 'One Three.zip|Three.rom'), 'ff46c5d8'],
      [path.join('Patchable', '0F09A40.zip|0F09A40.rom'), '2f943e86'],
      [path.join('Patchable', '612644F.zip|612644F.rom'), 'f7591b29'],
      [path.join('Patchable', '65D1206.zip|65D1206.rom'), '20323455'],
      [path.join('Patchable', 'Before.zip|Before.rom'), '0361b321'],
      [path.join('Patchable', 'Best.zip|Best.rom'), '1e3d78cf'],
      [path.join('Patchable', 'C01173E.zip|C01173E.rom'), 'dfaebe28'],
      [path.join('Patchable', 'KDULVQN.zip|KDULVQN.rom'), 'b1c303e4'],
    ]);
  });

  it('should symlink, test, and clean', async () => {
    await expectEndToEnd({
      commands: ['symlink', 'test', 'clean'],
      dat: ['dats/*'],
      dirDatName: true,
    }, [
      [`${path.join('Headered', 'allpads.nes')} -> ${path.join('roms', 'headered', 'allpads.nes')}`, '9180a163'],
      [`${path.join('Headered', 'color_test.nes')} -> ${path.join('roms', 'headered', 'color_test.nintendoentertainmentsystem')}`, 'c9c1b7aa'],
      [`${path.join('Headered', 'diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78')} -> ${path.join('roms', 'headered', 'diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78')}`, 'f6cc9b1c'],
      [`${path.join('Headered', 'fds_joypad_test.fds.zip|fds_joypad_test.fds')} -> ${path.join('roms', 'headered', 'fds_joypad_test.fds.zip|fds_joypad_test.fds')}`, '1e58456d'],
      [`${path.join('Headered', 'LCDTestROM.lnx.rar|LCDTestROM.lnx')} -> ${path.join('roms', 'headered', 'LCDTestROM.lnx.rar|LCDTestROM.lnx')}`, '2d251538'],
      [`${path.join('Headered', 'speed_test_v51.smc')} -> ${path.join('roms', 'headered', 'speed_test_v51.smc')}`, '9adca6cc'],
      [`${path.join('One', 'Fizzbuzz.rom')} -> ${path.join('roms', 'raw', 'fizzbuzz.nes')}`, '370517b5'],
      [`${path.join('One', 'Foobar.rom')} -> ${path.join('roms', 'foobar.lnx')}`, 'b22c9747'],
      [`${path.join('One', 'Lorem Ipsum.rom')} -> ${path.join('roms', 'raw', 'loremipsum.rom')}`, '70856527'],
      [`${path.join('One', 'One Three', 'One.rom')} -> ${path.join('roms', 'raw', 'one.rom')}`, 'f817a89f'],
      [`${path.join('One', 'One Three', 'Three.rom')} -> ${path.join('roms', 'raw', 'three.rom')}`, 'ff46c5d8'],
      [`${path.join('Patchable', '0F09A40.rom')} -> ${path.join('roms', 'patchable', '0F09A40.rom')}`, '2f943e86'],
      [`${path.join('Patchable', '612644F.rom')} -> ${path.join('roms', 'patchable', '612644F.rom')}`, 'f7591b29'],
      [`${path.join('Patchable', '65D1206.rom')} -> ${path.join('roms', 'patchable', '65D1206.rom')}`, '20323455'],
      [`${path.join('Patchable', 'Before.rom')} -> ${path.join('roms', 'patchable', 'before.rom')}`, '0361b321'],
      [`${path.join('Patchable', 'Best.gz|best.rom')} -> ${path.join('roms', 'patchable', 'best.gz|best.rom')}`, '1e3d78cf'],
      [`${path.join('Patchable', 'C01173E.rom')} -> ${path.join('roms', 'patchable', 'C01173E.rom')}`, 'dfaebe28'],
      [`${path.join('Patchable', 'KDULVQN.rom')} -> ${path.join('roms', 'patchable', 'KDULVQN.rom')}`, 'b1c303e4'],
    ]);
  });

  it('should copy, extract, patch, remove headers, and test', async () => {
    await expectEndToEnd({
      commands: ['copy', 'extract', 'test'],
      dat: ['dats/*'],
      patch: ['patches/*'],
      dirDatName: true,
      removeHeaders: [''], // all
    }, [
      [path.join('Headered', 'allpads.nes'), '6339abe6'],
      [path.join('Headered', 'color_test.nes'), 'c9c1b7aa'], // no header
      [path.join('Headered', 'diagnostic_test_cartridge.a78'), 'a1eaa7c1'],
      [path.join('Headered', 'fds_joypad_test.fds'), '3ecbac61'],
      [path.join('Headered', 'LCDTestROM.lyx'), '42583855'],
      [path.join('Headered', 'speed_test_v51.sfc'), '8beffd94'],
      [path.join('One', 'Fizzbuzz.rom'), '370517b5'],
      [path.join('One', 'Foobar.rom'), 'b22c9747'],
      [path.join('One', 'Lorem Ipsum.rom'), '70856527'],
      [path.join('One', 'One Three', 'One.rom'), 'f817a89f'],
      [path.join('One', 'One Three', 'Three.rom'), 'ff46c5d8'],
      [path.join('Patchable', '0F09A40.rom'), '2f943e86'],
      [path.join('Patchable', '4FE952A.rom'), '1fb4f81f'],
      [path.join('Patchable', '612644F.rom'), 'f7591b29'],
      [path.join('Patchable', '65D1206.rom'), '20323455'],
      [path.join('Patchable', '949F2B7.rom'), '95284ab4'],
      [path.join('Patchable', '9A71FA5.rom'), '922f5181'],
      [path.join('Patchable', '9E66269.rom'), '8bb5cc63'],
      [path.join('Patchable', 'After.rom'), '4c8e44d4'],
      [path.join('Patchable', 'Before.rom'), '0361b321'],
      [path.join('Patchable', 'Best.rom'), '1e3d78cf'],
      [path.join('Patchable', 'C01173E.rom'), 'dfaebe28'],
      [path.join('Patchable', 'DDSK3AN.rom'), 'e02c6dbb'],
      [path.join('Patchable', 'KDULVQN.rom'), 'b1c303e4'],
      [path.join('Patchable', 'Worst.rom'), '6ff9ef96'],
    ]);
  });

  it('should report without writing', async () => {
    await expectEndToEnd({
      commands: ['report'],
      dat: ['dats/*'],
    }, []);
  });
});

describe('with inferred dats', () => {
  it('should do nothing with no roms', async () => {
    await expectEndToEnd({
      commands: ['copy'],
      input: [],
    }, []);
  });

  it('should copy, test, and clean', async () => {
    await expectEndToEnd({
      commands: ['copy', 'test', 'clean'],
    }, [
      ['0F09A40.rom', '2f943e86'],
      ['612644F.rom', 'f7591b29'],
      ['65D1206.rom', '20323455'],
      ['allpads.nes', '9180a163'],
      ['before.rom', '0361b321'],
      ['best.gz|best.rom', '1e3d78cf'],
      ['C01173E.rom', 'dfaebe28'],
      ['color_test.nintendoentertainmentsystem', 'c9c1b7aa'],
      ['diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78', 'f6cc9b1c'],
      ['empty.rom', '00000000'],
      ['fds_joypad_test.fds.zip|fds_joypad_test.fds', '1e58456d'],
      ['fizzbuzz.nes', '370517b5'],
      ['foobar.lnx', 'b22c9747'],
      ['KDULVQN.rom', 'b1c303e4'],
      ['LCDTestROM.lnx.rar|LCDTestROM.lnx', '2d251538'],
      ['loremipsum.rom', '70856527'],
      ['one.rom', 'f817a89f'],
      [path.join('onetwothree', 'one.rom'), 'f817a89f'],
      [path.join('onetwothree', 'three.rom'), 'ff46c5d8'],
      [path.join('onetwothree', 'two.rom'), '96170874'],
      ['speed_test_v51.sfc.gz|speed_test_v51.sfc', '8beffd94'],
      ['speed_test_v51.smc', '9adca6cc'],
      ['three.rom', 'ff46c5d8'],
      ['two.rom', '96170874'],
      ['unknown.rom', '377a7727'],
    ]);
  });

  it('should copy, extract, test, and clean', async () => {
    await expectEndToEnd({
      commands: ['copy', 'extract', 'test', 'clean'],
    }, [
      ['0F09A40.rom', '2f943e86'],
      ['612644F.rom', 'f7591b29'],
      ['65D1206.rom', '20323455'],
      ['allpads.nes', '9180a163'],
      ['before.rom', '0361b321'],
      ['best.rom', '1e3d78cf'],
      ['C01173E.rom', 'dfaebe28'],
      ['color_test.nintendoentertainmentsystem', 'c9c1b7aa'],
      ['diagnostic_test_cartridge.a78', 'f6cc9b1c'],
      ['empty.rom', '00000000'],
      ['fds_joypad_test.fds', '1e58456d'],
      ['fizzbuzz.nes', '370517b5'],
      ['foobar.lnx', 'b22c9747'],
      ['KDULVQN.rom', 'b1c303e4'],
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

  it('should copy, zip, test, and clean', async () => {
    await expectEndToEnd({
      commands: ['copy', 'zip', 'test', 'clean'],
    }, [
      ['0F09A40.zip|0F09A40.rom', '2f943e86'],
      ['612644F.zip|612644F.rom', 'f7591b29'],
      ['65D1206.zip|65D1206.rom', '20323455'],
      ['allpads.zip|allpads.nes', '9180a163'],
      ['before.zip|before.rom', '0361b321'],
      ['best.zip|best.rom', '1e3d78cf'],
      ['C01173E.zip|C01173E.rom', 'dfaebe28'],
      ['color_test.zip|color_test.nintendoentertainmentsystem', 'c9c1b7aa'],
      ['diagnostic_test_cartridge.zip|diagnostic_test_cartridge.a78', 'f6cc9b1c'],
      ['empty.zip|empty.rom', '00000000'],
      ['fds_joypad_test.zip|fds_joypad_test.fds', '1e58456d'],
      ['fizzbuzz.zip|fizzbuzz.nes', '370517b5'],
      ['foobar.zip|foobar.lnx', 'b22c9747'],
      ['KDULVQN.zip|KDULVQN.rom', 'b1c303e4'],
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

  it('should symlink, test, and clean', async () => {
    await expectEndToEnd({
      commands: ['symlink', 'test', 'clean'],
    }, [
      [`0F09A40.rom -> ${path.join('roms', 'patchable', '0F09A40.rom')}`, '2f943e86'],
      [`612644F.rom -> ${path.join('roms', 'patchable', '612644F.rom')}`, 'f7591b29'],
      [`65D1206.rom -> ${path.join('roms', 'patchable', '65D1206.rom')}`, '20323455'],
      [`allpads.nes -> ${path.join('roms', 'headered', 'allpads.nes')}`, '9180a163'],
      [`before.rom -> ${path.join('roms', 'patchable', 'before.rom')}`, '0361b321'],
      [`best.gz|best.rom -> ${path.join('roms', 'patchable', 'best.gz|best.rom')}`, '1e3d78cf'],
      [`C01173E.rom -> ${path.join('roms', 'patchable', 'C01173E.rom')}`, 'dfaebe28'],
      [`color_test.nintendoentertainmentsystem -> ${path.join('roms', 'headered', 'color_test.nintendoentertainmentsystem')}`, 'c9c1b7aa'],
      [`diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78 -> ${path.join('roms', 'headered', 'diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78')}`, 'f6cc9b1c'],
      [`empty.rom -> ${path.join('roms', 'empty.rom')}`, '00000000'],
      [`fds_joypad_test.fds.zip|fds_joypad_test.fds -> ${path.join('roms', 'headered', 'fds_joypad_test.fds.zip|fds_joypad_test.fds')}`, '1e58456d'],
      [`fizzbuzz.nes -> ${path.join('roms', 'raw', 'fizzbuzz.nes')}`, '370517b5'],
      [`foobar.lnx -> ${path.join('roms', 'foobar.lnx')}`, 'b22c9747'],
      [`KDULVQN.rom -> ${path.join('roms', 'patchable', 'KDULVQN.rom')}`, 'b1c303e4'],
      [`LCDTestROM.lnx.rar|LCDTestROM.lnx -> ${path.join('roms', 'headered', 'LCDTestROM.lnx.rar|LCDTestROM.lnx')}`, '2d251538'],
      [`loremipsum.rom -> ${path.join('roms', 'raw', 'loremipsum.rom')}`, '70856527'],
      [`one.rom -> ${path.join('roms', 'raw', 'one.rom')}`, 'f817a89f'],
      [`onetwothree/one.rom -> ${path.join('roms', 'raw', 'one.rom')}`, 'f817a89f'],
      [`onetwothree/three.rom -> ${path.join('roms', 'raw', 'three.rom')}`, 'ff46c5d8'],
      [`onetwothree/two.rom -> ${path.join('roms', 'raw', 'two.rom')}`, '96170874'],
      [`speed_test_v51.sfc.gz|speed_test_v51.sfc -> ${path.join('roms', 'unheadered', 'speed_test_v51.sfc.gz|speed_test_v51.sfc')}`, '8beffd94'],
      [`speed_test_v51.smc -> ${path.join('roms', 'headered', 'speed_test_v51.smc')}`, '9adca6cc'],
      [`three.rom -> ${path.join('roms', 'raw', 'three.rom')}`, 'ff46c5d8'],
      [`two.rom -> ${path.join('roms', 'raw', 'two.rom')}`, '96170874'],
      [`unknown.rom -> ${path.join('roms', 'raw', 'unknown.rom')}`, '377a7727'],
    ]);
  });

  it('should copy, extract, remove headers, and test', async () => {
    await expectEndToEnd({
      commands: ['copy', 'extract', 'test'],
      input: ['headered/*'],
      removeHeaders: [''], // all
    }, [
      ['allpads.nes', '6339abe6'],
      ['color_test.nintendoentertainmentsystem', 'c9c1b7aa'], // no header
      ['diagnostic_test_cartridge.a78', 'a1eaa7c1'],
      ['fds_joypad_test.fds', '3ecbac61'],
      ['LCDTestROM.lyx', '42583855'],
      ['speed_test_v51.sfc', '8beffd94'],
    ]);
  });
});
