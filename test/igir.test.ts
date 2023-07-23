import path from 'path';

import Logger from '../src/console/logger.js';
import LogLevel from '../src/console/logLevel.js';
import Constants from '../src/constants.js';
import Igir from '../src/igir.js';
import fsPoly from '../src/polyfill/fsPoly.js';
import FileFactory from '../src/types/files/fileFactory.js';
import Options, { OptionsProps } from '../src/types/options.js';

interface TestOutput {
  outputFilesAndCrcs: string[][],
  cwdFilesAndCrcs: string[][],
  deletedFiles: string[],
}

async function chdir<T>(dir: string, runnable: () => (T | Promise<T>)): Promise<T> {
  const cwd = process.cwd();

  if (!await fsPoly.exists(dir)) {
    await fsPoly.mkdir(dir, { recursive: true });
  }
  process.chdir(dir);

  try {
    return await runnable();
  } finally {
    process.chdir(cwd);
  }
}

async function walkWithCrc(inputDir: string, outputDir: string): Promise<string[][]> {
  return (
    await Promise.all((await fsPoly.walk(outputDir))
      .map(async (filePath) => FileFactory.filesFrom(filePath)))
  )
    .flatMap((files) => files)
    .map((file) => ([
      file.toString()
        .replace(inputDir, '<input>')
        .replace(outputDir + path.sep, ''),
      file.getCrc32(),
    ]))
    .sort((a, b) => a[0].localeCompare(b[0]));
}

async function runIgir(optionsProps: OptionsProps): Promise<TestOutput> {
  const fixtures = path.resolve('./test/fixtures');
  const temp = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR));

  const tempCwd = path.join(temp, 'cwd');
  const result = await chdir(tempCwd, async () => {
    const tempInput = path.join(temp, 'input');
    await fsPoly.copyDir(fixtures, tempInput);
    const inputFilesBefore = await fsPoly.walk(tempInput);

    const tempOutput = path.join(temp, 'output');

    const options = new Options({
      ...optionsProps,
      ...(optionsProps.dat
        ? { dat: optionsProps.dat.map((dat) => path.join(tempInput, dat)) }
        : {}),
      input: (optionsProps.input || [path.join('**', '*')])
        .map((input) => path.join(tempInput, 'roms', input)),
      patch: (optionsProps.patch || [])
        .map((input) => path.join(tempInput, input)),
      reportOutput: (optionsProps.reportOutput || './report.csv'),
      output: tempOutput,
      verbose: Number.MAX_SAFE_INTEGER,
    });
    await new Igir(options, new Logger(LogLevel.NEVER)).main();

    const outputFilesAndCrcs = await walkWithCrc(tempInput, tempOutput);
    const cwdFilesAndCrcs = await walkWithCrc(tempInput, process.cwd());

    const inputFilesAfter = await fsPoly.walk(tempInput);
    const deletedFiles = inputFilesBefore
      .filter((filePath) => inputFilesAfter.indexOf(filePath) === -1)
      .map((filePath) => filePath.replace(tempInput + path.sep, ''))
      .sort();

    return { outputFilesAndCrcs, cwdFilesAndCrcs, deletedFiles };
  });

  await fsPoly.rm(temp, { force: true, recursive: true });

  return result;
}

async function expectEndToEnd(
  optionsProps: OptionsProps,
  expectedWrittenFilesAndCrcs: string[][],
  expectedDeletedFiles: string[] = [],
): Promise<void> {
  const testOutput = await runIgir(optionsProps);
  expect(testOutput.outputFilesAndCrcs).toEqual(expectedWrittenFilesAndCrcs);
  expect(testOutput.deletedFiles).toEqual(expectedDeletedFiles);
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
      [path.join('One', 'Fizzbuzz.nes'), '370517b5'],
      [path.join('One', 'Foobar.lnx'), 'b22c9747'],
      [path.join('One', 'Lorem Ipsum.rom'), '70856527'],
      [`${path.join('One', 'One Three.zip')}|${path.join('1', 'one.rom')}`, 'f817a89f'],
      [`${path.join('One', 'One Three.zip')}|${path.join('2', 'two.rom')}`, '96170874'],
      [`${path.join('One', 'One Three.zip')}|${path.join('3', 'three.rom')}`, 'ff46c5d8'],
      [path.join('One', 'Three Four Five', 'Five.rom'), '3e5daf67'],
      [path.join('One', 'Three Four Five', 'Four.rom'), '1cf3ca74'],
      [path.join('One', 'Three Four Five', 'Three.rom'), 'ff46c5d8'],
      [path.join('Patchable', '0F09A40.rom'), '2f943e86'],
      [path.join('Patchable', '3708F2C.rom'), '20891c9f'],
      [path.join('Patchable', '612644F.rom'), 'f7591b29'],
      [path.join('Patchable', '65D1206.rom'), '20323455'],
      [path.join('Patchable', '92C85C9.rom'), '06692159'],
      [path.join('Patchable', 'Before.rom'), '0361b321'],
      [path.join('Patchable', 'Best.gz|best.rom'), '1e3d78cf'],
      [path.join('Patchable', 'C01173E.rom'), 'dfaebe28'],
      [path.join('Patchable', 'KDULVQN.rom'), 'b1c303e4'],
      [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.nes'), '370517b5'],
      [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.lnx'), 'b22c9747'],
      [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.rom'), '70856527'],
      [path.join('smdb', 'Hardware Target Game Database', 'Patchable', '3708F2C.rom'), '20891c9f'],
      [path.join('smdb', 'Hardware Target Game Database', 'Patchable', '65D1206.rom'), '20323455'],
      [path.join('smdb', 'Hardware Target Game Database', 'Patchable', 'C01173E.rom'), 'dfaebe28'],
    ]);
  });

  it('should move, extract, test, and clean', async () => {
    await expectEndToEnd({
      commands: ['move', 'extract', 'test', 'clean'],
      dat: ['dats/*'],
      dirDatName: true,
    }, [
      [path.join('Headered', 'allpads.nes'), '9180a163'],
      [path.join('Headered', 'color_test.nes'), 'c9c1b7aa'],
      [path.join('Headered', 'diagnostic_test_cartridge.a78'), 'f6cc9b1c'],
      [path.join('Headered', 'fds_joypad_test.fds'), '1e58456d'],
      [path.join('Headered', 'LCDTestROM.lnx'), '2d251538'],
      [path.join('Headered', 'speed_test_v51.smc'), '9adca6cc'],
      [path.join('One', 'Fizzbuzz.nes'), '370517b5'],
      [path.join('One', 'Foobar.lnx'), 'b22c9747'],
      [path.join('One', 'Lorem Ipsum.rom'), '70856527'],
      [path.join('One', 'One Three', 'One.rom'), 'f817a89f'],
      [path.join('One', 'One Three', 'Three.rom'), 'ff46c5d8'],
      [path.join('One', 'Three Four Five', 'Five.rom'), '3e5daf67'],
      [path.join('One', 'Three Four Five', 'Four.rom'), '1cf3ca74'],
      [path.join('One', 'Three Four Five', 'Three.rom'), 'ff46c5d8'],
      [path.join('Patchable', '0F09A40.rom'), '2f943e86'],
      [path.join('Patchable', '3708F2C.rom'), '20891c9f'],
      [path.join('Patchable', '612644F.rom'), 'f7591b29'],
      [path.join('Patchable', '65D1206.rom'), '20323455'],
      [path.join('Patchable', '92C85C9.rom'), '06692159'],
      [path.join('Patchable', 'Before.rom'), '0361b321'],
      [path.join('Patchable', 'Best.rom'), '1e3d78cf'],
      [path.join('Patchable', 'C01173E.rom'), 'dfaebe28'],
      [path.join('Patchable', 'KDULVQN.rom'), 'b1c303e4'],
      [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.nes'), '370517b5'],
      [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.lnx'), 'b22c9747'],
      [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.rom'), '70856527'],
      [path.join('smdb', 'Hardware Target Game Database', 'Patchable', '3708F2C.rom'), '20891c9f'],
      [path.join('smdb', 'Hardware Target Game Database', 'Patchable', '65D1206.rom'), '20323455'],
      [path.join('smdb', 'Hardware Target Game Database', 'Patchable', 'C01173E.rom'), 'dfaebe28'],
    ], [
      path.join('roms', 'foobar.lnx'),
      path.join('roms', 'headered', 'LCDTestROM.lnx.rar'),
      path.join('roms', 'headered', 'allpads.nes'),
      path.join('roms', 'headered', 'color_test.nintendoentertainmentsystem'),
      path.join('roms', 'headered', 'diagnostic_test_cartridge.a78.7z'),
      path.join('roms', 'headered', 'fds_joypad_test.fds.zip'),
      path.join('roms', 'headered', 'speed_test_v51.smc'),
      path.join('roms', 'patchable', '0F09A40.rom'),
      path.join('roms', 'patchable', '3708F2C.rom'),
      path.join('roms', 'patchable', '612644F.rom'),
      path.join('roms', 'patchable', '65D1206.rom'),
      path.join('roms', 'patchable', '92C85C9.rom'),
      path.join('roms', 'patchable', 'C01173E.rom'),
      path.join('roms', 'patchable', 'KDULVQN.rom'),
      path.join('roms', 'patchable', 'before.rom'),
      path.join('roms', 'patchable', 'best.gz'),
      path.join('roms', 'raw', 'five.rom'),
      path.join('roms', 'raw', 'fizzbuzz.nes'),
      path.join('roms', 'raw', 'four.rom'),
      path.join('roms', 'raw', 'loremipsum.rom'),
      path.join('roms', 'raw', 'one.rom'),
      path.join('roms', 'raw', 'three.rom'),
    ]);
  });

  it('should move zipped files', async () => {
    await expectEndToEnd({
      commands: ['move'],
      dat: ['dats/*'],
      input: ['zip/*'],
      dirDatName: true,
    }, [
      [path.join('One', 'Fizzbuzz.zip|fizzbuzz.nes'), '370517b5'],
      [path.join('One', 'Foobar.zip|foobar.lnx'), 'b22c9747'],
      // NOTE(cemmer): 'One Three.zip' explicitly contains 'two.rom' because the entire file was
      //  moved, including any extra entries in the input archive.
      [path.join('One', 'Lorem Ipsum.zip|loremipsum.rom'), '70856527'],
      [path.join('One', 'One Three.zip|1/one.rom'), 'f817a89f'],
      [path.join('One', 'One Three.zip|2/two.rom'), '96170874'],
      [path.join('One', 'One Three.zip|3/three.rom'), 'ff46c5d8'],
      // NOTE(cemmer): 'Three Four Five.zip' is explicitly missing, because not all ROMs can be
      //  found in one archive.
      [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.zip|fizzbuzz.nes'), '370517b5'],
      [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.zip|foobar.lnx'), 'b22c9747'],
      [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.zip|loremipsum.rom'), '70856527'],
    ], [
      path.join('roms', 'zip', 'fizzbuzz.zip'),
      path.join('roms', 'zip', 'foobar.zip'),
      // NOTE(cemmer): 'fourfive.zip' is explicitly not deleted
      path.join('roms', 'zip', 'loremipsum.zip'),
      path.join('roms', 'zip', 'onetwothree.zip'), // explicitly deleted!
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
      [path.join('One', 'Fizzbuzz.zip|Fizzbuzz.nes'), '370517b5'],
      [path.join('One', 'Foobar.zip|Foobar.lnx'), 'b22c9747'],
      [path.join('One', 'Lorem Ipsum.zip|Lorem Ipsum.rom'), '70856527'],
      [path.join('One', 'One Three.zip|One.rom'), 'f817a89f'],
      [path.join('One', 'One Three.zip|Three.rom'), 'ff46c5d8'],
      [path.join('One', 'Three Four Five.zip|Five.rom'), '3e5daf67'],
      [path.join('One', 'Three Four Five.zip|Four.rom'), '1cf3ca74'],
      [path.join('One', 'Three Four Five.zip|Three.rom'), 'ff46c5d8'],
      [path.join('Patchable', '0F09A40.zip|0F09A40.rom'), '2f943e86'],
      [path.join('Patchable', '3708F2C.zip|3708F2C.rom'), '20891c9f'],
      [path.join('Patchable', '612644F.zip|612644F.rom'), 'f7591b29'],
      [path.join('Patchable', '65D1206.zip|65D1206.rom'), '20323455'],
      [path.join('Patchable', '92C85C9.zip|92C85C9.rom'), '06692159'],
      [path.join('Patchable', 'Before.zip|Before.rom'), '0361b321'],
      [path.join('Patchable', 'Best.zip|Best.rom'), '1e3d78cf'],
      [path.join('Patchable', 'C01173E.zip|C01173E.rom'), 'dfaebe28'],
      [path.join('Patchable', 'KDULVQN.zip|KDULVQN.rom'), 'b1c303e4'],
      [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.zip')}|Fizzbuzz.nes`, '370517b5'],
      [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.zip')}|Foobar.lnx`, 'b22c9747'],
      [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.zip')}|Lorem Ipsum.rom`, '70856527'],
      [`${path.join('smdb', 'Hardware Target Game Database', 'Patchable', '3708F2C.zip')}|3708F2C.rom`, '20891c9f'],
      [`${path.join('smdb', 'Hardware Target Game Database', 'Patchable', '65D1206.zip')}|65D1206.rom`, '20323455'],
      [`${path.join('smdb', 'Hardware Target Game Database', 'Patchable', 'C01173E.zip')}|C01173E.rom`, 'dfaebe28'],
    ]);
  });

  it('should symlink, test, and clean', async () => {
    await expectEndToEnd({
      commands: ['symlink', 'test', 'clean'],
      dat: ['dats/*'],
      dirDatName: true,
    }, [
      [`${path.join('Headered', 'allpads.nes')} -> ${path.join('<input>', 'roms', 'headered', 'allpads.nes')}`, '9180a163'],
      [`${path.join('Headered', 'color_test.nes')} -> ${path.join('<input>', 'roms', 'headered', 'color_test.nintendoentertainmentsystem')}`, 'c9c1b7aa'],
      [`${path.join('Headered', 'diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78')} -> ${path.join('<input>', 'roms', 'headered', 'diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78')}`, 'f6cc9b1c'],
      [`${path.join('Headered', 'fds_joypad_test.fds.zip|fds_joypad_test.fds')} -> ${path.join('<input>', 'roms', 'headered', 'fds_joypad_test.fds.zip|fds_joypad_test.fds')}`, '1e58456d'],
      [`${path.join('Headered', 'LCDTestROM.lnx.rar|LCDTestROM.lnx')} -> ${path.join('<input>', 'roms', 'headered', 'LCDTestROM.lnx.rar|LCDTestROM.lnx')}`, '2d251538'],
      [`${path.join('Headered', 'speed_test_v51.smc')} -> ${path.join('<input>', 'roms', 'headered', 'speed_test_v51.smc')}`, '9adca6cc'],
      [`${path.join('One', 'Fizzbuzz.nes')} -> ${path.join('<input>', 'roms', 'raw', 'fizzbuzz.nes')}`, '370517b5'],
      [`${path.join('One', 'Foobar.lnx')} -> ${path.join('<input>', 'roms', 'foobar.lnx')}`, 'b22c9747'],
      [`${path.join('One', 'Lorem Ipsum.rom')} -> ${path.join('<input>', 'roms', 'raw', 'loremipsum.rom')}`, '70856527'],
      [`${path.join('One', 'One Three.zip')}|${path.join('1', 'one.rom')} -> ${path.join('<input>', 'roms', 'zip', 'onetwothree.zip')}|${path.join('1', 'one.rom')}`, 'f817a89f'],
      [`${path.join('One', 'One Three.zip')}|${path.join('2', 'two.rom')} -> ${path.join('<input>', 'roms', 'zip', 'onetwothree.zip')}|${path.join('2', 'two.rom')}`, '96170874'],
      [`${path.join('One', 'One Three.zip')}|${path.join('3', 'three.rom')} -> ${path.join('<input>', 'roms', 'zip', 'onetwothree.zip')}|${path.join('3', 'three.rom')}`, 'ff46c5d8'],
      [`${path.join('One', 'Three Four Five', 'Five.rom')} -> ${path.join('<input>', 'roms', 'raw', 'five.rom')}`, '3e5daf67'],
      [`${path.join('One', 'Three Four Five', 'Four.rom')} -> ${path.join('<input>', 'roms', 'raw', 'four.rom')}`, '1cf3ca74'],
      [`${path.join('One', 'Three Four Five', 'Three.rom')} -> ${path.join('<input>', 'roms', 'raw', 'three.rom')}`, 'ff46c5d8'],
      [`${path.join('Patchable', '0F09A40.rom')} -> ${path.join('<input>', 'roms', 'patchable', '0F09A40.rom')}`, '2f943e86'],
      [`${path.join('Patchable', '3708F2C.rom')} -> ${path.join('<input>', 'roms', 'patchable', '3708F2C.rom')}`, '20891c9f'],
      [`${path.join('Patchable', '612644F.rom')} -> ${path.join('<input>', 'roms', 'patchable', '612644F.rom')}`, 'f7591b29'],
      [`${path.join('Patchable', '65D1206.rom')} -> ${path.join('<input>', 'roms', 'patchable', '65D1206.rom')}`, '20323455'],
      [`${path.join('Patchable', '92C85C9.rom')} -> ${path.join('<input>', 'roms', 'patchable', '92C85C9.rom')}`, '06692159'],
      [`${path.join('Patchable', 'Before.rom')} -> ${path.join('<input>', 'roms', 'patchable', 'before.rom')}`, '0361b321'],
      [`${path.join('Patchable', 'Best.gz|best.rom')} -> ${path.join('<input>', 'roms', 'patchable', 'best.gz|best.rom')}`, '1e3d78cf'],
      [`${path.join('Patchable', 'C01173E.rom')} -> ${path.join('<input>', 'roms', 'patchable', 'C01173E.rom')}`, 'dfaebe28'],
      [`${path.join('Patchable', 'KDULVQN.rom')} -> ${path.join('<input>', 'roms', 'patchable', 'KDULVQN.rom')}`, 'b1c303e4'],
      [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.nes')} -> ${path.join('<input>', 'roms', 'raw', 'fizzbuzz.nes')}`, '370517b5'],
      [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.lnx')} -> ${path.join('<input>', 'roms', 'foobar.lnx')}`, 'b22c9747'],
      [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.rom')} -> ${path.join('<input>', 'roms', 'raw', 'loremipsum.rom')}`, '70856527'],
      [`${path.join('smdb', 'Hardware Target Game Database', 'Patchable', '3708F2C.rom')} -> ${path.join('<input>', 'roms', 'patchable', '3708F2C.rom')}`, '20891c9f'],
      [`${path.join('smdb', 'Hardware Target Game Database', 'Patchable', '65D1206.rom')} -> ${path.join('<input>', 'roms', 'patchable', '65D1206.rom')}`, '20323455'],
      [`${path.join('smdb', 'Hardware Target Game Database', 'Patchable', 'C01173E.rom')} -> ${path.join('<input>', 'roms', 'patchable', 'C01173E.rom')}`, 'dfaebe28'],
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
      [path.join('One', 'Fizzbuzz.nes'), '370517b5'],
      [path.join('One', 'Foobar.lnx'), 'b22c9747'],
      [path.join('One', 'Lorem Ipsum.rom'), '70856527'],
      [path.join('One', 'One Three', 'One.rom'), 'f817a89f'],
      [path.join('One', 'One Three', 'Three.rom'), 'ff46c5d8'],
      [path.join('One', 'Three Four Five', 'Five.rom'), '3e5daf67'],
      [path.join('One', 'Three Four Five', 'Four.rom'), '1cf3ca74'],
      [path.join('One', 'Three Four Five', 'Three.rom'), 'ff46c5d8'],
      [path.join('Patchable', '04C896D-GBA.rom'), 'b13eb478'],
      [path.join('Patchable', '0F09A40.rom'), '2f943e86'],
      [path.join('Patchable', '3708F2C.rom'), '20891c9f'],
      [path.join('Patchable', '4FE952A.rom'), '1fb4f81f'],
      [path.join('Patchable', '612644F.rom'), 'f7591b29'],
      [path.join('Patchable', '65D1206.rom'), '20323455'],
      [path.join('Patchable', '92C85C9.rom'), '06692159'],
      [path.join('Patchable', '949F2B7.rom'), '95284ab4'],
      [path.join('Patchable', '9A71FA5.rom'), '922f5181'],
      [path.join('Patchable', '9E66269.rom'), '8bb5cc63'],
      [path.join('Patchable', 'After.rom'), '4c8e44d4'],
      [path.join('Patchable', 'Before.rom'), '0361b321'],
      [path.join('Patchable', 'Best.rom'), '1e3d78cf'],
      [path.join('Patchable', 'C01173E.rom'), 'dfaebe28'],
      [path.join('Patchable', 'DDSK3AN.rom'), 'e02c6dbb'],
      [path.join('Patchable', 'DFF7872-N64-SIMPLE.rom'), 'caaaf550'],
      [path.join('Patchable', 'KDULVQN.rom'), 'b1c303e4'],
      [path.join('Patchable', 'Worst.rom'), '6ff9ef96'],
      [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.nes'), '370517b5'],
      [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.lnx'), 'b22c9747'],
      [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.rom'), '70856527'],
      [path.join('smdb', 'Hardware Target Game Database', 'Patchable', '3708F2C.rom'), '20891c9f'],
      [path.join('smdb', 'Hardware Target Game Database', 'Patchable', '65D1206.rom'), '20323455'],
      [path.join('smdb', 'Hardware Target Game Database', 'Patchable', '949F2B7.rom'), '95284ab4'],
      [path.join('smdb', 'Hardware Target Game Database', 'Patchable', '9E66269.rom'), '8bb5cc63'],
      [path.join('smdb', 'Hardware Target Game Database', 'Patchable', 'C01173E.rom'), 'dfaebe28'],
      [path.join('smdb', 'Hardware Target Game Database', 'Patchable', 'DFF7872-N64-SIMPLE.rom'), 'caaaf550'],
    ]);
  });

  it('should report without writing', async () => {
    await expectEndToEnd({
      commands: ['report'],
      dat: ['dats/*'],
      reportOutput: 'report.csv',
    }, []);
  });

  test.each([
    'copy',
    'move',
    'symlink',
  ])('should generate a fixdat when writing: %s', async (command) => {
    const writtenFixdats = (await runIgir({
      commands: [command],
      dat: ['dats/*'],
      fixdat: true,
      dirDatName: true,
    })).outputFilesAndCrcs
      .map(([filePath]) => filePath)
      .filter((filePath) => filePath.endsWith('.dat'));

    // Only the "One" DAT should have missing ROMs (Missing.rom)
    expect(writtenFixdats).toHaveLength(1);
    expect(writtenFixdats[0]).toMatch(/^One fixdat \([0-9]{8}-[0-9]{6}\)\.dat$/);
  });

  it('should generate a fixdat when not writing', async () => {
    const writtenFixdats = (await runIgir({
      commands: ['report'],
      dat: ['dats/*'],
      fixdat: true,
      dirDatName: true,
    })).cwdFilesAndCrcs
      .map(([filePath]) => filePath)
      .filter((filePath) => filePath.endsWith('.dat'));

    // Only the "One" DAT should have missing ROMs (Missing.rom)
    expect(writtenFixdats).toHaveLength(1);
    expect(writtenFixdats[0]).toMatch(/^One fixdat \([0-9]{8}-[0-9]{6}\)\.dat$/);
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
      ['3708F2C.rom', '20891c9f'],
      ['612644F.rom', 'f7591b29'],
      ['65D1206.rom', '20323455'],
      ['92C85C9.rom', '06692159'],
      ['allpads.nes', '9180a163'],
      ['before.rom', '0361b321'],
      ['best.gz|best.rom', '1e3d78cf'],
      ['C01173E.rom', 'dfaebe28'],
      ['color_test.nintendoentertainmentsystem', 'c9c1b7aa'],
      ['diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78', 'f6cc9b1c'],
      ['empty.rom', '00000000'],
      ['fds_joypad_test.fds.zip|fds_joypad_test.fds', '1e58456d'],
      ['five.rom', '3e5daf67'],
      ['fizzbuzz.nes', '370517b5'],
      ['foobar.lnx', 'b22c9747'],
      ['four.rom', '1cf3ca74'],
      ['fourfive.zip|five.rom', '3e5daf67'],
      ['fourfive.zip|four.rom', '1cf3ca74'],
      ['KDULVQN.rom', 'b1c303e4'],
      ['LCDTestROM.lnx.rar|LCDTestROM.lnx', '2d251538'],
      ['loremipsum.rom', '70856527'],
      ['one.rom', 'f817a89f'],
      [`onetwothree.zip|${path.join('1', 'one.rom')}`, 'f817a89f'],
      [`onetwothree.zip|${path.join('2', 'two.rom')}`, '96170874'],
      [`onetwothree.zip|${path.join('3', 'three.rom')}`, 'ff46c5d8'],
      ['speed_test_v51.sfc.gz|speed_test_v51.sfc', '8beffd94'],
      ['speed_test_v51.smc', '9adca6cc'],
      ['three.rom', 'ff46c5d8'],
      ['two.rom', '96170874'],
      ['unknown.rom', '377a7727'],
    ]);
  });

  it('should move, extract, test, and clean', async () => {
    await expectEndToEnd({
      commands: ['move', 'extract', 'test', 'clean'],
    }, [
      ['0F09A40.rom', '2f943e86'],
      ['3708F2C.rom', '20891c9f'],
      ['612644F.rom', 'f7591b29'],
      ['65D1206.rom', '20323455'],
      ['92C85C9.rom', '06692159'],
      ['allpads.nes', '9180a163'],
      ['before.rom', '0361b321'],
      ['best.rom', '1e3d78cf'],
      ['C01173E.rom', 'dfaebe28'],
      ['color_test.nintendoentertainmentsystem', 'c9c1b7aa'],
      ['diagnostic_test_cartridge.a78', 'f6cc9b1c'],
      ['empty.rom', '00000000'],
      ['fds_joypad_test.fds', '1e58456d'],
      ['five.rom', '3e5daf67'],
      ['fizzbuzz.nes', '370517b5'],
      ['foobar.lnx', 'b22c9747'],
      ['four.rom', '1cf3ca74'],
      [path.join('fourfive', 'five.rom'), '3e5daf67'],
      [path.join('fourfive', 'four.rom'), '1cf3ca74'],
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
    ], [
      path.join('roms', 'empty.rom'),
      path.join('roms', 'foobar.lnx'),
      path.join('roms', 'headered', 'LCDTestROM.lnx.rar'),
      path.join('roms', 'headered', 'allpads.nes'),
      path.join('roms', 'headered', 'color_test.nintendoentertainmentsystem'),
      path.join('roms', 'headered', 'diagnostic_test_cartridge.a78.7z'),
      path.join('roms', 'headered', 'fds_joypad_test.fds.zip'),
      path.join('roms', 'headered', 'speed_test_v51.smc'),
      path.join('roms', 'patchable', '0F09A40.rom'),
      path.join('roms', 'patchable', '3708F2C.rom'),
      path.join('roms', 'patchable', '612644F.rom'),
      path.join('roms', 'patchable', '65D1206.rom'),
      path.join('roms', 'patchable', '92C85C9.rom'),
      path.join('roms', 'patchable', 'C01173E.rom'),
      path.join('roms', 'patchable', 'KDULVQN.rom'),
      path.join('roms', 'patchable', 'before.rom'),
      path.join('roms', 'patchable', 'best.gz'),
      path.join('roms', 'raw', 'five.rom'),
      path.join('roms', 'raw', 'fizzbuzz.nes'),
      path.join('roms', 'raw', 'four.rom'),
      path.join('roms', 'raw', 'loremipsum.rom'),
      path.join('roms', 'raw', 'one.rom'),
      path.join('roms', 'raw', 'three.rom'),
      path.join('roms', 'raw', 'two.rom'),
      path.join('roms', 'raw', 'unknown.rom'),
      path.join('roms', 'unheadered', 'speed_test_v51.sfc.gz'),
    ]);
  });

  it('should copy, zip, test, and clean', async () => {
    await expectEndToEnd({
      commands: ['copy', 'zip', 'test', 'clean'],
    }, [
      ['0F09A40.zip|0F09A40.rom', '2f943e86'],
      ['3708F2C.zip|3708F2C.rom', '20891c9f'],
      ['612644F.zip|612644F.rom', 'f7591b29'],
      ['65D1206.zip|65D1206.rom', '20323455'],
      ['92C85C9.zip|92C85C9.rom', '06692159'],
      ['allpads.zip|allpads.nes', '9180a163'],
      ['before.zip|before.rom', '0361b321'],
      ['best.zip|best.rom', '1e3d78cf'],
      ['C01173E.zip|C01173E.rom', 'dfaebe28'],
      ['color_test.zip|color_test.nintendoentertainmentsystem', 'c9c1b7aa'],
      ['diagnostic_test_cartridge.zip|diagnostic_test_cartridge.a78', 'f6cc9b1c'],
      ['empty.zip|empty.rom', '00000000'],
      ['fds_joypad_test.zip|fds_joypad_test.fds', '1e58456d'],
      ['five.zip|five.rom', '3e5daf67'],
      ['fizzbuzz.zip|fizzbuzz.nes', '370517b5'],
      ['foobar.zip|foobar.lnx', 'b22c9747'],
      ['four.zip|four.rom', '1cf3ca74'],
      ['fourfive.zip|five.rom', '3e5daf67'],
      ['fourfive.zip|four.rom', '1cf3ca74'],
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

  it('should relative symlink, test, and clean', async () => {
    await expectEndToEnd({
      commands: ['symlink', 'test', 'clean'],
      symlinkRelative: true,
    }, [
      [`0F09A40.rom -> ${path.join('..', 'input', 'roms', 'patchable', '0F09A40.rom')}`, '2f943e86'],
      [`3708F2C.rom -> ${path.join('..', 'input', 'roms', 'patchable', '3708F2C.rom')}`, '20891c9f'],
      [`612644F.rom -> ${path.join('..', 'input', 'roms', 'patchable', '612644F.rom')}`, 'f7591b29'],
      [`65D1206.rom -> ${path.join('..', 'input', 'roms', 'patchable', '65D1206.rom')}`, '20323455'],
      [`92C85C9.rom -> ${path.join('..', 'input', 'roms', 'patchable', '92C85C9.rom')}`, '06692159'],
      [`allpads.nes -> ${path.join('..', 'input', 'roms', 'headered', 'allpads.nes')}`, '9180a163'],
      [`before.rom -> ${path.join('..', 'input', 'roms', 'patchable', 'before.rom')}`, '0361b321'],
      [`best.gz|best.rom -> ${path.join('..', 'input', 'roms', 'patchable', 'best.gz|best.rom')}`, '1e3d78cf'],
      [`C01173E.rom -> ${path.join('..', 'input', 'roms', 'patchable', 'C01173E.rom')}`, 'dfaebe28'],
      [`color_test.nintendoentertainmentsystem -> ${path.join('..', 'input', 'roms', 'headered', 'color_test.nintendoentertainmentsystem')}`, 'c9c1b7aa'],
      [`diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78 -> ${path.join('..', 'input', 'roms', 'headered', 'diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78')}`, 'f6cc9b1c'],
      [`empty.rom -> ${path.join('..', 'input', 'roms', 'empty.rom')}`, '00000000'],
      [`fds_joypad_test.fds.zip|fds_joypad_test.fds -> ${path.join('..', 'input', 'roms', 'headered', 'fds_joypad_test.fds.zip|fds_joypad_test.fds')}`, '1e58456d'],
      [`five.rom -> ${path.join('..', 'input', 'roms', 'raw', 'five.rom')}`, '3e5daf67'],
      [`fizzbuzz.nes -> ${path.join('..', 'input', 'roms', 'raw', 'fizzbuzz.nes')}`, '370517b5'],
      [`foobar.lnx -> ${path.join('..', 'input', 'roms', 'foobar.lnx')}`, 'b22c9747'],
      [`four.rom -> ${path.join('..', 'input', 'roms', 'raw', 'four.rom')}`, '1cf3ca74'],
      [`fourfive.zip|five.rom -> ${path.join('..', 'input', 'roms', 'zip', 'fourfive.zip')}|five.rom`, '3e5daf67'],
      [`fourfive.zip|four.rom -> ${path.join('..', 'input', 'roms', 'zip', 'fourfive.zip')}|four.rom`, '1cf3ca74'],
      [`KDULVQN.rom -> ${path.join('..', 'input', 'roms', 'patchable', 'KDULVQN.rom')}`, 'b1c303e4'],
      [`LCDTestROM.lnx.rar|LCDTestROM.lnx -> ${path.join('..', 'input', 'roms', 'headered', 'LCDTestROM.lnx.rar|LCDTestROM.lnx')}`, '2d251538'],
      [`loremipsum.rom -> ${path.join('..', 'input', 'roms', 'raw', 'loremipsum.rom')}`, '70856527'],
      [`one.rom -> ${path.join('..', 'input', 'roms', 'raw', 'one.rom')}`, 'f817a89f'],
      [`onetwothree.zip|${path.join('1', 'one.rom')} -> ${path.join('..', 'input', 'roms', 'zip', 'onetwothree.zip')}|${path.join('1', 'one.rom')}`, 'f817a89f'],
      [`onetwothree.zip|${path.join('2', 'two.rom')} -> ${path.join('..', 'input', 'roms', 'zip', 'onetwothree.zip')}|${path.join('2', 'two.rom')}`, '96170874'],
      [`onetwothree.zip|${path.join('3', 'three.rom')} -> ${path.join('..', 'input', 'roms', 'zip', 'onetwothree.zip')}|${path.join('3', 'three.rom')}`, 'ff46c5d8'],
      [`speed_test_v51.sfc.gz|speed_test_v51.sfc -> ${path.join('..', 'input', 'roms', 'unheadered', 'speed_test_v51.sfc.gz|speed_test_v51.sfc')}`, '8beffd94'],
      [`speed_test_v51.smc -> ${path.join('..', 'input', 'roms', 'headered', 'speed_test_v51.smc')}`, '9adca6cc'],
      [`three.rom -> ${path.join('..', 'input', 'roms', 'raw', 'three.rom')}`, 'ff46c5d8'],
      [`two.rom -> ${path.join('..', 'input', 'roms', 'raw', 'two.rom')}`, '96170874'],
      [`unknown.rom -> ${path.join('..', 'input', 'roms', 'raw', 'unknown.rom')}`, '377a7727'],
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
