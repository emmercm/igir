import path from 'path';

import Logger from '../src/console/logger.js';
import LogLevel from '../src/console/logLevel.js';
import Constants from '../src/constants.js';
import Igir from '../src/igir.js';
import ArrayPoly from '../src/polyfill/arrayPoly.js';
import fsPoly from '../src/polyfill/fsPoly.js';
import FileFactory from '../src/types/files/fileFactory.js';
import Options, { OptionsProps } from '../src/types/options.js';

interface TestOutput {
  outputFilesAndCrcs: string[][],
  cwdFilesAndCrcs: string[][],
  movedFiles: string[],
  cleanedFiles: string[],
}

async function copyFixturesToTemp(
  callback: (input: string, output: string) => void | Promise<void>,
): Promise<void> {
  const temp = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR));

  // Set up the input directory
  const inputTemp = path.join(temp, 'input');
  await fsPoly.copyDir('./test/fixtures', inputTemp);

  // Set up the output directory
  const outputTemp = path.join(temp, 'output');

  try {
    // Call the callback
    await callback(inputTemp, outputTemp);
  } finally {
    // Delete the temp files
    await fsPoly.rm(inputTemp, { recursive: true });
    await fsPoly.rm(outputTemp, { force: true, recursive: true });
  }
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
  return (await Promise.all((await fsPoly.walk(outputDir))
    .map(async (filePath) => {
      try {
        return await FileFactory.filesFrom(filePath);
      } catch (e) {
        return [];
      }
    })))
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
  const options = new Options(optionsProps);

  const tempCwd = await fsPoly.mkdtemp(path.join(Constants.GLOBAL_TEMP_DIR, 'cwd'));
  return chdir(tempCwd, async () => {
    const inputFilesBefore = (await Promise.all(options.getInputPaths()
      .map(async (inputPath) => fsPoly.walk(inputPath))))
      .flatMap((inputFiles) => inputFiles)
      .reduce(ArrayPoly.reduceUnique(), []);
    const outputFilesBefore = await fsPoly.walk(options.getOutputDirRoot());

    await new Igir(options, new Logger(LogLevel.NEVER)).main();

    const outputFilesAndCrcs = (await Promise.all(options.getInputPaths()
      .map(async (inputPath) => walkWithCrc(inputPath, options.getOutputDirRoot()))))
      .flatMap((filesAndCrcs) => filesAndCrcs)
      .sort((a, b) => a[0].localeCompare(b[0]));
    const cwdFilesAndCrcs = (await Promise.all(options.getInputPaths()
      .map(async (inputPath) => walkWithCrc(inputPath, tempCwd))))
      .flatMap((filesAndCrcs) => filesAndCrcs)
      .sort((a, b) => a[0].localeCompare(b[0]));

    const inputFilesAfter = (await Promise.all(options.getInputPaths()
      .map(async (inputPath) => fsPoly.walk(inputPath))))
      .flatMap((inputFiles) => inputFiles)
      .reduce(ArrayPoly.reduceUnique(), []);
    const movedFiles = inputFilesBefore
      .filter((filePath) => inputFilesAfter.indexOf(filePath) === -1)
      .map((filePath) => {
        let replaced = filePath;
        options.getInputPaths().forEach((inputPath) => {
          replaced = replaced.replace(inputPath + path.sep, '');
        });
        return replaced;
      })
      .sort();

    const outputFilesAfter = await fsPoly.walk(options.getOutputDirRoot());
    const cleanedFiles = outputFilesBefore
      .filter((filePath) => outputFilesAfter.indexOf(filePath) === -1)
      .map((filePath) => filePath.replace(options.getOutputDirRoot() + path.sep, ''))
      .sort();

    return {
      outputFilesAndCrcs,
      cwdFilesAndCrcs,
      movedFiles,
      cleanedFiles,
    };
  });
}

describe('with explicit DATs', () => {
  it('should do nothing with no roms', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy'],
        dat: [path.join(inputTemp, 'dats')],
        input: [],
        output: outputTemp,
      });

      expect(result.outputFilesAndCrcs).toHaveLength(0);
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should throw on all invalid dats', async () => {
    await expect(async () => new Igir(new Options({
      dat: ['src/*'],
    }), new Logger(LogLevel.NEVER)).main()).rejects.toThrow(/no valid dat files/i);
  });

  it('should throw on DATs without parent/clone info', async () => {
    await expect(async () => new Igir(new Options({
      dat: ['test/fixtures/dats/{headered,patchable}.dat'],
      single: true,
    }), new Logger(LogLevel.NEVER)).main()).rejects.toThrow(/parent\/clone/i);
  });

  it('should copy and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy', 'test'],
        dat: [path.join(inputTemp, 'dats')],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
        dirDatName: true,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [path.join('Headered', 'allpads.nes'), '9180a163'],
        [path.join('Headered', 'color_test.nes'), 'c9c1b7aa'],
        [`${path.join('Headered', 'diagnostic_test_cartridge.a78.7z')}|diagnostic_test_cartridge.a78`, 'f6cc9b1c'],
        [`${path.join('Headered', 'fds_joypad_test.fds.zip')}|fds_joypad_test.fds`, '1e58456d'],
        [`${path.join('Headered', 'LCDTestROM.lnx.rar')}|LCDTestROM.lnx`, '2d251538'],
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
        [`${path.join('Patchable', 'Best.gz')}|best.rom`, '1e3d78cf'],
        [path.join('Patchable', 'C01173E.rom'), 'dfaebe28'],
        [path.join('Patchable', 'KDULVQN.rom'), 'b1c303e4'],
        [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.nes'), '370517b5'],
        [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.lnx'), 'b22c9747'],
        [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.rom'), '70856527'],
        [path.join('smdb', 'Hardware Target Game Database', 'Patchable', '3708F2C.rom'), '20891c9f'],
        [path.join('smdb', 'Hardware Target Game Database', 'Patchable', '65D1206.rom'), '20323455'],
        [path.join('smdb', 'Hardware Target Game Database', 'Patchable', 'C01173E.rom'), 'dfaebe28'],
      ]);
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy a 1G1R set', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy'],
        dat: [path.join(inputTemp, 'dats', 'one.dat')],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
        single: true,
        preferParent: true,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        // Fizzbuzz.nes is explicitly missing!
        ['Foobar.lnx', 'b22c9747'],
        ['Lorem Ipsum.rom', '70856527'],
        [`${path.join('One Three.zip')}|${path.join('1', 'one.rom')}`, 'f817a89f'],
        [`${path.join('One Three.zip')}|${path.join('2', 'two.rom')}`, '96170874'],
        [`${path.join('One Three.zip')}|${path.join('3', 'three.rom')}`, 'ff46c5d8'],
        [path.join('Three Four Five', 'Five.rom'), '3e5daf67'],
        [path.join('Three Four Five', 'Four.rom'), '1cf3ca74'],
        [path.join('Three Four Five', 'Three.rom'), 'ff46c5d8'],
      ]);
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy and clean', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given some existing files in the output directory
      const junkFiles = [
        path.join(outputTemp, 'one.rom'),
        path.join(outputTemp, 'rom', 'two.rom'),
        path.join(outputTemp, 'zip', 'three.zip'),
        path.join(outputTemp, 'iso', 'four.iso'),
      ];
      await Promise.all(junkFiles.map(async (junkFile) => {
        await fsPoly.touch(junkFile);
        expect(await fsPoly.exists(junkFile)).toEqual(true);
      }));

      // When running igir with the clean command
      const result = await runIgir({
        commands: ['copy', 'clean'],
        dat: [path.join(inputTemp, 'dats')],
        input: [path.join(inputTemp, 'roms')],
        output: path.join(outputTemp, '{outputExt}'),
        dirDatName: true,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [`${path.join('7z', 'Headered', 'diagnostic_test_cartridge.a78.7z')}|diagnostic_test_cartridge.a78`, 'f6cc9b1c'],
        [`${path.join('gz', 'Patchable', 'Best.gz')}|best.rom`, '1e3d78cf'],
        [path.join('iso', 'four.iso'), '00000000'], // explicitly not deleted, there were no input files with the extension "iso"
        [path.join('lnx', 'One', 'Foobar.lnx'), 'b22c9747'],
        [path.join('lnx', 'smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.lnx'), 'b22c9747'],
        [path.join('nes', 'Headered', 'allpads.nes'), '9180a163'],
        [path.join('nes', 'Headered', 'color_test.nes'), 'c9c1b7aa'],
        [path.join('nes', 'One', 'Fizzbuzz.nes'), '370517b5'],
        [path.join('nes', 'smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.nes'), '370517b5'],
        ['one.rom', '00000000'], // explicitly not deleted, it is not in an extension subdirectory
        [`${path.join('rar', 'Headered', 'LCDTestROM.lnx.rar')}|LCDTestROM.lnx`, '2d251538'],
        [path.join('rom', 'One', 'Lorem Ipsum.rom'), '70856527'],
        [path.join('rom', 'One', 'Three Four Five', 'Five.rom'), '3e5daf67'],
        [path.join('rom', 'One', 'Three Four Five', 'Four.rom'), '1cf3ca74'],
        [path.join('rom', 'One', 'Three Four Five', 'Three.rom'), 'ff46c5d8'],
        [path.join('rom', 'Patchable', '0F09A40.rom'), '2f943e86'],
        [path.join('rom', 'Patchable', '3708F2C.rom'), '20891c9f'],
        [path.join('rom', 'Patchable', '612644F.rom'), 'f7591b29'],
        [path.join('rom', 'Patchable', '65D1206.rom'), '20323455'],
        [path.join('rom', 'Patchable', '92C85C9.rom'), '06692159'],
        [path.join('rom', 'Patchable', 'Before.rom'), '0361b321'],
        [path.join('rom', 'Patchable', 'C01173E.rom'), 'dfaebe28'],
        [path.join('rom', 'Patchable', 'KDULVQN.rom'), 'b1c303e4'],
        [path.join('rom', 'smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.rom'), '70856527'],
        [path.join('rom', 'smdb', 'Hardware Target Game Database', 'Patchable', '3708F2C.rom'), '20891c9f'],
        [path.join('rom', 'smdb', 'Hardware Target Game Database', 'Patchable', '65D1206.rom'), '20323455'],
        [path.join('rom', 'smdb', 'Hardware Target Game Database', 'Patchable', 'C01173E.rom'), 'dfaebe28'],
        [path.join('smc', 'Headered', 'speed_test_v51.smc'), '9adca6cc'],
        [`${path.join('zip', 'Headered', 'fds_joypad_test.fds.zip')}|fds_joypad_test.fds`, '1e58456d'],
        [`${path.join('zip', 'One', 'One Three.zip')}|${path.join('1', 'one.rom')}`, 'f817a89f'],
        [`${path.join('zip', 'One', 'One Three.zip')}|${path.join('2', 'two.rom')}`, '96170874'],
        [`${path.join('zip', 'One', 'One Three.zip')}|${path.join('3', 'three.rom')}`, 'ff46c5d8'],
      ]);
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toEqual([
        path.join('rom', 'two.rom'),
        path.join('zip', 'three.zip'),
      ]);
    });
  });

  it('should move, extract and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['move', 'extract', 'test'],
        dat: [path.join(inputTemp, 'dats')],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
        dirDatName: true,
      });

      expect(result.outputFilesAndCrcs).toEqual([
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
      ]);
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toEqual([
        path.join('foobar.lnx'),
        path.join('headered', 'LCDTestROM.lnx.rar'),
        path.join('headered', 'allpads.nes'),
        path.join('headered', 'color_test.nintendoentertainmentsystem'),
        path.join('headered', 'diagnostic_test_cartridge.a78.7z'),
        path.join('headered', 'fds_joypad_test.fds.zip'),
        path.join('headered', 'speed_test_v51.smc'),
        path.join('patchable', '0F09A40.rom'),
        path.join('patchable', '3708F2C.rom'),
        path.join('patchable', '612644F.rom'),
        path.join('patchable', '65D1206.rom'),
        path.join('patchable', '92C85C9.rom'),
        path.join('patchable', 'C01173E.rom'),
        path.join('patchable', 'KDULVQN.rom'),
        path.join('patchable', 'before.rom'),
        path.join('patchable', 'best.gz'),
        path.join('raw', 'five.rom'),
        path.join('raw', 'fizzbuzz.nes'),
        path.join('raw', 'four.rom'),
        path.join('raw', 'loremipsum.rom'),
        path.join('raw', 'three.rom'),
      ]);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should move zipped files', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['move'],
        dat: [path.join(inputTemp, 'dats')],
        input: [path.join(inputTemp, 'roms', 'zip')],
        output: outputTemp,
        dirDatName: true,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [`${path.join('One', 'Fizzbuzz.zip')}|fizzbuzz.nes`, '370517b5'],
        [`${path.join('One', 'Foobar.zip')}|foobar.lnx`, 'b22c9747'],
        // NOTE(cemmer): 'One Three.zip' explicitly contains 'two.rom' because the entire file was
        //  moved, including any extra entries in the input archive.
        [`${path.join('One', 'Lorem Ipsum.zip')}|loremipsum.rom`, '70856527'],
        [`${path.join('One', 'One Three.zip')}|${path.join('1', 'one.rom')}`, 'f817a89f'],
        [`${path.join('One', 'One Three.zip')}|${path.join('2', 'two.rom')}`, '96170874'],
        [`${path.join('One', 'One Three.zip')}|${path.join('3', 'three.rom')}`, 'ff46c5d8'],
        // NOTE(cemmer): 'Three Four Five.zip' is explicitly missing, because not all ROMs can be
        //  found in one archive.
        [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.zip')}|fizzbuzz.nes`, '370517b5'],
        [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.zip')}|foobar.lnx`, 'b22c9747'],
        [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.zip')}|loremipsum.rom`, '70856527'],
      ]);
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toEqual([
        path.join('fizzbuzz.zip'),
        path.join('foobar.zip'),
        // NOTE(cemmer): 'fourfive.zip' is explicitly not deleted
        path.join('loremipsum.zip'),
        path.join('onetwothree.zip'), // explicitly deleted!
      ]);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy, zip, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy', 'zip', 'test'],
        dat: [path.join(inputTemp, 'dats')],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
        dirDatName: true,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [`${path.join('Headered', 'allpads.zip')}|allpads.nes`, '9180a163'],
        [`${path.join('Headered', 'color_test.zip')}|color_test.nes`, 'c9c1b7aa'],
        [`${path.join('Headered', 'diagnostic_test_cartridge.zip')}|diagnostic_test_cartridge.a78`, 'f6cc9b1c'],
        [`${path.join('Headered', 'fds_joypad_test.zip')}|fds_joypad_test.fds`, '1e58456d'],
        [`${path.join('Headered', 'LCDTestROM.zip')}|LCDTestROM.lnx`, '2d251538'],
        [`${path.join('Headered', 'speed_test_v51.zip')}|speed_test_v51.smc`, '9adca6cc'],
        [`${path.join('One', 'Fizzbuzz.zip')}|Fizzbuzz.nes`, '370517b5'],
        [`${path.join('One', 'Foobar.zip')}|Foobar.lnx`, 'b22c9747'],
        [`${path.join('One', 'Lorem Ipsum.zip')}|Lorem Ipsum.rom`, '70856527'],
        [`${path.join('One', 'One Three.zip')}|One.rom`, 'f817a89f'],
        [`${path.join('One', 'One Three.zip')}|Three.rom`, 'ff46c5d8'],
        [`${path.join('One', 'Three Four Five.zip')}|Five.rom`, '3e5daf67'],
        [`${path.join('One', 'Three Four Five.zip')}|Four.rom`, '1cf3ca74'],
        [`${path.join('One', 'Three Four Five.zip')}|Three.rom`, 'ff46c5d8'],
        [`${path.join('Patchable', '0F09A40.zip')}|0F09A40.rom`, '2f943e86'],
        [`${path.join('Patchable', '3708F2C.zip')}|3708F2C.rom`, '20891c9f'],
        [`${path.join('Patchable', '612644F.zip')}|612644F.rom`, 'f7591b29'],
        [`${path.join('Patchable', '65D1206.zip')}|65D1206.rom`, '20323455'],
        [`${path.join('Patchable', '92C85C9.zip')}|92C85C9.rom`, '06692159'],
        [`${path.join('Patchable', 'Before.zip')}|Before.rom`, '0361b321'],
        [`${path.join('Patchable', 'Best.zip')}|Best.rom`, '1e3d78cf'],
        [`${path.join('Patchable', 'C01173E.zip')}|C01173E.rom`, 'dfaebe28'],
        [`${path.join('Patchable', 'KDULVQN.zip')}|KDULVQN.rom`, 'b1c303e4'],
        [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.zip')}|Fizzbuzz.nes`, '370517b5'],
        [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.zip')}|Foobar.lnx`, 'b22c9747'],
        [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.zip')}|Lorem Ipsum.rom`, '70856527'],
        [`${path.join('smdb', 'Hardware Target Game Database', 'Patchable', '3708F2C.zip')}|3708F2C.rom`, '20891c9f'],
        [`${path.join('smdb', 'Hardware Target Game Database', 'Patchable', '65D1206.zip')}|65D1206.rom`, '20323455'],
        [`${path.join('smdb', 'Hardware Target Game Database', 'Patchable', 'C01173E.zip')}|C01173E.rom`, 'dfaebe28'],
      ]);
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should symlink and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['symlink', 'test'],
        dat: [path.join(inputTemp, 'dats')],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
        dirDatName: true,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [`${path.join('Headered', 'allpads.nes')} -> ${path.join('<input>', 'headered', 'allpads.nes')}`, '9180a163'],
        [`${path.join('Headered', 'color_test.nes')} -> ${path.join('<input>', 'headered', 'color_test.nintendoentertainmentsystem')}`, 'c9c1b7aa'],
        [`${path.join('Headered', 'diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78')} -> ${path.join('<input>', 'headered', 'diagnostic_test_cartridge.a78.7z')}|diagnostic_test_cartridge.a78`, 'f6cc9b1c'],
        [`${path.join('Headered', 'fds_joypad_test.fds.zip')}|fds_joypad_test.fds -> ${path.join('<input>', 'headered', 'fds_joypad_test.fds.zip')}|fds_joypad_test.fds`, '1e58456d'],
        [`${path.join('Headered', 'LCDTestROM.lnx.rar')}|LCDTestROM.lnx -> ${path.join('<input>', 'headered', 'LCDTestROM.lnx.rar')}|LCDTestROM.lnx`, '2d251538'],
        [`${path.join('Headered', 'speed_test_v51.smc')} -> ${path.join('<input>', 'headered', 'speed_test_v51.smc')}`, '9adca6cc'],
        [`${path.join('One', 'Fizzbuzz.nes')} -> ${path.join('<input>', 'raw', 'fizzbuzz.nes')}`, '370517b5'],
        [`${path.join('One', 'Foobar.lnx')} -> ${path.join('<input>', 'foobar.lnx')}`, 'b22c9747'],
        [`${path.join('One', 'Lorem Ipsum.rom')} -> ${path.join('<input>', 'raw', 'loremipsum.rom')}`, '70856527'],
        [`${path.join('One', 'One Three.zip')}|${path.join('1', 'one.rom')} -> ${path.join('<input>', 'zip', 'onetwothree.zip')}|${path.join('1', 'one.rom')}`, 'f817a89f'],
        [`${path.join('One', 'One Three.zip')}|${path.join('2', 'two.rom')} -> ${path.join('<input>', 'zip', 'onetwothree.zip')}|${path.join('2', 'two.rom')}`, '96170874'],
        [`${path.join('One', 'One Three.zip')}|${path.join('3', 'three.rom')} -> ${path.join('<input>', 'zip', 'onetwothree.zip')}|${path.join('3', 'three.rom')}`, 'ff46c5d8'],
        [`${path.join('One', 'Three Four Five', 'Five.rom')} -> ${path.join('<input>', 'raw', 'five.rom')}`, '3e5daf67'],
        [`${path.join('One', 'Three Four Five', 'Four.rom')} -> ${path.join('<input>', 'raw', 'four.rom')}`, '1cf3ca74'],
        [`${path.join('One', 'Three Four Five', 'Three.rom')} -> ${path.join('<input>', 'raw', 'three.rom')}`, 'ff46c5d8'],
        [`${path.join('Patchable', '0F09A40.rom')} -> ${path.join('<input>', 'patchable', '0F09A40.rom')}`, '2f943e86'],
        [`${path.join('Patchable', '3708F2C.rom')} -> ${path.join('<input>', 'patchable', '3708F2C.rom')}`, '20891c9f'],
        [`${path.join('Patchable', '612644F.rom')} -> ${path.join('<input>', 'patchable', '612644F.rom')}`, 'f7591b29'],
        [`${path.join('Patchable', '65D1206.rom')} -> ${path.join('<input>', 'patchable', '65D1206.rom')}`, '20323455'],
        [`${path.join('Patchable', '92C85C9.rom')} -> ${path.join('<input>', 'patchable', '92C85C9.rom')}`, '06692159'],
        [`${path.join('Patchable', 'Before.rom')} -> ${path.join('<input>', 'patchable', 'before.rom')}`, '0361b321'],
        [`${path.join('Patchable', 'Best.gz|best.rom')} -> ${path.join('<input>', 'patchable', 'best.gz')}|best.rom`, '1e3d78cf'],
        [`${path.join('Patchable', 'C01173E.rom')} -> ${path.join('<input>', 'patchable', 'C01173E.rom')}`, 'dfaebe28'],
        [`${path.join('Patchable', 'KDULVQN.rom')} -> ${path.join('<input>', 'patchable', 'KDULVQN.rom')}`, 'b1c303e4'],
        [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.nes')} -> ${path.join('<input>', 'raw', 'fizzbuzz.nes')}`, '370517b5'],
        [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.lnx')} -> ${path.join('<input>', 'foobar.lnx')}`, 'b22c9747'],
        [`${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.rom')} -> ${path.join('<input>', 'raw', 'loremipsum.rom')}`, '70856527'],
        [`${path.join('smdb', 'Hardware Target Game Database', 'Patchable', '3708F2C.rom')} -> ${path.join('<input>', 'patchable', '3708F2C.rom')}`, '20891c9f'],
        [`${path.join('smdb', 'Hardware Target Game Database', 'Patchable', '65D1206.rom')} -> ${path.join('<input>', 'patchable', '65D1206.rom')}`, '20323455'],
        [`${path.join('smdb', 'Hardware Target Game Database', 'Patchable', 'C01173E.rom')} -> ${path.join('<input>', 'patchable', 'C01173E.rom')}`, 'dfaebe28'],
      ]);
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy, extract, patch, remove headers, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy', 'extract', 'test'],
        dat: [path.join(inputTemp, 'dats')],
        input: [path.join(inputTemp, 'roms')],
        patch: [path.join(inputTemp, 'patches')],
        output: outputTemp,
        dirDatName: true,
        removeHeaders: [''], // all
      });

      expect(result.outputFilesAndCrcs).toEqual([
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
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should report without writing', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['report'],
        dat: [path.join(inputTemp, 'dats')],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
        reportOutput: 'report.csv',
      });

      expect(result.cwdFilesAndCrcs).toHaveLength(1);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  test.each([
    'copy',
    'move',
    'symlink',
  ])('should generate a fixdat when writing: %s', async (command) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: [command],
        dat: [path.join(inputTemp, 'dats')],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
        fixdat: true,
        dirDatName: true,
      });

      const writtenFixdats = result.outputFilesAndCrcs
        .map(([filePath]) => filePath)
        .filter((filePath) => filePath.endsWith('.dat'));

      // Only the "One" DAT should have missing ROMs (Missing.rom)
      expect(writtenFixdats).toHaveLength(1);
      expect(writtenFixdats[0]).toMatch(/^One[\\/]One fixdat \([0-9]{8}-[0-9]{6}\)\.dat$/);

      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should generate a fixdat when not writing', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['report'],
        dat: [path.join(inputTemp, 'dats')],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
        fixdat: true,
        dirDatName: true,
        reportOutput: 'report.csv',
      });

      const writtenFixdats = result.cwdFilesAndCrcs
        .map(([filePath]) => filePath)
        .filter((filePath) => filePath.endsWith('.dat'));

      // Only the "One" DAT should have missing ROMs (Missing.rom)
      expect(writtenFixdats).toHaveLength(1);
      expect(writtenFixdats[0]).toMatch(/^One fixdat \([0-9]{8}-[0-9]{6}\)\.dat$/);

      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });
});

describe('with inferred DATs', () => {
  it('should do nothing with no roms', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy'],
        input: [],
        output: outputTemp,
      });

      expect(result.outputFilesAndCrcs).toHaveLength(0);
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy', 'test'],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
      });

      expect(result.outputFilesAndCrcs).toEqual([
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
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should move to the same directory', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const inputDir = path.join(inputTemp, 'roms', 'raw');
      const inputBefore = await walkWithCrc(inputDir, inputDir);

      await runIgir({
        commands: ['move', 'test'],
        input: [inputDir],
        output: inputDir,
      });

      await expect(walkWithCrc(inputDir, inputDir)).resolves.toEqual(inputBefore);
      await expect(walkWithCrc(inputTemp, outputTemp)).resolves.toHaveLength(0);
    });
  });

  it('should move, extract, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['move', 'extract', 'test'],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
      });

      expect(result.outputFilesAndCrcs).toEqual([
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
      ]);
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toEqual([
        path.join('empty.rom'),
        path.join('foobar.lnx'),
        path.join('headered', 'LCDTestROM.lnx.rar'),
        path.join('headered', 'allpads.nes'),
        path.join('headered', 'color_test.nintendoentertainmentsystem'),
        path.join('headered', 'diagnostic_test_cartridge.a78.7z'),
        path.join('headered', 'fds_joypad_test.fds.zip'),
        path.join('headered', 'speed_test_v51.smc'),
        path.join('patchable', '0F09A40.rom'),
        path.join('patchable', '3708F2C.rom'),
        path.join('patchable', '612644F.rom'),
        path.join('patchable', '65D1206.rom'),
        path.join('patchable', '92C85C9.rom'),
        path.join('patchable', 'C01173E.rom'),
        path.join('patchable', 'KDULVQN.rom'),
        path.join('patchable', 'before.rom'),
        path.join('patchable', 'best.gz'),
        path.join('raw', 'five.rom'),
        path.join('raw', 'fizzbuzz.nes'),
        path.join('raw', 'four.rom'),
        path.join('raw', 'loremipsum.rom'),
        path.join('raw', 'one.rom'),
        path.join('raw', 'three.rom'),
        path.join('raw', 'two.rom'),
        path.join('raw', 'unknown.rom'),
        path.join('unheadered', 'speed_test_v51.sfc.gz'),
        path.join('zip', 'fourfive.zip'),
        path.join('zip', 'onetwothree.zip'),
      ]);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy, zip, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy', 'zip', 'test'],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
      });

      expect(result.outputFilesAndCrcs).toEqual([
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
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should relative symlink, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['symlink', 'test'],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
        symlinkRelative: true,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [`0F09A40.rom -> ${path.join('..', 'input', 'roms', 'patchable', '0F09A40.rom')}`, '2f943e86'],
        [`3708F2C.rom -> ${path.join('..', 'input', 'roms', 'patchable', '3708F2C.rom')}`, '20891c9f'],
        [`612644F.rom -> ${path.join('..', 'input', 'roms', 'patchable', '612644F.rom')}`, 'f7591b29'],
        [`65D1206.rom -> ${path.join('..', 'input', 'roms', 'patchable', '65D1206.rom')}`, '20323455'],
        [`92C85C9.rom -> ${path.join('..', 'input', 'roms', 'patchable', '92C85C9.rom')}`, '06692159'],
        [`allpads.nes -> ${path.join('..', 'input', 'roms', 'headered', 'allpads.nes')}`, '9180a163'],
        [`before.rom -> ${path.join('..', 'input', 'roms', 'patchable', 'before.rom')}`, '0361b321'],
        [`best.gz|best.rom -> ${path.join('..', 'input', 'roms', 'patchable', 'best.gz')}|best.rom`, '1e3d78cf'],
        [`C01173E.rom -> ${path.join('..', 'input', 'roms', 'patchable', 'C01173E.rom')}`, 'dfaebe28'],
        [`color_test.nintendoentertainmentsystem -> ${path.join('..', 'input', 'roms', 'headered', 'color_test.nintendoentertainmentsystem')}`, 'c9c1b7aa'],
        [`diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78 -> ${path.join('..', 'input', 'roms', 'headered', 'diagnostic_test_cartridge.a78.7z')}|diagnostic_test_cartridge.a78`, 'f6cc9b1c'],
        [`empty.rom -> ${path.join('..', 'input', 'roms', 'empty.rom')}`, '00000000'],
        [`fds_joypad_test.fds.zip|fds_joypad_test.fds -> ${path.join('..', 'input', 'roms', 'headered', 'fds_joypad_test.fds.zip')}|fds_joypad_test.fds`, '1e58456d'],
        [`five.rom -> ${path.join('..', 'input', 'roms', 'raw', 'five.rom')}`, '3e5daf67'],
        [`fizzbuzz.nes -> ${path.join('..', 'input', 'roms', 'raw', 'fizzbuzz.nes')}`, '370517b5'],
        [`foobar.lnx -> ${path.join('..', 'input', 'roms', 'foobar.lnx')}`, 'b22c9747'],
        [`four.rom -> ${path.join('..', 'input', 'roms', 'raw', 'four.rom')}`, '1cf3ca74'],
        [`fourfive.zip|five.rom -> ${path.join('..', 'input', 'roms', 'zip', 'fourfive.zip')}|five.rom`, '3e5daf67'],
        [`fourfive.zip|four.rom -> ${path.join('..', 'input', 'roms', 'zip', 'fourfive.zip')}|four.rom`, '1cf3ca74'],
        [`KDULVQN.rom -> ${path.join('..', 'input', 'roms', 'patchable', 'KDULVQN.rom')}`, 'b1c303e4'],
        [`LCDTestROM.lnx.rar|LCDTestROM.lnx -> ${path.join('..', 'input', 'roms', 'headered', 'LCDTestROM.lnx.rar')}|LCDTestROM.lnx`, '2d251538'],
        [`loremipsum.rom -> ${path.join('..', 'input', 'roms', 'raw', 'loremipsum.rom')}`, '70856527'],
        [`one.rom -> ${path.join('..', 'input', 'roms', 'raw', 'one.rom')}`, 'f817a89f'],
        [`onetwothree.zip|${path.join('1', 'one.rom')} -> ${path.join('..', 'input', 'roms', 'zip', 'onetwothree.zip')}|${path.join('1', 'one.rom')}`, 'f817a89f'],
        [`onetwothree.zip|${path.join('2', 'two.rom')} -> ${path.join('..', 'input', 'roms', 'zip', 'onetwothree.zip')}|${path.join('2', 'two.rom')}`, '96170874'],
        [`onetwothree.zip|${path.join('3', 'three.rom')} -> ${path.join('..', 'input', 'roms', 'zip', 'onetwothree.zip')}|${path.join('3', 'three.rom')}`, 'ff46c5d8'],
        [`speed_test_v51.sfc.gz|speed_test_v51.sfc -> ${path.join('..', 'input', 'roms', 'unheadered', 'speed_test_v51.sfc.gz')}|speed_test_v51.sfc`, '8beffd94'],
        [`speed_test_v51.smc -> ${path.join('..', 'input', 'roms', 'headered', 'speed_test_v51.smc')}`, '9adca6cc'],
        [`three.rom -> ${path.join('..', 'input', 'roms', 'raw', 'three.rom')}`, 'ff46c5d8'],
        [`two.rom -> ${path.join('..', 'input', 'roms', 'raw', 'two.rom')}`, '96170874'],
        [`unknown.rom -> ${path.join('..', 'input', 'roms', 'raw', 'unknown.rom')}`, '377a7727'],
      ]);
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy, extract, remove headers, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy', 'extract', 'test'],
        input: [path.join(inputTemp, 'roms', 'headered')],
        output: outputTemp,
        removeHeaders: [''], // all
      });

      expect(result.outputFilesAndCrcs).toEqual([
        ['allpads.nes', '6339abe6'],
        ['color_test.nintendoentertainmentsystem', 'c9c1b7aa'], // no header
        ['diagnostic_test_cartridge.a78', 'a1eaa7c1'],
        ['fds_joypad_test.fds', '3ecbac61'],
        ['LCDTestROM.lyx', '42583855'],
        ['speed_test_v51.sfc', '8beffd94'],
      ]);
      expect(result.cwdFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });
});
