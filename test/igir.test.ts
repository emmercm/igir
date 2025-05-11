import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import Logger from '../src/console/logger.js';
import { LogLevel } from '../src/console/logLevel.js';
import Temp from '../src/globals/temp.js';
import Igir from '../src/igir.js';
import DATScanner from '../src/modules/dats/datScanner.js';
import ArrayPoly from '../src/polyfill/arrayPoly.js';
import FsPoly from '../src/polyfill/fsPoly.js';
import FileCache from '../src/types/files/fileCache.js';
import { ChecksumBitmask, ChecksumBitmaskInverted } from '../src/types/files/fileChecksums.js';
import FileFactory from '../src/types/files/fileFactory.js';
import Options, {
  FixExtension,
  FixExtensionInverted,
  GameSubdirMode,
  GameSubdirModeInverted,
  InputChecksumArchivesMode,
  InputChecksumArchivesModeInverted,
  OptionsProps,
} from '../src/types/options.js';
import ProgressBarFake from './console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new PassThrough());

interface TestOutput {
  outputFilesAndCrcs: string[][];
  movedFiles: string[];
  cleanedFiles: string[];
}

async function copyFixturesToTemp(
  callback: (input: string, output: string) => void | Promise<void>,
): Promise<void> {
  const temp = await FsPoly.mkdtemp(Temp.getTempDir());

  // Set up the input directory
  const inputTemp = path.join(temp, 'input');
  await FsPoly.copyDir(path.join('test', 'fixtures'), inputTemp);

  // Set up the output directory
  const outputTemp = path.join(temp, 'output');

  try {
    // Call the callback
    await callback(inputTemp, outputTemp);
  } finally {
    // Delete the temp files
    await FsPoly.rm(inputTemp, { recursive: true });
    await FsPoly.rm(outputTemp, { force: true, recursive: true });
  }
}

async function walkWithCrc(inputDir: string, outputDir: string): Promise<string[][]> {
  const fileFactory = new FileFactory(new FileCache(), LOGGER);
  return (
    await Promise.all(
      (await FsPoly.walk(outputDir)).map(async (filePath) => {
        try {
          return await fileFactory.filesFrom(filePath);
        } catch {
          return [];
        }
      }),
    )
  )
    .flat()
    .map((file) => [
      file
        .toString()
        .replace(inputDir, '<input>')
        .replace(outputDir + path.sep, ''),
      file.getCrc32() ?? '',
    ])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

async function runIgir(optionsProps: OptionsProps): Promise<TestOutput> {
  const options = new Options(optionsProps);

  const inputFilesBefore = (
    await Promise.all(options.getInputPaths().map(async (inputPath) => FsPoly.walk(inputPath)))
  )
    .flat()
    .reduce(ArrayPoly.reduceUnique(), []);
  const outputFilesBefore =
    options.getOutput() === Temp.getTempDir() ? [] : await FsPoly.walk(options.getOutputDirRoot()); // the output dir is a parent of the input dir, ignore all output

  await new Igir(options, LOGGER).main();

  const outputFilesAndCrcs =
    options.getOutput() === Temp.getTempDir()
      ? // The output dir defaulted to the temp dir because we aren't writing ROMs, ignore all output
        []
      : (
          await Promise.all(
            options
              .getInputPaths()
              .map(async (inputPath) => walkWithCrc(inputPath, options.getOutputDirRoot())),
          )
        )
          .flat()
          .filter((tuple, idx, tuples) => tuples.findIndex((dupe) => dupe[0] === tuple[0]) === idx)
          .sort((a, b) => a[0].localeCompare(b[0]));

  const inputFilesAfter = (
    await Promise.all(options.getInputPaths().map(async (inputPath) => FsPoly.walk(inputPath)))
  )
    .flat()
    .reduce(ArrayPoly.reduceUnique(), []);
  const movedFiles = inputFilesBefore
    .filter((filePath) => !inputFilesAfter.includes(filePath))
    .map((filePath) => {
      let replaced = filePath;
      options.getInputPaths().forEach((inputPath) => {
        replaced = replaced.replace(inputPath + path.sep, '');
      });
      return replaced;
    })
    .sort();

  const outputFilesAfter =
    options.getOutput() === Temp.getTempDir() ? [] : await FsPoly.walk(options.getOutputDirRoot()); // the output dir is a parent of the input dir, ignore all output
  const cleanedFiles = outputFilesBefore
    .filter((filePath) => !outputFilesAfter.includes(filePath))
    .map((filePath) => filePath.replace(options.getOutputDirRoot() + path.sep, ''))
    .sort();

  return {
    outputFilesAndCrcs,
    movedFiles,
    cleanedFiles,
  };
}

describe('with explicit DATs', () => {
  it('should throw on all invalid dats', async () => {
    await expect(async () =>
      new Igir(
        new Options({
          dat: ['src/*'],
        }),
        LOGGER,
      ).main(),
    ).rejects.toThrow(/no valid dat files/i);
  });

  it('should copy, playlist, and test without caching', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy', 'playlist', 'test'],
        dat: [path.join(inputTemp, 'dats', '*')],
        input: [path.join(inputTemp, 'roms')],
        inputExclude: [path.join(inputTemp, 'roms', 'discs')], // test archive scanning + matching
        inputChecksumArchives:
          InputChecksumArchivesModeInverted[InputChecksumArchivesMode.NEVER].toLowerCase(),
        output: outputTemp,
        dirDatName: true,
        dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
        playlistExtensions: ['.cue', '.gdi', '.mdf', '.chd'],
        disableCache: true,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [path.join('Headered', 'allpads.nes'), '9180a163'],
        [path.join('Headered', 'color_test.nes'), 'c9c1b7aa'],
        [
          `${path.join('Headered', 'diagnostic_test_cartridge.a78.7z')}|diagnostic_test_cartridge.a78`,
          'f6cc9b1c',
        ],
        [`${path.join('Headered', 'fds_joypad_test.fds.zip')}|fds_joypad_test.fds`, '1e58456d'],
        [`${path.join('Headered', 'LCDTestROM.lnx.rar')}|LCDTestROM.lnx`, '2d251538'],
        [path.join('Headered', 'speed_test_v51.smc'), '9adca6cc'],
        [path.join('Headerless', 'allpads.nes'), '6339abe6'],
        [path.join('Headerless', 'color_test.nes'), 'c9c1b7aa'],
        [`${path.join('Headerless', 'speed_test_v51.sfc.gz')}|speed_test_v51.sfc`, '8beffd94'],
        [path.join('One', 'Fizzbuzz.nes'), '370517b5'],
        [path.join('One', 'Foobar.lnx'), 'b22c9747'],
        [
          `${path.join('One', 'GameCube-240pSuite-1.19.gcz')}|GameCube-240pSuite-1.19.iso`,
          '5eb3d183',
        ],
        [path.join('One', 'One Three', 'One.rom'), 'f817a89f'],
        [path.join('One', 'One Three', 'Three.rom'), 'ff46c5d8'],
        [
          `${path.join('One', 'Optical Game (Disc 1).chd')}|Optical Game (Disc 1) (Track 1).bin`,
          '49ca35fb',
        ],
        [
          `${path.join('One', 'Optical Game (Disc 1).chd')}|Optical Game (Disc 1) (Track 2).bin`,
          '0316f720',
        ],
        [
          `${path.join('One', 'Optical Game (Disc 1).chd')}|Optical Game (Disc 1) (Track 3).bin`,
          'a320af40',
        ],
        [`${path.join('One', 'Optical Game (Disc 1).chd')}|Optical Game (Disc 1).cue`, 'xxxxxxxx'],
        [`${path.join('One', 'Optical Game (Disc 2).chd')}|Optical Game (Disc 2).gdi`, 'f16f621c'],
        [`${path.join('One', 'Optical Game (Disc 2).chd')}|track01.bin`, '9796ed9a'],
        [`${path.join('One', 'Optical Game (Disc 2).chd')}|track02.raw`, 'abc178d5'],
        [`${path.join('One', 'Optical Game (Disc 2).chd')}|track03.bin`, '61a363f1'],
        [`${path.join('One', 'Optical Game (Disc 2).chd')}|track04.bin`, 'fc5ff5a0'],
        [path.join('One', 'Optical Game.m3u'), '8da7b4ae'],
        [`${path.join('One', 'Three Four Five', '2048')}|`, 'xxxxxxxx'], // hard disk
        [`${path.join('One', 'Three Four Five', '4096')}|`, 'xxxxxxxx'], // hard disk
        [path.join('One', 'Three Four Five', 'Five.rom'), '3e5daf67'],
        [path.join('One', 'Three Four Five', 'Four.rom'), '1cf3ca74'],
        [path.join('One', 'Three Four Five', 'Three.rom'), 'ff46c5d8'],
        [`${path.join('One', 'UMD.cso')}|UMD.iso`, 'e90f7cf5'],
        [path.join('Patchable', '0F09A40.rom'), '2f943e86'],
        [path.join('Patchable', '3708F2C.rom'), '20891c9f'],
        [path.join('Patchable', '612644F.rom'), 'f7591b29'],
        [path.join('Patchable', '65D1206.rom'), '20323455'],
        [path.join('Patchable', '92C85C9.rom'), '06692159'],
        [path.join('Patchable', 'Before.rom'), '0361b321'],
        [path.join('Patchable', 'C01173E.rom'), 'dfaebe28'],
        [path.join('Patchable', 'KDULVQN.rom'), 'b1c303e4'],
        [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.nes'), '370517b5'],
        [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.lnx'), 'b22c9747'],
        [
          path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.rom'),
          '70856527',
        ],
        [
          path.join('smdb', 'Hardware Target Game Database', 'Patchable', '3708F2C.rom'),
          '20891c9f',
        ],
        [
          path.join('smdb', 'Hardware Target Game Database', 'Patchable', '65D1206.rom'),
          '20323455',
        ],
        [
          path.join('smdb', 'Hardware Target Game Database', 'Patchable', 'C01173E.rom'),
          'dfaebe28',
        ],
      ]);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy a 1G1R set, with a custom cache path', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy'],
        dat: [path.join(inputTemp, 'dats', 'one.dat')],
        input: [path.join(inputTemp, 'roms')],
        inputChecksumArchives:
          InputChecksumArchivesModeInverted[InputChecksumArchivesMode.ALWAYS].toLowerCase(),
        output: outputTemp,
        dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
        single: true,
        preferParent: true,
        cachePath: inputTemp,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        // Fizzbuzz.nes is explicitly missing!
        ['Foobar.lnx', 'b22c9747'],
        ['GameCube-240pSuite-1.19.gcz|GameCube-240pSuite-1.19.iso', '5eb3d183'],
        ['Lorem Ipsum.zip|loremipsum.rom', '70856527'],
        [path.join('One Three', 'One.rom'), 'f817a89f'],
        [path.join('One Three', 'Three.rom'), 'ff46c5d8'],
        ['Optical Game (Disc 1).chd|Optical Game (Disc 1) (Track 1).bin', '49ca35fb'],
        ['Optical Game (Disc 1).chd|Optical Game (Disc 1) (Track 2).bin', '0316f720'],
        ['Optical Game (Disc 1).chd|Optical Game (Disc 1) (Track 3).bin', 'a320af40'],
        ['Optical Game (Disc 1).chd|Optical Game (Disc 1).cue', 'xxxxxxxx'],
        ['Optical Game (Disc 2).chd|Optical Game (Disc 2).gdi', 'f16f621c'],
        ['Optical Game (Disc 2).chd|track01.bin', '9796ed9a'],
        ['Optical Game (Disc 2).chd|track02.raw', 'abc178d5'],
        ['Optical Game (Disc 2).chd|track03.bin', '61a363f1'],
        ['Optical Game (Disc 2).chd|track04.bin', 'fc5ff5a0'],
        [`${path.join('Three Four Five', '2048')}|`, 'xxxxxxxx'], // hard disk
        [`${path.join('Three Four Five', '4096')}|`, 'xxxxxxxx'], // hard disk
        [path.join('Three Four Five', 'Five.rom'), '3e5daf67'],
        [path.join('Three Four Five', 'Four.rom'), '1cf3ca74'],
        [path.join('Three Four Five', 'Three.rom'), 'ff46c5d8'],
        ['UMD.cso|UMD.iso', 'e90f7cf5'],
      ]);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy, playlist, and clean read-only files', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given some existing files in the output directory
      const junkFiles = [
        path.join(outputTemp, 'one.rom'),
        path.join(outputTemp, 'rom', 'two.rom'),
        path.join(outputTemp, 'zip', 'three.zip'),
        path.join(outputTemp, 'wud', 'four.wud'),
      ];
      await Promise.all(
        junkFiles.map(async (junkFile) => {
          await FsPoly.touch(junkFile);
          expect(await FsPoly.exists(junkFile)).toEqual(true);
        }),
      );

      const inputFiles = await FsPoly.walk(inputTemp);
      await Promise.all(inputFiles.map(async (inputFile) => fs.promises.chmod(inputFile, '0444')));

      // When running igir with the clean command
      const result = await runIgir({
        commands: ['copy', 'playlist', 'clean'],
        dat: [path.join(inputTemp, 'dats', '*')],
        input: [path.join(inputTemp, 'roms')],
        output: path.join(outputTemp, '{outputExt}'),
        dirDatName: true,
        dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
        playlistExtensions: ['.cue', '.gdi', '.mdf', '.chd'],
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [`${path.join('-', 'One', 'Three Four Five', '2048')}|`, 'xxxxxxxx'], // hard disk
        [`${path.join('-', 'One', 'Three Four Five', '4096')}|`, 'xxxxxxxx'], // hard disk
        [
          `${path.join('7z', 'Headered', 'diagnostic_test_cartridge.a78.7z')}|diagnostic_test_cartridge.a78`,
          'f6cc9b1c',
        ],
        [
          `${path.join('chd', 'One', 'Optical Game (Disc 1).chd')}|Optical Game (Disc 1) (Track 1).bin`,
          '49ca35fb',
        ],
        [
          `${path.join('chd', 'One', 'Optical Game (Disc 1).chd')}|Optical Game (Disc 1) (Track 2).bin`,
          '0316f720',
        ],
        [
          `${path.join('chd', 'One', 'Optical Game (Disc 1).chd')}|Optical Game (Disc 1) (Track 3).bin`,
          'a320af40',
        ],
        [
          `${path.join('chd', 'One', 'Optical Game (Disc 1).chd')}|Optical Game (Disc 1).cue`,
          'xxxxxxxx',
        ],
        [
          `${path.join('chd', 'One', 'Optical Game (Disc 2).chd')}|Optical Game (Disc 2).gdi`,
          'f16f621c',
        ],
        [`${path.join('chd', 'One', 'Optical Game (Disc 2).chd')}|track01.bin`, '9796ed9a'],
        [`${path.join('chd', 'One', 'Optical Game (Disc 2).chd')}|track02.raw`, 'abc178d5'],
        [`${path.join('chd', 'One', 'Optical Game (Disc 2).chd')}|track03.bin`, '61a363f1'],
        [`${path.join('chd', 'One', 'Optical Game (Disc 2).chd')}|track04.bin`, 'fc5ff5a0'],
        [path.join('chd', 'One', 'Optical Game.m3u'), '8da7b4ae'],
        [`${path.join('cso', 'One', 'UMD.cso')}|UMD.iso`, 'e90f7cf5'],
        [
          `${path.join('gcz', 'One', 'GameCube-240pSuite-1.19.gcz')}|GameCube-240pSuite-1.19.iso`,
          '5eb3d183',
        ],
        [
          `${path.join('gz', 'Headerless', 'speed_test_v51.sfc.gz')}|speed_test_v51.sfc`,
          '8beffd94',
        ],
        [path.join('lnx', 'One', 'Foobar.lnx'), 'b22c9747'],
        [
          path.join('lnx', 'smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.lnx'),
          'b22c9747',
        ],
        [path.join('nes', 'Headered', 'allpads.nes'), '9180a163'],
        [path.join('nes', 'Headered', 'color_test.nes'), 'c9c1b7aa'],
        [path.join('nes', 'Headerless', 'allpads.nes'), '6339abe6'],
        [path.join('nes', 'Headerless', 'color_test.nes'), 'c9c1b7aa'],
        [path.join('nes', 'One', 'Fizzbuzz.nes'), '370517b5'],
        [
          path.join('nes', 'smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.nes'),
          '370517b5',
        ],
        ['one.rom', '00000000'], // explicitly not deleted, it is not in an extension subdirectory
        [`${path.join('rar', 'Headered', 'LCDTestROM.lnx.rar')}|LCDTestROM.lnx`, '2d251538'],
        [path.join('rom', 'One', 'One Three', 'One.rom'), 'f817a89f'],
        [path.join('rom', 'One', 'One Three', 'Three.rom'), 'ff46c5d8'],
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
        [
          path.join('rom', 'smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.rom'),
          '70856527',
        ],
        [
          path.join('rom', 'smdb', 'Hardware Target Game Database', 'Patchable', '3708F2C.rom'),
          '20891c9f',
        ],
        [
          path.join('rom', 'smdb', 'Hardware Target Game Database', 'Patchable', '65D1206.rom'),
          '20323455',
        ],
        [
          path.join('rom', 'smdb', 'Hardware Target Game Database', 'Patchable', 'C01173E.rom'),
          'dfaebe28',
        ],
        [path.join('smc', 'Headered', 'speed_test_v51.smc'), '9adca6cc'],
        [path.join('wud', 'four.wud'), '00000000'], // explicitly not deleted, there were no input files with the extension "wud"
        [
          `${path.join('zip', 'Headered', 'fds_joypad_test.fds.zip')}|fds_joypad_test.fds`,
          '1e58456d',
        ],
        [`${path.join('zip', 'One', 'Lorem Ipsum.zip')}|loremipsum.rom`, '70856527'],
      ]);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toEqual([
        path.join('rom', 'two.rom'),
        path.join('zip', 'three.zip'),
      ]);
    });
  });

  it('should copy and extract hard linked files', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given some symlinks
      const inputDir = path.join(inputTemp, 'roms', 'raw');
      const inputFiles = await FsPoly.walk(inputDir);
      const inputHardlinks = await Promise.all(
        inputFiles.map(async (inputFile) => {
          const symlink = `${inputFile}.symlink`;
          await FsPoly.hardlink(inputFile, symlink);
          return symlink;
        }),
      );

      const result = await runIgir({
        commands: ['copy', 'extract'],
        dat: [path.join(inputTemp, 'dats')],
        input: inputHardlinks,
        output: outputTemp,
        dirDatName: true,
        dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
        excludeDisks: true,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [path.join('One', 'Fizzbuzz.nes'), '370517b5'],
        [path.join('One', 'Foobar.lnx'), 'b22c9747'],
        [path.join('One', 'One Three', 'One.rom'), 'f817a89f'],
        [path.join('One', 'One Three', 'Three.rom'), 'ff46c5d8'],
        [path.join('One', 'Three Four Five', 'Five.rom'), '3e5daf67'],
        [path.join('One', 'Three Four Five', 'Four.rom'), '1cf3ca74'],
        [path.join('One', 'Three Four Five', 'Three.rom'), 'ff46c5d8'],
        [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.nes'), '370517b5'],
        [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.lnx'), 'b22c9747'],
        [
          path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.rom'),
          '70856527',
        ],
      ]);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy and extract symlinked files', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      // Given some symlinks
      const inputDir = path.join(inputTemp, 'roms', 'raw');
      const inputFiles = await FsPoly.walk(inputDir);
      const inputSymlinks = await Promise.all(
        inputFiles.map(async (inputFile) => {
          const symlink = `${inputFile}.symlink`;
          await FsPoly.symlink(inputFile, symlink);
          return symlink;
        }),
      );

      const result = await runIgir({
        commands: ['copy', 'extract'],
        dat: [path.join(inputTemp, 'dats')],
        input: inputSymlinks,
        output: outputTemp,
        dirDatName: true,
        dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
        excludeDisks: true,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [path.join('One', 'Fizzbuzz.nes'), '370517b5'],
        [path.join('One', 'Foobar.lnx'), 'b22c9747'],
        [path.join('One', 'One Three', 'One.rom'), 'f817a89f'],
        [path.join('One', 'One Three', 'Three.rom'), 'ff46c5d8'],
        [path.join('One', 'Three Four Five', 'Five.rom'), '3e5daf67'],
        [path.join('One', 'Three Four Five', 'Four.rom'), '1cf3ca74'],
        [path.join('One', 'Three Four Five', 'Three.rom'), 'ff46c5d8'],
        [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.nes'), '370517b5'],
        [path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.lnx'), 'b22c9747'],
        [
          path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.rom'),
          '70856527',
        ],
      ]);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should combine DATs, move, extract, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['move', 'extract', 'test'],
        dat: [path.join(inputTemp, 'dats', '*')],
        datExclude: [path.join(inputTemp, 'dats', 'headerless.*')],
        input: [path.join(inputTemp, 'roms')],
        inputExclude: [path.join(inputTemp, 'roms', 'discs')], // test archive scanning + matching
        output: outputTemp,
        datCombine: true,
        dirDatName: true,
        dirLetter: true,
        dirLetterCount: 1,
        dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [path.join('igir combined', '#', '0F09A40.rom'), '2f943e86'],
        [path.join('igir combined', '#', '3708F2C.rom'), '20891c9f'],
        [path.join('igir combined', '#', '612644F.rom'), 'f7591b29'],
        [path.join('igir combined', '#', '65D1206.rom'), '20323455'],
        [path.join('igir combined', '#', '92C85C9.rom'), '06692159'],
        [path.join('igir combined', 'A', 'allpads.nes'), '9180a163'],
        [path.join('igir combined', 'B', 'Before.rom'), '0361b321'],
        [path.join('igir combined', 'B', 'Best.rom'), '1e3d78cf'],
        [path.join('igir combined', 'C', 'C01173E.rom'), 'dfaebe28'],
        [path.join('igir combined', 'C', 'color_test.nes'), 'c9c1b7aa'],
        [path.join('igir combined', 'D', 'diagnostic_test_cartridge.a78'), 'f6cc9b1c'],
        [path.join('igir combined', 'F', 'fds_joypad_test.fds'), '1e58456d'],
        [path.join('igir combined', 'F', 'Fizzbuzz.nes'), '370517b5'],
        [path.join('igir combined', 'F', 'Foobar.lnx'), 'b22c9747'],
        [path.join('igir combined', 'G', 'GameCube-240pSuite-1.19.iso'), '5eb3d183'],
        [
          path.join('igir combined', 'H', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.nes'),
          '370517b5',
        ],
        [
          path.join('igir combined', 'H', 'Hardware Target Game Database', 'Dummy', 'Foobar.lnx'),
          'b22c9747',
        ],
        [
          path.join(
            'igir combined',
            'H',
            'Hardware Target Game Database',
            'Dummy',
            'Lorem Ipsum.rom',
          ),
          '70856527',
        ],
        [
          path.join(
            'igir combined',
            'H',
            'Hardware Target Game Database',
            'Patchable',
            '3708F2C.rom',
          ),
          '20891c9f',
        ],
        [
          path.join(
            'igir combined',
            'H',
            'Hardware Target Game Database',
            'Patchable',
            '65D1206.rom',
          ),
          '20323455',
        ],
        [
          path.join(
            'igir combined',
            'H',
            'Hardware Target Game Database',
            'Patchable',
            'C01173E.rom',
          ),
          'dfaebe28',
        ],
        [path.join('igir combined', 'K', 'KDULVQN.rom'), 'b1c303e4'],
        [path.join('igir combined', 'L', 'LCDTestROM.lnx'), '2d251538'],
        [`${path.join('igir combined', 'L', 'Lorem Ipsum.zip')}|loremipsum.rom`, '70856527'],
        [path.join('igir combined', 'O', 'One Three', 'One.rom'), 'f817a89f'],
        [path.join('igir combined', 'O', 'One Three', 'Three.rom'), 'ff46c5d8'],
        [
          path.join('igir combined', 'O', 'Optical Game (Disc 2)', 'Optical Game (Disc 2).gdi'),
          'f16f621c',
        ],
        [path.join('igir combined', 'O', 'Optical Game (Disc 2)', 'track01.bin'), '9796ed9a'],
        [path.join('igir combined', 'O', 'Optical Game (Disc 2)', 'track02.raw'), 'abc178d5'],
        [path.join('igir combined', 'O', 'Optical Game (Disc 2)', 'track03.bin'), '61a363f1'],
        [path.join('igir combined', 'O', 'Optical Game (Disc 2)', 'track04.bin'), 'fc5ff5a0'],
        [path.join('igir combined', 'S', 'speed_test_v51.smc'), '9adca6cc'],
        [`${path.join('igir combined', 'T', 'Three Four Five', '2048')}|`, 'xxxxxxxx'], // hard disk
        [`${path.join('igir combined', 'T', 'Three Four Five', '4096')}|`, 'xxxxxxxx'], // hard disk
        [path.join('igir combined', 'T', 'Three Four Five', 'Five.rom'), '3e5daf67'],
        [path.join('igir combined', 'T', 'Three Four Five', 'Four.rom'), '1cf3ca74'],
        [path.join('igir combined', 'T', 'Three Four Five', 'Three.rom'), 'ff46c5d8'],
        [path.join('igir combined', 'U', 'UMD.iso'), 'e90f7cf5'],
      ]);
      expect(result.movedFiles).toEqual([
        path.join('chd', '2048.chd'),
        path.join('chd', '4096.chd'),
        path.join('chd', 'GD-ROM.chd'),
        path.join('cso', 'UMD.cso'),
        'foobar.lnx',
        path.join('gcz', 'GameCube-240pSuite-1.19.gcz'),
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
        path.join('zip', 'loremipsum.zip'),
      ]);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy archives with bad extensions', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const input = await Promise.all(
        [
          path.join(inputTemp, 'roms', '7z', 'fizzbuzz.7z'),
          path.join(inputTemp, 'roms', 'rar', 'foobar.rar'),
          path.join(inputTemp, 'roms', 'zip', 'loremipsum.zip'),
        ].map(async (inputFile) => {
          const junkFile = inputFile.replace(/((\.[a-zA-Z0-9]+)+)$/, '');
          await FsPoly.mv(inputFile, junkFile);
          return junkFile;
        }),
      );

      const result = await runIgir({
        commands: ['copy'],
        dat: [path.join(inputTemp, 'dats')],
        input,
        output: outputTemp,
        dirDatName: true,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        // NOTE: a number of ROMs are missing here because their archives have incorrect entry paths
        [`${path.join('One', 'Lorem Ipsum.zip')}|loremipsum.rom`, '70856527'],
      ]);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should move zipped files, allowing excess sets', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['move'],
        dat: [path.join(inputTemp, 'dats')],
        input: [path.join(inputTemp, 'roms', 'zip')],
        output: outputTemp,
        dirDatName: true,
        allowExcessSets: true,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        // NOTE: a number of ROMs are missing here because their archives have incorrect entry paths
        [`${path.join('One', 'Lorem Ipsum.zip')}|loremipsum.rom`, '70856527'],
      ]);
      expect(result.movedFiles).toEqual([path.join('loremipsum.zip')]);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy, zip, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy', 'zip', 'test'],
        dat: [path.join(inputTemp, 'dats', '*')],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
        dirDatName: true,
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [`${path.join('Headered', 'allpads.zip')}|allpads.nes`, '9180a163'],
        [`${path.join('Headered', 'color_test.zip')}|color_test.nes`, 'c9c1b7aa'],
        [
          `${path.join('Headered', 'diagnostic_test_cartridge.zip')}|diagnostic_test_cartridge.a78`,
          'f6cc9b1c',
        ],
        [`${path.join('Headered', 'fds_joypad_test.zip')}|fds_joypad_test.fds`, '1e58456d'],
        [`${path.join('Headered', 'LCDTestROM.zip')}|LCDTestROM.lnx`, '2d251538'],
        [`${path.join('Headered', 'speed_test_v51.zip')}|speed_test_v51.smc`, '9adca6cc'],
        [`${path.join('Headerless', 'allpads.zip')}|allpads.nes`, '6339abe6'],
        [`${path.join('Headerless', 'color_test.zip')}|color_test.nes`, 'c9c1b7aa'],
        [
          `${path.join('Headerless', 'diagnostic_test_cartridge.zip')}|diagnostic_test_cartridge.a78`,
          'a1eaa7c1',
        ],
        [`${path.join('Headerless', 'fds_joypad_test.zip')}|fds_joypad_test.fds`, '3ecbac61'],
        [`${path.join('Headerless', 'LCDTestROM.zip')}|LCDTestROM.lyx`, '42583855'],
        [`${path.join('Headerless', 'speed_test_v51.zip')}|speed_test_v51.sfc`, '8beffd94'],
        [`${path.join('One', 'Fizzbuzz.zip')}|Fizzbuzz.nes`, '370517b5'],
        [`${path.join('One', 'Foobar.zip')}|Foobar.lnx`, 'b22c9747'],
        [
          `${path.join('One', 'GameCube-240pSuite-1.19.zip')}|GameCube-240pSuite-1.19.iso`,
          '5eb3d183',
        ],
        [`${path.join('One', 'Lorem Ipsum.zip')}|Lorem Ipsum.zip`, '7ee77289'],
        [`${path.join('One', 'One Three.zip')}|One.rom`, 'f817a89f'],
        [`${path.join('One', 'One Three.zip')}|Three.rom`, 'ff46c5d8'],
        [
          `${path.join('One', 'Optical Game (Disc 1).zip')}|Optical Game (Disc 1) (Track 1).bin`,
          '49ca35fb',
        ],
        [
          `${path.join('One', 'Optical Game (Disc 1).zip')}|Optical Game (Disc 1) (Track 2).bin`,
          '0316f720',
        ],
        [
          `${path.join('One', 'Optical Game (Disc 1).zip')}|Optical Game (Disc 1) (Track 3).bin`,
          'a320af40',
        ],
        [`${path.join('One', 'Optical Game (Disc 1).zip')}|Optical Game (Disc 1).cue`, '4ce39e73'],
        [`${path.join('One', 'Optical Game (Disc 2).zip')}|Optical Game (Disc 2).gdi`, 'f16f621c'],
        [`${path.join('One', 'Optical Game (Disc 2).zip')}|track01.bin`, '9796ed9a'],
        [`${path.join('One', 'Optical Game (Disc 2).zip')}|track02.raw`, 'abc178d5'],
        [`${path.join('One', 'Optical Game (Disc 2).zip')}|track03.bin`, '61a363f1'],
        [`${path.join('One', 'Optical Game (Disc 2).zip')}|track04.bin`, 'fc5ff5a0'],
        [`${path.join('One', 'Three Four Five.zip')}|Five.rom`, '3e5daf67'],
        [`${path.join('One', 'Three Four Five.zip')}|Four.rom`, '1cf3ca74'],
        [`${path.join('One', 'Three Four Five.zip')}|Three.rom`, 'ff46c5d8'],
        [`${path.join('One', 'Three Four Five', '2048')}|`, 'xxxxxxxx'], // hard disk
        [`${path.join('One', 'Three Four Five', '4096')}|`, 'xxxxxxxx'], // hard disk
        [`${path.join('One', 'UMD.zip')}|UMD.iso`, 'e90f7cf5'],
        [`${path.join('Patchable', '0F09A40.zip')}|0F09A40.rom`, '2f943e86'],
        [`${path.join('Patchable', '3708F2C.zip')}|3708F2C.rom`, '20891c9f'],
        [`${path.join('Patchable', '612644F.zip')}|612644F.rom`, 'f7591b29'],
        [`${path.join('Patchable', '65D1206.zip')}|65D1206.rom`, '20323455'],
        [`${path.join('Patchable', '92C85C9.zip')}|92C85C9.rom`, '06692159'],
        [`${path.join('Patchable', 'Before.zip')}|Before.rom`, '0361b321'],
        [`${path.join('Patchable', 'Best.zip')}|Best.rom`, '1e3d78cf'],
        [`${path.join('Patchable', 'C01173E.zip')}|C01173E.rom`, 'dfaebe28'],
        [`${path.join('Patchable', 'KDULVQN.zip')}|KDULVQN.rom`, 'b1c303e4'],
        [
          `${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.zip')}|Fizzbuzz.nes`,
          '370517b5',
        ],
        [
          `${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.zip')}|Foobar.lnx`,
          'b22c9747',
        ],
        [
          `${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.zip')}|Lorem Ipsum.rom`,
          '70856527',
        ],
        [
          `${path.join('smdb', 'Hardware Target Game Database', 'Patchable', '3708F2C.zip')}|3708F2C.rom`,
          '20891c9f',
        ],
        [
          `${path.join('smdb', 'Hardware Target Game Database', 'Patchable', '65D1206.zip')}|65D1206.rom`,
          '20323455',
        ],
        [
          `${path.join('smdb', 'Hardware Target Game Database', 'Patchable', 'C01173E.zip')}|C01173E.rom`,
          'dfaebe28',
        ],
      ]);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy, zip by DAT, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy', 'zip', 'test'],
        dat: [path.join(inputTemp, 'dats', '*')],
        input: [path.join(inputTemp, 'roms')],
        inputExclude: [path.join(inputTemp, 'roms', 'nkit')], // will throw an error, preventing everything
        output: outputTemp,
        zipDatName: true,
        fixExtension: FixExtensionInverted[FixExtension.NEVER].toLowerCase(),
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [
          `${path.join('Hardware Target Game Database', 'Dummy', 'smdb.zip')}|3708F2C.rom`,
          '20891c9f',
        ],
        [
          `${path.join('Hardware Target Game Database', 'Dummy', 'smdb.zip')}|65D1206.rom`,
          '20323455',
        ],
        [
          `${path.join('Hardware Target Game Database', 'Dummy', 'smdb.zip')}|C01173E.rom`,
          'dfaebe28',
        ],
        [
          `${path.join('Hardware Target Game Database', 'Dummy', 'smdb.zip')}|Fizzbuzz.nes`,
          '370517b5',
        ],
        [
          `${path.join('Hardware Target Game Database', 'Dummy', 'smdb.zip')}|Foobar.lnx`,
          'b22c9747',
        ],
        [
          `${path.join('Hardware Target Game Database', 'Dummy', 'smdb.zip')}|Lorem Ipsum.rom`,
          '70856527',
        ],
        ['Headered.zip|allpads.nes', '9180a163'],
        ['Headered.zip|color_test.nes', 'c9c1b7aa'],
        ['Headered.zip|diagnostic_test_cartridge.a78', 'f6cc9b1c'],
        ['Headered.zip|fds_joypad_test.fds', '1e58456d'],
        ['Headered.zip|LCDTestROM.lnx', '2d251538'],
        ['Headered.zip|speed_test_v51.smc', '9adca6cc'],
        ['Headerless.zip|allpads.nes', '6339abe6'],
        ['Headerless.zip|color_test.nes', 'c9c1b7aa'],
        ['Headerless.zip|diagnostic_test_cartridge.a78', 'a1eaa7c1'],
        ['Headerless.zip|fds_joypad_test.fds', '3ecbac61'],
        ['Headerless.zip|LCDTestROM.lyx', '42583855'],
        ['Headerless.zip|speed_test_v51.sfc', '8beffd94'],
        ['One.zip|Fizzbuzz.nes', '370517b5'],
        ['One.zip|Foobar.lnx', 'b22c9747'],
        ['One.zip|GameCube-240pSuite-1.19.iso', '5eb3d183'],
        ['One.zip|Lorem Ipsum.zip', '7ee77289'],
        [`One.zip|${path.join('One Three', 'One.rom')}`, 'f817a89f'],
        [`One.zip|${path.join('One Three', 'Three.rom')}`, 'ff46c5d8'],
        [
          `One.zip|${path.join('Optical Game (Disc 1)', 'Optical Game (Disc 1) (Track 1).bin')}`,
          '49ca35fb',
        ],
        [
          `One.zip|${path.join('Optical Game (Disc 1)', 'Optical Game (Disc 1) (Track 2).bin')}`,
          '0316f720',
        ],
        [
          `One.zip|${path.join('Optical Game (Disc 1)', 'Optical Game (Disc 1) (Track 3).bin')}`,
          'a320af40',
        ],
        [`One.zip|${path.join('Optical Game (Disc 1)', 'Optical Game (Disc 1).cue')}`, '4ce39e73'],
        [`One.zip|${path.join('Optical Game (Disc 2)', 'Optical Game (Disc 2).gdi')}`, 'f16f621c'],
        [`One.zip|${path.join('Optical Game (Disc 2)', 'track01.bin')}`, '9796ed9a'],
        [`One.zip|${path.join('Optical Game (Disc 2)', 'track02.raw')}`, 'abc178d5'],
        [`One.zip|${path.join('Optical Game (Disc 2)', 'track03.bin')}`, '61a363f1'],
        [`One.zip|${path.join('Optical Game (Disc 2)', 'track04.bin')}`, 'fc5ff5a0'],
        [`One.zip|${path.join('Three Four Five', 'Five.rom')}`, '3e5daf67'],
        [`One.zip|${path.join('Three Four Five', 'Four.rom')}`, '1cf3ca74'],
        [`One.zip|${path.join('Three Four Five', 'Three.rom')}`, 'ff46c5d8'],
        ['One.zip|UMD.iso', 'e90f7cf5'],
        ['Patchable.zip|0F09A40.rom', '2f943e86'],
        ['Patchable.zip|3708F2C.rom', '20891c9f'],
        ['Patchable.zip|612644F.rom', 'f7591b29'],
        ['Patchable.zip|65D1206.rom', '20323455'],
        ['Patchable.zip|92C85C9.rom', '06692159'],
        ['Patchable.zip|Before.rom', '0361b321'],
        ['Patchable.zip|Best.rom', '1e3d78cf'],
        ['Patchable.zip|C01173E.rom', 'dfaebe28'],
        ['Patchable.zip|KDULVQN.rom', 'b1c303e4'],
        [`${path.join('Three Four Five', '2048')}|`, 'xxxxxxxx'], // hard disk
        [`${path.join('Three Four Five', '4096')}|`, 'xxxxxxxx'], // hard disk
      ]);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should symlink, playlist, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['link', 'playlist', 'test'],
        dat: [path.join(inputTemp, 'dats', '*')],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
        dirDatName: true,
        dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
        symlink: true,
        playlistExtensions: ['.cue', '.gdi', '.mdf', '.chd'],
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [
          `${path.join('Headered', 'allpads.nes')} -> ${path.join('<input>', 'headered', 'allpads.nes')}`,
          '9180a163',
        ],
        [
          `${path.join('Headered', 'color_test.nes')} -> ${path.join('<input>', 'headered', 'color_test.nintendoentertainmentsystem')}`,
          'c9c1b7aa',
        ],
        [
          `${path.join('Headered', 'diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78')} -> ${path.join('<input>', 'headered', 'diagnostic_test_cartridge.a78.7z')}|diagnostic_test_cartridge.a78`,
          'f6cc9b1c',
        ],
        [
          `${path.join('Headered', 'fds_joypad_test.fds.zip')}|fds_joypad_test.fds -> ${path.join('<input>', 'headered', 'fds_joypad_test.fds.zip')}|fds_joypad_test.fds`,
          '1e58456d',
        ],
        [
          `${path.join('Headered', 'LCDTestROM.lnx.rar')}|LCDTestROM.lnx -> ${path.join('<input>', 'headered', 'LCDTestROM.lnx.rar')}|LCDTestROM.lnx`,
          '2d251538',
        ],
        [
          `${path.join('Headered', 'speed_test_v51.smc')} -> ${path.join('<input>', 'headered', 'speed_test_v51.smc')}`,
          '9adca6cc',
        ],
        [
          `${path.join('Headerless', 'color_test.nes')} -> ${path.join('<input>', 'headered', 'color_test.nintendoentertainmentsystem')}`,
          'c9c1b7aa',
        ],
        [
          `${path.join('Headerless', 'speed_test_v51.sfc.gz')}|speed_test_v51.sfc -> ${path.join('<input>', 'headerless', 'speed_test_v51.sfc.gz')}|speed_test_v51.sfc`,
          '8beffd94',
        ],
        [
          `${path.join('One', 'Fizzbuzz.nes')} -> ${path.join('<input>', 'raw', 'fizzbuzz.nes')}`,
          '370517b5',
        ],
        [`${path.join('One', 'Foobar.lnx')} -> ${path.join('<input>', 'foobar.lnx')}`, 'b22c9747'],
        [
          `${path.join('One', 'GameCube-240pSuite-1.19.gcz')}|GameCube-240pSuite-1.19.iso -> ${path.join('<input>', 'gcz', 'GameCube-240pSuite-1.19.gcz')}|GameCube-240pSuite-1.19.iso`,
          '5eb3d183',
        ],
        [
          `${path.join('One', 'Lorem Ipsum.zip')}|loremipsum.rom -> ${path.join('<input>', 'zip', 'loremipsum.zip')}|loremipsum.rom`,
          '70856527',
        ],
        [
          `${path.join('One', 'One Three', 'One.rom')} -> ${path.join('<input>', 'raw', 'one.rom')}`,
          'f817a89f',
        ],
        [
          `${path.join('One', 'One Three', 'Three.rom')} -> ${path.join('<input>', 'raw', 'three.rom')}`,
          'ff46c5d8',
        ],
        [
          `${path.join('One', 'Optical Game (Disc 1).chd')}|Optical Game (Disc 1) (Track 1).bin -> ${path.join('<input>', 'chd', 'CD-ROM.chd')}|Optical Game (Disc 1) (Track 1).bin`,
          '49ca35fb',
        ],
        [
          `${path.join('One', 'Optical Game (Disc 1).chd')}|Optical Game (Disc 1) (Track 2).bin -> ${path.join('<input>', 'chd', 'CD-ROM.chd')}|Optical Game (Disc 1) (Track 2).bin`,
          '0316f720',
        ],
        [
          `${path.join('One', 'Optical Game (Disc 1).chd')}|Optical Game (Disc 1) (Track 3).bin -> ${path.join('<input>', 'chd', 'CD-ROM.chd')}|Optical Game (Disc 1) (Track 3).bin`,
          'a320af40',
        ],
        [
          `${path.join('One', 'Optical Game (Disc 1).chd')}|Optical Game (Disc 1).cue -> ${path.join('<input>', 'chd', 'CD-ROM.chd')}|Optical Game (Disc 1).cue`,
          'xxxxxxxx',
        ],
        [
          `${path.join('One', 'Optical Game (Disc 2).chd')}|Optical Game (Disc 2).gdi -> ${path.join('<input>', 'chd', 'GD-ROM.chd')}|Optical Game (Disc 2).gdi`,
          'f16f621c',
        ],
        [
          `${path.join('One', 'Optical Game (Disc 2).chd')}|track01.bin -> ${path.join('<input>', 'chd', 'GD-ROM.chd')}|track01.bin`,
          '9796ed9a',
        ],
        [
          `${path.join('One', 'Optical Game (Disc 2).chd')}|track02.raw -> ${path.join('<input>', 'chd', 'GD-ROM.chd')}|track02.raw`,
          'abc178d5',
        ],
        [
          `${path.join('One', 'Optical Game (Disc 2).chd')}|track03.bin -> ${path.join('<input>', 'chd', 'GD-ROM.chd')}|track03.bin`,
          '61a363f1',
        ],
        [
          `${path.join('One', 'Optical Game (Disc 2).chd')}|track04.bin -> ${path.join('<input>', 'chd', 'GD-ROM.chd')}|track04.bin`,
          'fc5ff5a0',
        ],
        [path.join('One', 'Optical Game.m3u'), '8da7b4ae'],
        [
          `${path.join('One', 'Three Four Five', '2048')}| -> ${path.join('<input>', 'chd', '2048.chd')}|`,
          'xxxxxxxx',
        ], // hard disk
        [
          `${path.join('One', 'Three Four Five', '4096')}| -> ${path.join('<input>', 'chd', '4096.chd')}|`,
          'xxxxxxxx',
        ], // hard disk
        [
          `${path.join('One', 'Three Four Five', 'Five.rom')} -> ${path.join('<input>', 'raw', 'five.rom')}`,
          '3e5daf67',
        ],
        [
          `${path.join('One', 'Three Four Five', 'Four.rom')} -> ${path.join('<input>', 'raw', 'four.rom')}`,
          '1cf3ca74',
        ],
        [
          `${path.join('One', 'Three Four Five', 'Three.rom')} -> ${path.join('<input>', 'raw', 'three.rom')}`,
          'ff46c5d8',
        ],
        [
          `${path.join('One', 'UMD.cso')}|UMD.iso -> ${path.join('<input>', 'cso', 'UMD.cso')}|UMD.iso`,
          'e90f7cf5',
        ],
        [
          `${path.join('Patchable', '0F09A40.rom')} -> ${path.join('<input>', 'patchable', '0F09A40.rom')}`,
          '2f943e86',
        ],
        [
          `${path.join('Patchable', '3708F2C.rom')} -> ${path.join('<input>', 'patchable', '3708F2C.rom')}`,
          '20891c9f',
        ],
        [
          `${path.join('Patchable', '612644F.rom')} -> ${path.join('<input>', 'patchable', '612644F.rom')}`,
          'f7591b29',
        ],
        [
          `${path.join('Patchable', '65D1206.rom')} -> ${path.join('<input>', 'patchable', '65D1206.rom')}`,
          '20323455',
        ],
        [
          `${path.join('Patchable', '92C85C9.rom')} -> ${path.join('<input>', 'patchable', '92C85C9.rom')}`,
          '06692159',
        ],
        [
          `${path.join('Patchable', 'Before.rom')} -> ${path.join('<input>', 'patchable', 'before.rom')}`,
          '0361b321',
        ],
        [
          `${path.join('Patchable', 'C01173E.rom')} -> ${path.join('<input>', 'patchable', 'C01173E.rom')}`,
          'dfaebe28',
        ],
        [
          `${path.join('Patchable', 'KDULVQN.rom')} -> ${path.join('<input>', 'patchable', 'KDULVQN.rom')}`,
          'b1c303e4',
        ],
        [
          `${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Fizzbuzz.nes')} -> ${path.join('<input>', 'raw', 'fizzbuzz.nes')}`,
          '370517b5',
        ],
        [
          `${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Foobar.lnx')} -> ${path.join('<input>', 'foobar.lnx')}`,
          'b22c9747',
        ],
        [
          `${path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.rom')} -> ${path.join('<input>', 'raw', 'loremipsum.rom')}`,
          '70856527',
        ],
        [
          `${path.join('smdb', 'Hardware Target Game Database', 'Patchable', '3708F2C.rom')} -> ${path.join('<input>', 'patchable', '3708F2C.rom')}`,
          '20891c9f',
        ],
        [
          `${path.join('smdb', 'Hardware Target Game Database', 'Patchable', '65D1206.rom')} -> ${path.join('<input>', 'patchable', '65D1206.rom')}`,
          '20323455',
        ],
        [
          `${path.join('smdb', 'Hardware Target Game Database', 'Patchable', 'C01173E.rom')} -> ${path.join('<input>', 'patchable', 'C01173E.rom')}`,
          'dfaebe28',
        ],
      ]);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy, extract, patch, remove headers, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy', 'extract', 'test'],
        dat: [path.join(inputTemp, 'dats', '*')],
        input: [path.join(inputTemp, 'roms')],
        inputChecksumMin: ChecksumBitmaskInverted[ChecksumBitmask.MD5].toLowerCase(),
        patch: [path.join(inputTemp, 'patches')],
        output: outputTemp,
        dirDatName: true,
        dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
        removeHeaders: [''], // all
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [path.join('Headered', 'allpads.nes'), '6339abe6'],
        [path.join('Headered', 'color_test.nes'), 'c9c1b7aa'], // no header
        [path.join('Headered', 'diagnostic_test_cartridge.a78'), 'a1eaa7c1'],
        [path.join('Headered', 'fds_joypad_test.fds'), '3ecbac61'],
        [path.join('Headered', 'LCDTestROM.lyx'), '42583855'],
        [path.join('Headered', 'speed_test_v51.sfc'), '8beffd94'],
        [path.join('Headerless', 'allpads.nes'), '6339abe6'],
        [path.join('Headerless', 'color_test.nes'), 'c9c1b7aa'],
        [path.join('Headerless', 'diagnostic_test_cartridge.a78'), 'a1eaa7c1'],
        [path.join('Headerless', 'fds_joypad_test.fds'), '3ecbac61'],
        [path.join('Headerless', 'LCDTestROM.lyx'), '42583855'],
        [path.join('Headerless', 'speed_test_v51.sfc'), '8beffd94'],
        [path.join('One', 'Fizzbuzz.nes'), '370517b5'],
        [path.join('One', 'Foobar.lnx'), 'b22c9747'],
        [path.join('One', 'GameCube-240pSuite-1.19.iso'), '5eb3d183'],
        [`${path.join('One', 'Lorem Ipsum.zip')}|loremipsum.rom`, '70856527'],
        [path.join('One', 'One Three', 'One.rom'), 'f817a89f'],
        [path.join('One', 'One Three', 'Three.rom'), 'ff46c5d8'],
        [
          path.join('One', 'Optical Game (Disc 1)', 'Optical Game (Disc 1) (Track 1).bin'),
          '49ca35fb',
        ],
        [
          path.join('One', 'Optical Game (Disc 1)', 'Optical Game (Disc 1) (Track 2).bin'),
          '0316f720',
        ],
        [
          path.join('One', 'Optical Game (Disc 1)', 'Optical Game (Disc 1) (Track 3).bin'),
          'a320af40',
        ],
        [path.join('One', 'Optical Game (Disc 1)', 'Optical Game (Disc 1).cue'), '4ce39e73'],
        [path.join('One', 'Optical Game (Disc 2)', 'Optical Game (Disc 2).gdi'), 'f16f621c'],
        [path.join('One', 'Optical Game (Disc 2)', 'track01.bin'), '9796ed9a'],
        [path.join('One', 'Optical Game (Disc 2)', 'track02.raw'), 'abc178d5'],
        [path.join('One', 'Optical Game (Disc 2)', 'track03.bin'), '61a363f1'],
        [path.join('One', 'Optical Game (Disc 2)', 'track04.bin'), 'fc5ff5a0'],
        [`${path.join('One', 'Three Four Five', '2048')}|`, 'xxxxxxxx'], // hard disk
        [`${path.join('One', 'Three Four Five', '4096')}|`, 'xxxxxxxx'], // hard disk
        [path.join('One', 'Three Four Five', 'Five.rom'), '3e5daf67'],
        [path.join('One', 'Three Four Five', 'Four.rom'), '1cf3ca74'],
        [path.join('One', 'Three Four Five', 'Three.rom'), 'ff46c5d8'],
        [path.join('One', 'UMD.iso'), 'e90f7cf5'],
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
        [
          path.join('smdb', 'Hardware Target Game Database', 'Dummy', 'Lorem Ipsum.rom'),
          '70856527',
        ],
        [
          path.join('smdb', 'Hardware Target Game Database', 'Patchable', '3708F2C.rom'),
          '20891c9f',
        ],
        [
          path.join('smdb', 'Hardware Target Game Database', 'Patchable', '65D1206.rom'),
          '20323455',
        ],
        [
          path.join('smdb', 'Hardware Target Game Database', 'Patchable', '949F2B7.rom'),
          '95284ab4',
        ],
        [
          path.join('smdb', 'Hardware Target Game Database', 'Patchable', '9E66269.rom'),
          '8bb5cc63',
        ],
        [
          path.join('smdb', 'Hardware Target Game Database', 'Patchable', 'C01173E.rom'),
          'dfaebe28',
        ],
        [
          path.join('smdb', 'Hardware Target Game Database', 'Patchable', 'DFF7872-N64-SIMPLE.rom'),
          'caaaf550',
        ],
      ]);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should test without writing', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['test'],
        dat: [path.join(inputTemp, 'dats', '*')],
        input: [path.join(inputTemp, 'roms')],
        inputExclude: [path.join(inputTemp, 'roms', 'discs')], // test archive scanning + matching
        inputChecksumArchives:
          InputChecksumArchivesModeInverted[InputChecksumArchivesMode.NEVER].toLowerCase(),
        output: outputTemp,
        dirDatName: true,
        dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
        playlistExtensions: ['.cue', '.gdi', '.mdf', '.chd'],
        disableCache: true,
      });

      expect(result.outputFilesAndCrcs).toHaveLength(0);
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
        reportOutput: path.join(outputTemp, 'report.csv'),
      });

      expect(result.outputFilesAndCrcs).toHaveLength(1);
      expect(result.outputFilesAndCrcs[0][0]).toEqual('report.csv');
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  test.each(['copy', 'move', 'link'])('should %s, fixdat, and clean', async (command) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: [command, 'fixdat', 'clean'],
        dat: [path.join(inputTemp, 'dats', '*')],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
        dirDatName: true,
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
      });

      const writtenFixdats = result.outputFilesAndCrcs
        .map(([filePath]) => filePath)
        .filter((filePath) => filePath.endsWith('.dat'));

      expect(writtenFixdats).toHaveLength(3);

      // The "Headerless" DAT should have missing ROMs, because only headered versions exist them:
      //  diagnostic_test_cartridge.a78
      //  fds_joypad_test.fds
      //  LCDTestROM.lyx
      expect(writtenFixdats[0]).toMatch(/^Headerless fixdat \([0-9]{8}-[0-9]{6}\)\.dat$/);

      // The "One" DAT should have missing ROMs, because no fixture exists for them:
      //  Missing.rom
      // and because these archives don't have perfect entry path matches:
      //  Foobar
      //  Fizzbuzz
      //  Lorem Ipsum
      //  One Three
      //  Three Four Five
      //  Optical Game (Disc 1)
      //  Optical Game (Disc 2)
      //  UMD
      //  GameCube-240pSuite-1.19
      expect(writtenFixdats[1]).toMatch(/^One fixdat \([0-9]{8}-[0-9]{6}\)\.dat$/);

      // The "Patchable" DAT should have missing ROMs because some ROMs are only found in archives:
      //  Best.rom
      expect(writtenFixdats[2]).toMatch(/^Patchable fixdat \([0-9]{8}-[0-9]{6}\)\.dat$/);

      // Note: explicitly not testing `result.movedFiles`
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should fixdat and report', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['fixdat', 'report'],
        dat: [path.join(inputTemp, 'dats', '*')],
        input: [path.join(inputTemp, 'roms')],
        output: outputTemp,
        dirDatName: true,
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
        fixdatOutput: outputTemp,
        reportOutput: path.join(outputTemp, 'report.csv'),
      });

      const writtenFixdats = result.outputFilesAndCrcs
        .map(([filePath]) => filePath)
        .filter((filePath) => filePath.endsWith('.dat'));

      expect(writtenFixdats).toHaveLength(2);

      // The "Headerless" DAT should have missing ROMs, because only headered versions exist them:
      //  diagnostic_test_cartridge.a78
      //  fds_joypad_test.fds
      //  LCDTestROM.lyx
      expect(writtenFixdats[0]).toMatch(/^Headerless fixdat \([0-9]{8}-[0-9]{6}\)\.dat$/);

      // The "One" DAT should have missing ROMs, because no fixture exists for them:
      //  Missing.rom
      // and because these archives don't have perfect entry path matches:
      //  Foobar
      //  Fizzbuzz
      //  Lorem Ipsum
      //  One Three
      //  Three Four Five
      //  Optical Game (Disc 1)
      //  Optical Game (Disc 2)
      //  UMD
      //  GameCube-240pSuite-1.19
      expect(writtenFixdats[1]).toMatch(/^One fixdat \([0-9]{8}-[0-9]{6}\)\.dat$/);

      expect(result.movedFiles).toHaveLength(0);
      // Note: explicitly not testing `result.movedFiles`
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });
});

describe('with inferred DATs', () => {
  it('should copy, playlist, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy', 'test'],
        input: [path.join(inputTemp, 'roms')],
        inputExclude: [path.join(inputTemp, 'roms', 'discs')], // test archive scanning + matching
        output: outputTemp,
        dirLetter: true,
        dirLetterCount: 1,
        dirLetterLimit: 2,
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [path.join('#1', '0F09A40.rom'), '2f943e86'],
        [path.join('#1', '2048.chd|'), 'xxxxxxxx'], // hard disk
        [path.join('#2', '3708F2C.rom'), '20891c9f'],
        [path.join('#2', '4096.chd|'), 'xxxxxxxx'], // hard disk
        [path.join('#3', '612644F.rom'), 'f7591b29'],
        [path.join('#3', '65D1206.rom'), '20323455'],
        [path.join('#4', '92C85C9.rom'), '06692159'],
        [path.join('A', 'allpads.nes'), '9180a163'],
        [path.join('B', 'before.rom'), '0361b321'],
        [path.join('B', 'best.gz|best.rom'), '1e3d78cf'],
        [path.join('C1', 'C01173E.rom'), 'dfaebe28'],
        [path.join('C1', 'CD-ROM.chd|CD-ROM (Track 1).bin'), '49ca35fb'],
        [path.join('C1', 'CD-ROM.chd|CD-ROM (Track 2).bin'), '0316f720'],
        [path.join('C1', 'CD-ROM.chd|CD-ROM (Track 3).bin'), 'a320af40'],
        [path.join('C1', 'CD-ROM.chd|CD-ROM.cue'), 'xxxxxxxx'],
        [path.join('C2', 'color_test.nes'), 'c9c1b7aa'],
        [
          path.join('D', 'diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78'),
          'f6cc9b1c',
        ],
        [path.join('E', 'empty.rom'), '00000000'],
        [path.join('F1', 'fds_joypad_test.fds.zip|fds_joypad_test.fds'), '1e58456d'],
        [path.join('F1', 'five.rom'), '3e5daf67'],
        [`${path.join('F2', 'fizzbuzz.zip')}|fizzbuzz.nes`, '370517b5'],
        [`${path.join('F2', 'foobar.zip')}|foobar.lnx`, 'b22c9747'],
        [path.join('F3', 'four.rom'), '1cf3ca74'],
        [path.join('F3', 'fourfive.zip|five.rom'), '3e5daf67'],
        [path.join('F3', 'fourfive.zip|four.rom'), '1cf3ca74'],
        [path.join('G', 'GameCube-240pSuite-1.19.gcz|GameCube-240pSuite-1.19.iso'), '5eb3d183'],
        [`${path.join('G', 'GD-ROM.chd')}|GD-ROM.gdi`, 'f16f621c'],
        [`${path.join('G', 'GD-ROM.chd')}|track01.bin`, '9796ed9a'],
        [`${path.join('G', 'GD-ROM.chd')}|track02.raw`, 'abc178d5'],
        [`${path.join('G', 'GD-ROM.chd')}|track03.bin`, '61a363f1'],
        [`${path.join('G', 'GD-ROM.chd')}|track04.bin`, 'fc5ff5a0'],
        [path.join('I1', 'invalid.7z'), 'df941cc9'],
        [path.join('I1', 'invalid.rar'), 'df941cc9'],
        [path.join('I2', 'invalid.tar.gz'), 'df941cc9'],
        [path.join('I2', 'invalid.zip'), 'df941cc9'],
        [path.join('K', 'KDULVQN.rom'), 'b1c303e4'],
        [path.join('L', 'LCDTestROM.lnx.rar|LCDTestROM.lnx'), '2d251538'],
        [`${path.join('L', 'loremipsum.zip')}|loremipsum.rom`, '70856527'],
        [`${path.join('O', 'one.gz')}|one.rom`, 'f817a89f'],
        [`${path.join('O', 'onetwothree.zip')}|${path.join('1', 'one.rom')}`, 'f817a89f'],
        [`${path.join('O', 'onetwothree.zip')}|${path.join('2', 'two.rom')}`, '96170874'],
        [`${path.join('O', 'onetwothree.zip')}|${path.join('3', 'three.rom')}`, 'ff46c5d8'],
        [path.join('S', 'speed_test_v51.sfc.gz|speed_test_v51.sfc'), '8beffd94'],
        [path.join('S', 'speed_test_v51.smc'), '9adca6cc'],
        [`${path.join('T', 'three.gz')}|three.rom`, 'ff46c5d8'],
        [`${path.join('T', 'two.gz')}|two.rom`, '96170874'],
        [path.join('U', 'UMD.cso|UMD.iso'), 'e90f7cf5'],
        [`${path.join('U', 'unknown.zip')}|unknown.rom`, '377a7727'],
      ]);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should move to the same directory', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const inputDir = path.join(inputTemp, 'roms');
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
        inputExclude: [path.join(inputTemp, 'roms', 'discs')], // test archive scanning + matching
        output: outputTemp,
        dirGameSubdir: GameSubdirModeInverted[GameSubdirMode.MULTIPLE].toLowerCase(),
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
      });

      expect(result.outputFilesAndCrcs).toEqual([
        ['0F09A40.rom', '2f943e86'],
        ['2048.rom', 'd774f042'],
        ['3708F2C.rom', '20891c9f'],
        ['4096.rom', '2e19ca09'],
        ['612644F.rom', 'f7591b29'],
        ['65D1206.rom', '20323455'],
        ['92C85C9.rom', '06692159'],
        ['allpads.nes', '9180a163'],
        ['before.rom', '0361b321'],
        ['best.rom', '1e3d78cf'],
        ['C01173E.rom', 'dfaebe28'],
        ['color_test.nes', 'c9c1b7aa'],
        ['diagnostic_test_cartridge.a78', 'f6cc9b1c'],
        ['empty.rom', '00000000'],
        ['fds_joypad_test.fds', '1e58456d'],
        ['five.rom', '3e5daf67'],
        ['fizzbuzz.nes', '370517b5'],
        ['foobar.lnx', 'b22c9747'],
        ['four.rom', '1cf3ca74'],
        [path.join('fourfive', 'five.rom'), '3e5daf67'],
        [path.join('fourfive', 'four.rom'), '1cf3ca74'],
        ['GameCube-240pSuite-1.19.iso', '5eb3d183'],
        [path.join('GD-ROM', 'GD-ROM.gdi'), 'f16f621c'],
        [path.join('GD-ROM', 'track01.bin'), '9796ed9a'],
        [path.join('GD-ROM', 'track02.raw'), 'abc178d5'],
        [path.join('GD-ROM', 'track03.bin'), '61a363f1'],
        [path.join('GD-ROM', 'track04.bin'), 'fc5ff5a0'],
        ['invalid.7z', 'df941cc9'],
        ['invalid.rar', 'df941cc9'],
        ['invalid.tar.gz', 'df941cc9'],
        ['invalid.zip', 'df941cc9'],
        ['KDULVQN.rom', 'b1c303e4'],
        ['LCDTestROM.lnx', '2d251538'],
        ['loremipsum.rom', '70856527'],
        ['one.rom', 'f817a89f'],
        [path.join('onetwothree', '1', 'one.rom'), 'f817a89f'],
        [path.join('onetwothree', '2', 'two.rom'), '96170874'],
        [path.join('onetwothree', '3', 'three.rom'), 'ff46c5d8'],
        ['speed_test_v51.sfc', '8beffd94'],
        ['speed_test_v51.smc', '9adca6cc'],
        ['three.rom', 'ff46c5d8'],
        ['two.rom', '96170874'],
        ['UMD.iso', 'e90f7cf5'],
        ['unknown.rom', '377a7727'],
      ]);
      expect(result.movedFiles).toEqual([
        path.join('7z', 'invalid.7z'),
        path.join('chd', 'GD-ROM.chd'),
        path.join('cso', 'UMD.cso'),
        'empty.rom',
        'foobar.lnx',
        path.join('gcz', 'GameCube-240pSuite-1.19.gcz'),
        path.join('headered', 'LCDTestROM.lnx.rar'),
        path.join('headered', 'allpads.nes'),
        path.join('headered', 'color_test.nintendoentertainmentsystem'),
        path.join('headered', 'diagnostic_test_cartridge.a78.7z'),
        path.join('headered', 'fds_joypad_test.fds.zip'),
        path.join('headered', 'speed_test_v51.smc'),
        path.join('headerless', 'speed_test_v51.sfc.gz'),
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
      ]);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should copy, zip, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['copy', 'zip', 'test'],
        input: [path.join(inputTemp, 'roms')],
        inputExclude: [
          // Note: need to exclude some ROMs to prevent duplicate output paths
          path.join(inputTemp, 'roms', 'headerless'), // de-conflict headered & headerless
        ],
        output: outputTemp,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        ['0F09A40.zip|0F09A40.rom', '2f943e86'],
        ['2048.zip|2048.rom', 'd774f042'],
        ['3708F2C.zip|3708F2C.rom', '20891c9f'],
        ['4096.zip|4096.rom', '2e19ca09'],
        ['612644F.zip|612644F.rom', 'f7591b29'],
        ['65D1206.zip|65D1206.rom', '20323455'],
        ['92C85C9.zip|92C85C9.rom', '06692159'],
        ['allpads.zip|allpads.nes', '9180a163'],
        ['before.zip|before.rom', '0361b321'],
        ['best.zip|best.rom', '1e3d78cf'],
        ['C01173E.zip|C01173E.rom', 'dfaebe28'],
        ['CD-ROM.zip|CD-ROM (Track 1).bin', '49ca35fb'],
        ['CD-ROM.zip|CD-ROM (Track 2).bin', '0316f720'],
        ['CD-ROM.zip|CD-ROM (Track 3).bin', 'a320af40'],
        ['CD-ROM.zip|CD-ROM.cue', '4ce39e73'],
        ['color_test.zip|color_test.nintendoentertainmentsystem', 'c9c1b7aa'],
        ['diagnostic_test_cartridge.a78.zip|diagnostic_test_cartridge.a78', 'f6cc9b1c'],
        ['empty.zip|empty.rom', '00000000'],
        ['fds_joypad_test.fds.zip|fds_joypad_test.fds', '1e58456d'],
        ['five.zip|five.rom', '3e5daf67'],
        ['fizzbuzz.zip|fizzbuzz.nes', '370517b5'],
        ['foobar.zip|foobar.lnx', 'b22c9747'],
        ['four.zip|four.rom', '1cf3ca74'],
        ['fourfive.zip|five.rom', '3e5daf67'],
        ['fourfive.zip|four.rom', '1cf3ca74'],
        ['GameCube-240pSuite-1.19.zip|GameCube-240pSuite-1.19.iso', '5eb3d183'],
        ['GD-ROM.zip|GD-ROM.gdi', 'f16f621c'],
        ['GD-ROM.zip|track01.bin', '9796ed9a'],
        ['GD-ROM.zip|track02.raw', 'abc178d5'],
        ['GD-ROM.zip|track03.bin', '61a363f1'],
        ['GD-ROM.zip|track04.bin', 'fc5ff5a0'],
        ['invalid.zip|invalid.7z', 'df941cc9'],
        ['invalid.zip|invalid.rar', 'df941cc9'],
        ['invalid.zip|invalid.tar.gz', 'df941cc9'],
        ['invalid.zip|invalid.zip', 'df941cc9'],
        ['KDULVQN.zip|KDULVQN.rom', 'b1c303e4'],
        ['LCDTestROM.lnx.zip|LCDTestROM.lnx', '2d251538'],
        ['loremipsum.zip|loremipsum.rom', '70856527'],
        ['one.zip|one.rom', 'f817a89f'],
        [`onetwothree.zip|${path.join('1', 'one.rom')}`, 'f817a89f'],
        [`onetwothree.zip|${path.join('2', 'two.rom')}`, '96170874'],
        [`onetwothree.zip|${path.join('3', 'three.rom')}`, 'ff46c5d8'],
        ['speed_test_v51.zip|speed_test_v51.smc', '9adca6cc'],
        ['three.zip|three.rom', 'ff46c5d8'],
        ['two.zip|two.rom', '96170874'],
        ['UMD.zip|UMD.iso', 'e90f7cf5'],
        ['unknown.zip|unknown.rom', '377a7727'],
      ]);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should relative symlink, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['link', 'test'],
        input: [path.join(inputTemp, 'roms')],
        inputExclude: [
          // Note: need to exclude some ROMs to prevent duplicate output paths
          path.join(inputTemp, 'roms', 'discs'), // de-conflict chd & discs
        ],
        output: outputTemp,
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
        symlink: true,
        symlinkRelative: true,
      });

      expect(result.outputFilesAndCrcs).toEqual([
        [
          `0F09A40.rom -> ${path.join('..', 'input', 'roms', 'patchable', '0F09A40.rom')}`,
          '2f943e86',
        ],
        [`2048.chd| -> ${path.join('..', 'input', 'roms', 'chd', '2048.chd|')}`, 'xxxxxxxx'], // hard disk
        [
          `3708F2C.rom -> ${path.join('..', 'input', 'roms', 'patchable', '3708F2C.rom')}`,
          '20891c9f',
        ],
        [`4096.chd| -> ${path.join('..', 'input', 'roms', 'chd', '4096.chd|')}`, 'xxxxxxxx'], // hard disk
        [
          `612644F.rom -> ${path.join('..', 'input', 'roms', 'patchable', '612644F.rom')}`,
          'f7591b29',
        ],
        [
          `65D1206.rom -> ${path.join('..', 'input', 'roms', 'patchable', '65D1206.rom')}`,
          '20323455',
        ],
        [
          `92C85C9.rom -> ${path.join('..', 'input', 'roms', 'patchable', '92C85C9.rom')}`,
          '06692159',
        ],
        [
          `allpads.nes -> ${path.join('..', 'input', 'roms', 'headered', 'allpads.nes')}`,
          '9180a163',
        ],
        [
          `before.rom -> ${path.join('..', 'input', 'roms', 'patchable', 'before.rom')}`,
          '0361b321',
        ],
        [
          `best.gz|best.rom -> ${path.join('..', 'input', 'roms', 'patchable', 'best.gz')}|best.rom`,
          '1e3d78cf',
        ],
        [
          `C01173E.rom -> ${path.join('..', 'input', 'roms', 'patchable', 'C01173E.rom')}`,
          'dfaebe28',
        ],
        [
          `CD-ROM.chd|CD-ROM (Track 1).bin -> ${path.join('..', 'input', 'roms', 'chd', 'CD-ROM.chd')}|CD-ROM (Track 1).bin`,
          '49ca35fb',
        ],
        [
          `CD-ROM.chd|CD-ROM (Track 2).bin -> ${path.join('..', 'input', 'roms', 'chd', 'CD-ROM.chd')}|CD-ROM (Track 2).bin`,
          '0316f720',
        ],
        [
          `CD-ROM.chd|CD-ROM (Track 3).bin -> ${path.join('..', 'input', 'roms', 'chd', 'CD-ROM.chd')}|CD-ROM (Track 3).bin`,
          'a320af40',
        ],
        [
          `CD-ROM.chd|CD-ROM.cue -> ${path.join('..', 'input', 'roms', 'chd', 'CD-ROM.chd')}|CD-ROM.cue`,
          'xxxxxxxx',
        ],
        [
          `color_test.nes -> ${path.join('..', 'input', 'roms', 'headered', 'color_test.nintendoentertainmentsystem')}`,
          'c9c1b7aa',
        ],
        [
          `diagnostic_test_cartridge.a78.7z|diagnostic_test_cartridge.a78 -> ${path.join('..', 'input', 'roms', 'headered', 'diagnostic_test_cartridge.a78.7z')}|diagnostic_test_cartridge.a78`,
          'f6cc9b1c',
        ],
        [`empty.rom -> ${path.join('..', 'input', 'roms', 'empty.rom')}`, '00000000'],
        [
          `fds_joypad_test.fds.zip|fds_joypad_test.fds -> ${path.join('..', 'input', 'roms', 'headered', 'fds_joypad_test.fds.zip')}|fds_joypad_test.fds`,
          '1e58456d',
        ],
        [`five.rom -> ${path.join('..', 'input', 'roms', 'raw', 'five.rom')}`, '3e5daf67'],
        [
          `fizzbuzz.zip|fizzbuzz.nes -> ${path.join('..', 'input', 'roms', 'fizzbuzz.zip')}|fizzbuzz.nes`,
          '370517b5',
        ],
        [
          `foobar.zip|foobar.lnx -> ${path.join('..', 'input', 'roms', 'zip', 'foobar.zip')}|foobar.lnx`,
          'b22c9747',
        ],
        [`four.rom -> ${path.join('..', 'input', 'roms', 'raw', 'four.rom')}`, '1cf3ca74'],
        [
          `fourfive.zip|five.rom -> ${path.join('..', 'input', 'roms', 'zip', 'fourfive.zip')}|five.rom`,
          '3e5daf67',
        ],
        [
          `fourfive.zip|four.rom -> ${path.join('..', 'input', 'roms', 'zip', 'fourfive.zip')}|four.rom`,
          '1cf3ca74',
        ],
        [
          `GameCube-240pSuite-1.19.gcz|GameCube-240pSuite-1.19.iso -> ${path.join('..', 'input', 'roms', 'gcz', 'GameCube-240pSuite-1.19.gcz')}|GameCube-240pSuite-1.19.iso`,
          '5eb3d183',
        ],
        [
          `GD-ROM.chd|GD-ROM.gdi -> ${path.join('..', 'input', 'roms', 'chd', 'GD-ROM.chd|GD-ROM.gdi')}`,
          'f16f621c',
        ],
        [
          `GD-ROM.chd|track01.bin -> ${path.join('..', 'input', 'roms', 'chd', 'GD-ROM.chd|track01.bin')}`,
          '9796ed9a',
        ],
        [
          `GD-ROM.chd|track02.raw -> ${path.join('..', 'input', 'roms', 'chd', 'GD-ROM.chd|track02.raw')}`,
          'abc178d5',
        ],
        [
          `GD-ROM.chd|track03.bin -> ${path.join('..', 'input', 'roms', 'chd', 'GD-ROM.chd|track03.bin')}`,
          '61a363f1',
        ],
        [
          `GD-ROM.chd|track04.bin -> ${path.join('..', 'input', 'roms', 'chd', 'GD-ROM.chd|track04.bin')}`,
          'fc5ff5a0',
        ],
        [`invalid.7z -> ${path.join('..', 'input', 'roms', '7z', 'invalid.7z')}`, 'df941cc9'],
        [`invalid.rar -> ${path.join('..', 'input', 'roms', '7z', 'invalid.7z')}`, 'df941cc9'],
        [`invalid.tar.gz -> ${path.join('..', 'input', 'roms', '7z', 'invalid.7z')}`, 'df941cc9'],
        [`invalid.zip -> ${path.join('..', 'input', 'roms', '7z', 'invalid.7z')}`, 'df941cc9'],
        [
          `KDULVQN.rom -> ${path.join('..', 'input', 'roms', 'patchable', 'KDULVQN.rom')}`,
          'b1c303e4',
        ],
        [
          `LCDTestROM.lnx.rar|LCDTestROM.lnx -> ${path.join('..', 'input', 'roms', 'headered', 'LCDTestROM.lnx.rar')}|LCDTestROM.lnx`,
          '2d251538',
        ],
        [
          `loremipsum.zip|loremipsum.rom -> ${path.join('..', 'input', 'roms', 'zip', 'loremipsum.zip')}|loremipsum.rom`,
          '70856527',
        ],
        [
          `one.gz|one.rom -> ${path.join('..', 'input', 'roms', 'gz', 'one.gz')}|one.rom`,
          'f817a89f',
        ],
        [
          `onetwothree.zip|${path.join('1', 'one.rom')} -> ${path.join('..', 'input', 'roms', 'zip', 'onetwothree.zip')}|${path.join('1', 'one.rom')}`,
          'f817a89f',
        ],
        [
          `onetwothree.zip|${path.join('2', 'two.rom')} -> ${path.join('..', 'input', 'roms', 'zip', 'onetwothree.zip')}|${path.join('2', 'two.rom')}`,
          '96170874',
        ],
        [
          `onetwothree.zip|${path.join('3', 'three.rom')} -> ${path.join('..', 'input', 'roms', 'zip', 'onetwothree.zip')}|${path.join('3', 'three.rom')}`,
          'ff46c5d8',
        ],
        [
          `speed_test_v51.sfc.gz|speed_test_v51.sfc -> ${path.join('..', 'input', 'roms', 'headerless', 'speed_test_v51.sfc.gz')}|speed_test_v51.sfc`,
          '8beffd94',
        ],
        [
          `speed_test_v51.smc -> ${path.join('..', 'input', 'roms', 'headered', 'speed_test_v51.smc')}`,
          '9adca6cc',
        ],
        [
          `three.gz|three.rom -> ${path.join('..', 'input', 'roms', 'gz', 'three.gz')}|three.rom`,
          'ff46c5d8',
        ],
        [
          `two.gz|two.rom -> ${path.join('..', 'input', 'roms', 'gz', 'two.gz')}|two.rom`,
          '96170874',
        ],
        [
          `UMD.cso|UMD.iso -> ${path.join('..', 'input', 'roms', 'cso', 'UMD.cso')}|UMD.iso`,
          'e90f7cf5',
        ],
        [
          `unknown.zip|unknown.rom -> ${path.join('..', 'input', 'roms', 'zip', 'unknown.zip')}|unknown.rom`,
          '377a7727',
        ],
      ]);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should move, extract, remove headers, and test', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['move', 'extract', 'test'],
        input: [path.join(inputTemp, 'roms', 'headered')],
        output: outputTemp,
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
        removeHeaders: [''], // all
      });

      expect(result.outputFilesAndCrcs).toEqual([
        ['allpads.nes', '6339abe6'],
        ['color_test.nes', 'c9c1b7aa'], // no header
        ['diagnostic_test_cartridge.a78', 'a1eaa7c1'],
        ['fds_joypad_test.fds', '3ecbac61'],
        ['LCDTestROM.lyx', '42583855'],
        ['speed_test_v51.sfc', '8beffd94'],
      ]);
      expect(result.movedFiles).toEqual([
        'LCDTestROM.lnx.rar',
        'allpads.nes',
        'color_test.nintendoentertainmentsystem',
        'diagnostic_test_cartridge.a78.7z',
        'fds_joypad_test.fds.zip',
        'speed_test_v51.smc',
      ]);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should test without writing', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['test'],
        input: [path.join(inputTemp, 'roms')],
        inputExclude: [
          // Note: need to exclude some ROMs to prevent duplicate output paths
          path.join(inputTemp, 'roms', 'discs'), // de-conflict chd & discs
          path.join(inputTemp, 'roms', 'nkit'), // will throw an error, preventing everything
        ],
        output: outputTemp,
        dirDatName: true,
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
        dir2datOutput: outputTemp,
      });

      expect(result.outputFilesAndCrcs).toHaveLength(0);
      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });

  it('should dir2dat', async () => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: ['dir2dat'],
        input: [path.join(inputTemp, 'roms')],
        inputExclude: [
          // Note: need to exclude some ROMs to prevent duplicate output paths
          path.join(inputTemp, 'roms', 'discs'), // de-conflict chd & discs
          path.join(inputTemp, 'roms', 'nkit'), // will throw an error, preventing everything
        ],
        output: outputTemp,
        dirDatName: true,
        fixExtension: FixExtensionInverted[FixExtension.AUTO].toLowerCase(),
        dir2datOutput: outputTemp,
      });

      expect(result.outputFilesAndCrcs).toHaveLength(1);
      const writtenDir2Dats = result.outputFilesAndCrcs
        .map(([filePath]) => filePath)
        .filter((filePath) => filePath.endsWith('.dat'));

      // Only the "roms" input path was provided
      expect(writtenDir2Dats).toHaveLength(1);
      expect(writtenDir2Dats[0]).toMatch(/^roms dir2dat \([0-9]{8}-[0-9]{6}\)\.dat$/);

      expect(result.movedFiles).toHaveLength(0);
      expect(result.cleanedFiles).toHaveLength(0);

      const dats = await new DATScanner(
        new Options({ dat: writtenDir2Dats.map((datPath) => path.join(outputTemp, datPath)) }),
        new ProgressBarFake(),
        new FileFactory(new FileCache(), LOGGER),
      ).scan();
      expect(dats).toHaveLength(1);
      const roms = dats[0]
        .getGames()
        .flatMap((game) => game.getRoms())
        .map((rom) => rom.getName())
        .reduce(ArrayPoly.reduceUnique(), [])
        .sort();
      expect(roms).toEqual([
        '0F09A40.rom',
        '1/one.rom',
        '2/two.rom',
        '2048.rom',
        '3/three.rom',
        '3708F2C.rom',
        '4096.rom',
        '612644F.rom',
        '65D1206.rom',
        '92C85C9.rom',
        'C01173E.rom',
        'CD-ROM (Track 1).bin',
        'CD-ROM (Track 2).bin',
        'CD-ROM (Track 3).bin',
        'CD-ROM.cue',
        'GD-ROM.gdi',
        'GameCube-240pSuite-1.19.iso',
        'KDULVQN.rom',
        'LCDTestROM.lnx',
        'UMD.iso',
        'allpads.nes',
        'before.rom',
        'best.rom',
        'color_test.nes',
        'diagnostic_test_cartridge.a78',
        'fds_joypad_test.fds',
        'five.rom',
        'fizzbuzz.nes',
        'foobar.lnx',
        'four.rom',
        'invalid.7z',
        'invalid.rar',
        'invalid.tar.gz',
        'invalid.zip',
        'loremipsum.rom',
        'one.rom',
        'speed_test_v51.sfc',
        'speed_test_v51.smc',
        'three.rom',
        'track01.bin',
        'track02.raw',
        'track03.bin',
        'track04.bin',
        'two.rom',
        'unknown.rom',
      ]);
    });
  });

  test.each(['copy', 'move', 'link'])('should %s, dir2dat, and clean', async (command) => {
    await copyFixturesToTemp(async (inputTemp, outputTemp) => {
      const result = await runIgir({
        commands: [command, 'dir2dat', 'clean'],
        dat: [path.join(inputTemp, 'dats')],
        input: [path.join(inputTemp, 'roms')],
        // TODO(cemmer): debug why this is failing candidate validation
        inputExclude: [path.join(inputTemp, 'roms', 'discs')],
        output: outputTemp,
        dirDatName: true,
        dir2datOutput: outputTemp,
      });

      const writtenDir2Dats = result.outputFilesAndCrcs
        .map(([filePath]) => filePath)
        .filter((filePath) => filePath.endsWith('.dat'));

      // Only the "roms" input path was provided
      expect(writtenDir2Dats).toHaveLength(1);
      expect(writtenDir2Dats[0]).toMatch(/^roms dir2dat \([0-9]{8}-[0-9]{6}\)\.dat$/);

      // Note: explicitly not testing `result.movedFiles`
      expect(result.cleanedFiles).toHaveLength(0);
    });
  });
});
