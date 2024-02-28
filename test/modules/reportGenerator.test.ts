import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import Constants from '../../src/constants.js';
import ReportGenerator from '../../src/modules/reportGenerator.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import Game from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import Parent from '../../src/types/dats/parent.js';
import ROM from '../../src/types/dats/rom.js';
import DATStatus from '../../src/types/datStatus.js';
import File from '../../src/types/files/file.js';
import Options, { OptionsProps } from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';
import ROMWithFiles from '../../src/types/romWithFiles.js';
import ProgressBarFake from '../console/progressBarFake.js';

/**
 * NOTE(cemmer): statusGenerator.test.ts has more complicated tests per-DATStatus, this file is to
 *  test the interaction of combining multiple DATStatus.
 */

const datStatusEmpty = new DATStatus(
  new LogiqxDAT(new Header({ name: 'Empty' }), []),
  new Options(),
  new Map(),
);

const gamesSingle = [
  new Game({
    name: 'One',
    rom: [new ROM({ name: 'One', size: 123, crc: 'abcdef01' })],
  }),
];
async function buildDatStatusSingle(): Promise<DATStatus> {
  const entries = await Promise.all(
    gamesSingle.map(async (game): Promise<[Parent, ReleaseCandidate[]]> => [
      new Parent(game),
      [new ReleaseCandidate(
        game,
        undefined,
        await Promise.all(game.getRoms().map(async (rom) => {
          const romFile = await File.fileOf(`${rom.getName()}.rom`);
          return new ROMWithFiles(rom, romFile, romFile);
        })),
      )],
    ]),
  );
  const parentsToReleaseCandidates = new Map<Parent, ReleaseCandidate[]>(entries);
  return new DATStatus(
    new LogiqxDAT(new Header({ name: 'Single' }), gamesSingle),
    new Options(),
    parentsToReleaseCandidates,
  );
}

const gamesMultiple = [
  new Game({
    name: 'Two',
    rom: [new ROM({ name: 'Two', size: 234, crc: 'bcdef012' })],
  }),
  new Game({
    name: 'Three',
    rom: [new ROM({ name: 'Three', size: 345, crc: 'cdef0123' })],
  }),
  new Game({
    name: 'Four',
    rom: [new ROM({ name: 'Four', size: 456, crc: 'def01234' })],
  }),
  new Game({
    name: 'Five',
    rom: [],
  }),
];
async function buildDatStatusMultiple(): Promise<DATStatus> {
  const entries = await Promise.all(
    gamesMultiple.map(async (game): Promise<[Parent, ReleaseCandidate[]]> => [
      new Parent(game),
      [new ReleaseCandidate(
        game,
        undefined,
        await Promise.all(game.getRoms().map(async (rom) => {
          const romFile = await File.fileOf(`${rom.getName()}.rom`);
          return new ROMWithFiles(rom, romFile, romFile);
        })),
      )],
    ]),
  );
  const parentsToReleaseCandidates = new Map<Parent, ReleaseCandidate[]>(entries);
  return new DATStatus(
    new LogiqxDAT(new Header({ name: 'Multiple' }), gamesMultiple),
    new Options(),
    parentsToReleaseCandidates,
  );
}

async function wrapReportGenerator(
  optionsProps: OptionsProps,
  romFiles: string[],
  cleanedOutputFiles: string[],
  datStatuses: DATStatus[],
  callback: (contents: string) => void | Promise<void>,
): Promise<void> {
  const reportOutput = await fsPoly.mktemp(path.join(Constants.GLOBAL_TEMP_DIR, 'report.csv'));
  const options = new Options({
    ...optionsProps,
    reportOutput,
  });

  await new ReportGenerator(options, new ProgressBarFake())
    .generate(romFiles, cleanedOutputFiles, datStatuses);

  const contents = (await util.promisify(fs.readFile)(reportOutput)).toString();
  await callback(contents);

  await fsPoly.rm(reportOutput);
}

it('should return empty contents for an empty DAT', async () => {
  await wrapReportGenerator(new Options(), [], [], [datStatusEmpty], (contents) => {
    expect(contents).toEqual('');
  });
});

it('should return one row for every game in a single game DAT', async () => {
  await wrapReportGenerator(new Options(), [], [], [await buildDatStatusSingle()], (contents) => {
    expect(contents).toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
Single,One,FOUND,One.rom,false,false,true,false,false,false,false,false,false,false,false,false,false`);
  });
});

it('should return one row for every game in a multiple game DAT', async () => {
  await wrapReportGenerator(new Options(), [], [], [await buildDatStatusMultiple()], (contents) => {
    expect(contents).toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
Multiple,Five,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Four,FOUND,Four.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Three,FOUND,Three.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Two,FOUND,Two.rom,false,false,true,false,false,false,false,false,false,false,false,false,false`);
  });
});

it('should return one row for every unused file in a multiple game DAT', async () => {
  await wrapReportGenerator(new Options(), [
    'One.rom',
    'Two.rom',
    'Three.rom',
    'Four.rom',
  ], [], [await buildDatStatusMultiple()], (contents) => {
    expect(contents).toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
Multiple,Five,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Four,FOUND,Four.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Three,FOUND,Three.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Two,FOUND,Two.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
,,UNUSED,One.rom,false,false,false,false,false,false,false,false,false,false,false,false,false`);
  });
});

it('should return one row for every cleaned file in a multiple game DAT', async () => {
  await wrapReportGenerator(
    new Options(),
    ['One.rom', 'Two.rom'],
    ['Three.rom', 'Four.rom'],
    [await buildDatStatusMultiple()],
    (contents) => {
      expect(contents).toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
Multiple,Five,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Four,FOUND,Four.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Three,FOUND,Three.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Two,FOUND,Two.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
,,UNUSED,One.rom,false,false,false,false,false,false,false,false,false,false,false,false,false
,,DELETED,Three.rom,false,false,false,false,false,false,false,false,false,false,false,false,false
,,DELETED,Four.rom,false,false,false,false,false,false,false,false,false,false,false,false,false`);
    },
  );
});

it('should return one row for every game in multiple DATs', async () => {
  await wrapReportGenerator(new Options(), [], [], [
    datStatusEmpty,
    await buildDatStatusSingle(),
    await buildDatStatusMultiple(),
  ], (contents) => {
    expect(contents).toEqual(`DAT Name,Game Name,Status,ROM Files,Patched,BIOS,Retail Release,Unlicensed,Debug,Demo,Beta,Sample,Prototype,Program,Aftermarket,Homebrew,Bad
Multiple,Five,FOUND,,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Four,FOUND,Four.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Three,FOUND,Three.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
Multiple,Two,FOUND,Two.rom,false,false,true,false,false,false,false,false,false,false,false,false,false
Single,One,FOUND,One.rom,false,false,true,false,false,false,false,false,false,false,false,false,false`);
  });
});
