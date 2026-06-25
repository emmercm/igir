import path from 'node:path';

import Temp from '../../src/globals/temp.js';
import Game from '../../src/models/dats/game.js';
import Header from '../../src/models/dats/logiqx/header.js';
import LogiqxDAT from '../../src/models/dats/logiqx/logiqxDat.js';
import ROM from '../../src/models/dats/rom.js';
import DATStatus from '../../src/models/datStatus.js';
import File from '../../src/models/files/file.js';
import type { OptionsProps } from '../../src/models/options.js';
import Options from '../../src/models/options.js';
import ROMWithFiles from '../../src/models/romWithFiles.js';
import WriteCandidate from '../../src/models/writeCandidate.js';
import ReportGenerator from '../../src/modules/reportGenerator.js';
import FsUtil from '../../src/utils/fsUtil.js';
import ProgressBarFake from '../console/progressBarFake.js';

/**
 * NOTE(cemmer): statusGenerator.test.ts has more complicated tests per-DATStatus, this file is to
 *  test the interaction of combining multiple DATStatus.
 */

const datStatusEmpty = new DATStatus(
  new Options(),
  new LogiqxDAT({ header: new Header({ name: 'Empty' }) }),
  [],
);

const gamesSingle = [
  new Game({
    name: 'One',
    roms: [new ROM({ name: 'One.rom', size: 123, crc32: 'abcdef01' })],
  }),
];
async function buildDatStatusSingle(): Promise<DATStatus> {
  const candidates = await Promise.all(
    gamesSingle.map(
      async (game) =>
        new WriteCandidate(
          game,
          await Promise.all(
            game.getRoms().map(async (rom) => {
              const romFile = await rom.toFile();
              return new ROMWithFiles(rom, romFile, romFile);
            }),
          ),
        ),
    ),
  );
  return new DATStatus(
    new Options(),
    new LogiqxDAT({ header: new Header({ name: 'Single' }), games: gamesSingle }),
    candidates,
  );
}

const gamesMultiple = [
  new Game({
    name: 'Two',
    roms: [new ROM({ name: 'Two.rom', size: 234, crc32: 'bcdef012' })],
  }),
  new Game({
    name: 'Three',
    roms: [new ROM({ name: 'Three.rom', size: 345, crc32: 'cdef0123' })],
  }),
  new Game({
    name: 'Four',
    roms: [new ROM({ name: 'Four.rom', size: 456, crc32: 'def01234' })],
  }),
  new Game({
    name: 'Five',
    roms: [],
  }),
];
async function buildDatStatusMultiple(): Promise<DATStatus> {
  const candidates = await Promise.all(
    gamesMultiple.map(
      async (game) =>
        new WriteCandidate(
          game,
          await Promise.all(
            game.getRoms().map(async (rom) => {
              const romFile = await rom.toFile();
              return new ROMWithFiles(rom, romFile, romFile);
            }),
          ),
        ),
    ),
  );
  return new DATStatus(
    new Options(),
    new LogiqxDAT({ header: new Header({ name: 'Multiple' }), games: gamesMultiple }),
    candidates,
  );
}

async function wrapReportGenerator(
  optionsProps: OptionsProps,
  romFiles: File[],
  cleanedOutputFiles: string[],
  datStatuses: DATStatus[],
  callback: (contents: string) => void | Promise<void>,
): Promise<void> {
  const reportOutput = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'report.csv'));
  const options = new Options({
    ...optionsProps,
    reportOutput,
  });

  await new ReportGenerator(options, new ProgressBarFake()).generate(
    romFiles,
    cleanedOutputFiles,
    datStatuses,
  );

  try {
    const contents = (await FsUtil.readFile(reportOutput)).toString();
    await callback(contents);
  } finally {
    await FsUtil.rm(reportOutput);
  }
}

it('should return empty contents for an empty DAT', async () => {
  await wrapReportGenerator(new Options(), [], [], [datStatusEmpty], (contents) => {
    expect(contents).toEqual('');
  });
});

it('should return one row for every game in a single game DAT', async () => {
  await wrapReportGenerator(new Options(), [], [], [await buildDatStatusSingle()], (contents) => {
    expect(contents)
      .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
Single,One,FOUND,${path.resolve('One.rom')},false,false,true,false,false,false,false,false,false,false,false,false,false`);
  });
});

it('should return one row for every game in a multiple game DAT', async () => {
  await wrapReportGenerator(new Options(), [], [], [await buildDatStatusMultiple()], (contents) => {
    expect(contents)
      .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
Multiple,Five,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Four,FOUND,${path.resolve('Four.rom')},false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Three,FOUND,${path.resolve('Three.rom')},false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Two,FOUND,${path.resolve('Two.rom')},false,false,true,false,false,false,false,false,false,false,false,false,false`);
  });
});

it('should return one row for every duplicate and unused file in a multiple game DAT', async () => {
  await wrapReportGenerator(
    new Options(),
    [
      await File.fileOf({ filePath: 'One.rom', size: 123, crc32: 'abcdef01' }),
      await File.fileOf({ filePath: 'One (Duplicate).rom', size: 123, crc32: 'abcdef01' }),
      await File.fileOf({ filePath: 'Two (Duplicate).rom', size: 234, crc32: 'bcdef012' }),
      await File.fileOf({ filePath: 'Two.rom', size: 234, crc32: 'bcdef012' }),
      await File.fileOf({ filePath: 'Three.rom', size: 345, crc32: 'cdef0123' }),
      await File.fileOf({ filePath: 'Four.rom', size: 456, crc32: 'def01234' }),
      await File.fileOf({ filePath: 'Four (Duplicate).rom', size: 456, crc32: 'def01234' }),
      await File.fileOf({ filePath: 'Five.rom', size: 567, crc32: 'ef012345' }),
    ],
    [],
    [await buildDatStatusMultiple()],
    (contents) => {
      expect(contents)
        .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
Multiple,Five,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Four,FOUND,${path.resolve('Four.rom')},false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Three,FOUND,${path.resolve('Three.rom')},false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Two,FOUND,${path.resolve('Two.rom')},false,false,true,false,false,false,false,false,false,false,false,false,false
,,DUPLICATE,${path.resolve('Four (Duplicate).rom')},false,false,false,false,false,false,false,false,false,false,false,false,false
,,DUPLICATE,${path.resolve('Two (Duplicate).rom')},false,false,false,false,false,false,false,false,false,false,false,false,false
,,UNUSED,${path.resolve('Five.rom')},false,false,false,false,false,false,false,false,false,false,false,false,false
,,UNUSED,${path.resolve('One (Duplicate).rom')},false,false,false,false,false,false,false,false,false,false,false,false,false
,,UNUSED,${path.resolve('One.rom')},false,false,false,false,false,false,false,false,false,false,false,false,false`);
    },
  );
});

it('should return one row for every cleaned file in a multiple game DAT', async () => {
  await wrapReportGenerator(
    new Options(),
    [
      await File.fileOf({ filePath: 'One.rom', size: 123, crc32: 'abcdef01' }),
      await File.fileOf({ filePath: 'Two.rom', size: 234, crc32: 'bcdef012' }),
    ],
    ['Three.rom', 'Four.rom'],
    [await buildDatStatusMultiple()],
    (contents) => {
      expect(contents)
        .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
Multiple,Five,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Four,FOUND,${path.resolve('Four.rom')},false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Three,FOUND,${path.resolve('Three.rom')},false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Two,FOUND,${path.resolve('Two.rom')},false,false,true,false,false,false,false,false,false,false,false,false,false
,,UNUSED,${path.resolve('One.rom')},false,false,false,false,false,false,false,false,false,false,false,false,false
,,DELETED,Three.rom,false,false,false,false,false,false,false,false,false,false,false,false,false
,,DELETED,Four.rom,false,false,false,false,false,false,false,false,false,false,false,false,false`);
    },
  );
});

it('should return one row for every game in multiple DATs', async () => {
  await wrapReportGenerator(
    new Options(),
    [],
    [],
    [datStatusEmpty, await buildDatStatusSingle(), await buildDatStatusMultiple()],
    (contents) => {
      expect(contents)
        .toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
Multiple,Five,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Four,FOUND,${path.resolve('Four.rom')},false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Three,FOUND,${path.resolve('Three.rom')},false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Two,FOUND,${path.resolve('Two.rom')},false,false,true,false,false,false,false,false,false,false,false,false,false
Single,One,FOUND,${path.resolve('One.rom')},false,false,true,false,false,false,false,false,false,false,false,false,false`);
    },
  );
});
